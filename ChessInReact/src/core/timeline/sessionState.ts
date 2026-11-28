/**
 * The complete state of a match at one committed moment, and compact differences between two
 * moments. Differences are produced from the authoritative state, so reconstruction never
 * re-runs rules or reads notation, and works for every variant.
 */
import { IDomainState } from '../state/gameState';
import { IOfficialSpellState } from '../../engine/variants/spells/OfficialSpellEngine';
import { ISpellGameState } from '../../analysis/minigames/SpellChessEngine';
import { IDuckChessState } from '../../analysis/minigames/DuckChessEngine';

export interface IVariantSessionState {
  readonly officialSpellState: IOfficialSpellState | null;
  readonly expandedSpellState: ISpellGameState | null;
  readonly duckState: IDuckChessState | null;
  readonly threeCheckState: unknown;
  readonly racingKingsState: unknown;
  readonly scoresState: unknown;
  readonly turnCycleState: unknown;
  readonly hasCastSpellThisTurn: boolean;
  readonly lastMoveSummary: string | null;
}

export interface ISessionState {
  readonly domain: IDomainState;
  readonly variant: IVariantSessionState;
}

interface IRecordPatch {
  readonly set?: Record<string, unknown>;
  readonly removed?: string[];
}

export interface ISessionDelta {
  readonly entities?: IRecordPatch;
  readonly occupancy?: IRecordPatch;
  /** Other top-level domain fields that changed. */
  readonly domain?: Record<string, unknown>;
  /** turnState without the repetition history, when it changed. */
  readonly turn?: Record<string, unknown>;
  /** The repetition history only grows or is cut back, so only the difference is kept. */
  readonly positions?: { readonly keep: number; readonly push: string[] };
  readonly variant?: Partial<Record<keyof IVariantSessionState, unknown>>;
}

const clone = <T>(value: T): T => (value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T));
const same = (a: unknown, b: unknown): boolean => a === b || JSON.stringify(a) === JSON.stringify(b);

/** A detached deep copy: later mutations of the live state cannot reach a stored snapshot. */
export const snapshotSession = (state: ISessionState): ISessionState => clone(state);

function diffRecord(before: Record<string, unknown>, after: Record<string, unknown>): IRecordPatch | undefined {
  const set: Record<string, unknown> = {};
  const removed: string[] = [];
  for (const key of Object.keys(after)) {
    if (after[key] !== undefined && !same(before[key], after[key])) set[key] = clone(after[key]);
  }
  for (const key of Object.keys(before)) if (after[key] === undefined) removed.push(key);
  if (!Object.keys(set).length && !removed.length) return undefined;
  return { ...(Object.keys(set).length ? { set } : {}), ...(removed.length ? { removed } : {}) };
}

export function diffSession(before: ISessionState, after: ISessionState): ISessionDelta {
  const delta: { -readonly [K in keyof ISessionDelta]: ISessionDelta[K] } = {};
  const entities = diffRecord(before.domain.boardEntities, after.domain.boardEntities);
  if (entities) delta.entities = entities;
  const occupancy = diffRecord(before.domain.occupancy, after.domain.occupancy);
  if (occupancy) delta.occupancy = occupancy;

  const domain: Record<string, unknown> = {};
  const beforeDomain = before.domain as unknown as Record<string, unknown>;
  const afterDomain = after.domain as unknown as Record<string, unknown>;
  for (const key of new Set([...Object.keys(beforeDomain), ...Object.keys(afterDomain)])) {
    if (key === 'boardEntities' || key === 'occupancy' || key === 'turnState') continue;
    if (!same(beforeDomain[key], afterDomain[key])) domain[key] = clone(afterDomain[key]) ?? null;
  }
  if (Object.keys(domain).length) delta.domain = domain;

  const { positionHistory: oldHistory = [], ...oldTurn } = before.domain.turnState ?? {};
  const { positionHistory: newHistory = [], ...newTurn } = after.domain.turnState ?? {};
  if (!same(oldTurn, newTurn)) delta.turn = clone(newTurn) as Record<string, unknown>;
  let keep = 0;
  while (keep < oldHistory.length && keep < newHistory.length && oldHistory[keep] === newHistory[keep]) keep++;
  if (keep !== oldHistory.length || keep !== newHistory.length) {
    delta.positions = { keep, push: newHistory.slice(keep) };
  }

  const variant: Record<string, unknown> = {};
  for (const key of Object.keys(after.variant) as Array<keyof IVariantSessionState>) {
    if (!same(before.variant[key], after.variant[key])) variant[key] = clone(after.variant[key]);
  }
  if (Object.keys(variant).length) delta.variant = variant;
  return delta;
}

export const isEmptyDelta = (delta: ISessionDelta): boolean => Object.keys(delta).length === 0;

function patchRecord<T>(record: T, patch: IRecordPatch | undefined): T {
  if (!patch) return record;
  const next = { ...(record as unknown as Record<string, unknown>), ...(patch.set ?? {}) };
  for (const key of patch.removed ?? []) delete next[key];
  return next as unknown as T;
}

/** Returns a new state. Untouched objects are shared, and nothing is ever mutated in place. */
export function applyDelta(state: ISessionState, delta: ISessionDelta): ISessionState {
  const history = state.domain.turnState?.positionHistory ?? [];
  const turn = delta.turn ?? state.domain.turnState;
  const positions = delta.positions
    ? [...history.slice(0, delta.positions.keep), ...delta.positions.push]
    : history;
  return {
    domain: {
      ...state.domain,
      ...(delta.domain ?? {}),
      boardEntities: patchRecord(state.domain.boardEntities, delta.entities),
      occupancy: patchRecord(state.domain.occupancy, delta.occupancy),
      turnState: { ...(turn as IDomainState['turnState']), positionHistory: positions },
    } as IDomainState,
    variant: { ...state.variant, ...(delta.variant ?? {}) } as IVariantSessionState,
  };
}

/** Order-independent fingerprint of what the players see; used to detect corrupted saves. */
export function boardChecksum(state: ISessionState): string {
  const pieces = Object.entries(state.domain.occupancy)
    .map(([coord, id]) => {
      const entity = state.domain.boardEntities[id] as { variantId?: string; ownerId?: string } | undefined;
      return `${coord}:${entity?.ownerId ?? ''}:${entity?.variantId ?? ''}`;
    })
    .sort()
    .join(';');
  const text = `${pieces}|${state.domain.activePlayer}|${state.domain.isGameOver}|${state.domain.winnerId}|` +
    `${JSON.stringify(state.variant.officialSpellState?.whiteCharges ?? null)}|` +
    JSON.stringify(state.variant.officialSpellState?.blackCharges ?? null);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return (hash >>> 0).toString(16);
}
