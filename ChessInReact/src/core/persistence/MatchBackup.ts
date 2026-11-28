/** Portable match files: a validated structured backup and a PGN view of the same history. */
import { toAlgebraic } from '../../engine/rules/utils/CoordinateHelper';
import { GameEvent } from '../timeline/events';
import { ReplayTimeline } from '../timeline/ReplayTimeline';
import { IMatchStore, IStoredMatch } from './local/IMatchStore';
import { summarize } from './MatchPersistenceCoordinator';
import { RecoveryError, validateHistory } from './MatchRecoveryService';

export const BACKUP_FORMAT = 'chessinreact-match';
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

/** The owner id stays on the device: it is not part of the exported file. */
export function exportBackup(events: readonly GameEvent[]): string {
  return JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), events });
}

function withMatchId(events: GameEvent[], matchId: string): GameEvent[] {
  return events.map((event) => {
    const renamed = { ...event, matchId, id: `${matchId}:${event.sequence}` } as GameEvent;
    if (renamed.type !== 'MATCH_STARTED') return renamed;
    const { config, initialState } = renamed.payload;
    return {
      ...renamed,
      payload: {
        config: { ...config, matchId },
        initialState: { ...initialState, domain: { ...initialState.domain, matchId } },
      },
    } as GameEvent;
  });
}

/** Validates everything before the first write; an invalid file changes nothing. */
export async function importBackup(
  store: IMatchStore, text: string, ownerUserId: string, newId: () => string,
): Promise<IStoredMatch> {
  if (text.length > MAX_BACKUP_BYTES) throw new RecoveryError('Arquivo grande demais.');
  let parsed: { format?: unknown; version?: unknown; events?: unknown };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    throw new RecoveryError('O arquivo não é um JSON válido.');
  }
  if (parsed?.format !== BACKUP_FORMAT || parsed.version !== BACKUP_VERSION || !Array.isArray(parsed.events)) {
    throw new RecoveryError('O arquivo não é um backup compatível de partida.');
  }
  let events = parsed.events as GameEvent[];
  const originalId = events[0]?.matchId;
  if (typeof originalId !== 'string') throw new RecoveryError('Backup sem identificação de partida.');
  validateHistory(events, originalId);
  if (await store.get(originalId)) events = withMatchId(events, `${originalId}-copia-${newId().slice(0, 8)}`);

  const first = events[0];
  if (first.type !== 'MATCH_STARTED') throw new RecoveryError('Backup sem evento inicial.');
  let summary: IStoredMatch | undefined;
  for (const event of events) summary = summarize(summary, event, ownerUserId, first.payload.config);
  await store.insert(summary!, events);
  return summary!;
}

export function exportPgn(match: IStoredMatch, events: readonly GameEvent[]): string {
  const timeline = new ReplayTimeline(events);
  const result = match.status !== 'COMPLETED' ? '*' : match.winnerId === 'P1' ? '1-0' : match.winnerId === 'P2' ? '0-1' : '1/2-1/2';
  const name = (index: number): string => (match.config.slots[index]?.displayName ?? '?').replace(/"/g, "'");
  const headers = [
    ['Event', 'ChessInReact'], ['Date', match.startedAt.slice(0, 10).replace(/-/g, '.')],
    ['White', name(0)], ['Black', name(1)], ['Result', result], ['Variant', match.variantId],
  ].map(([key, value]) => `[${key} "${value}"]`).join('\n');
  const algebraic = (coord: string): string => {
    const [x, y] = coord.split(',').map(Number);
    return Number.isInteger(x) && Number.isInteger(y) ? toAlgebraic(x, y) : coord;
  };
  const body: string[] = [];
  let lastNumber = 0;
  for (let ply = 1; ply <= timeline.livePly; ply++) {
    const entry = timeline.entry(ply)!;
    const black = entry.move.playerId === 'P2';
    if (!black || entry.move.turnNumber !== lastNumber) {
      const number = Math.ceil(ply / 2);
      body.push(`${number}${black ? '...' : '.'}`);
      lastNumber = entry.move.turnNumber;
    }
    for (const spell of entry.spells) {
      body.push(`{[%spell ${spell.payload.spell.type} ${algebraic(spell.payload.spell.targetSquare)}]}`);
    }
    body.push(entry.move.san);
  }
  return `${headers}\n\n${[...body, result].join(' ')}\n`;
}
