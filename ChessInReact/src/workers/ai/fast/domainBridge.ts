/** Conversion between the authoritative domain state and the compact search position. */
import { IDomainState } from '../../../core/state/gameState';
import { IPieceEntity } from '../../../core/entities/types';
import { ITopology } from '../../../core/topology/types';
import { IOfficialSpellState, OfficialSpellEngine } from '../../../engine/variants/spells/OfficialSpellEngine';
import {
  BISHOP, BLACK, CASTLE_BK, CASTLE_BQ, CASTLE_WK, CASTLE_WQ, FREEZE_CHARGES, FREEZE_COOLDOWN, FastPosition,
  JUMP_CHARGES, JUMP_COOLDOWN, KING, KNIGHT, PAWN, QUEEN, ROOK, WHITE, moveFrom, movePromo, moveTo,
} from './FastPosition';

const TYPE_BY_NAME: Readonly<Record<string, number>> = {
  PAWN, P: PAWN, KNIGHT, N: KNIGHT, BISHOP, B: BISHOP, ROOK, R: ROOK, QUEEN, Q: QUEEN, KING, K: KING,
};
const NAME_BY_TYPE = ['', 'PAWN', 'KNIGHT', 'BISHOP', 'ROOK', 'QUEEN', 'KING'];

const STANDARD_VARIANTS = /^(STANDARD(_[A-Z0-9]+)?|CHESS_STANDARD|CHESS|CLASSIC|CLASSIC_SQUARE|STANDARD_CHESS)$/;

export function squareOf(coord: string): number {
  const comma = coord.indexOf(',');
  const x = Number(coord.slice(0, comma)), y = Number(coord.slice(comma + 1));
  return comma > 0 && x >= 0 && x < 8 && y >= 0 && y < 8 ? y * 8 + x : -1;
}
export const coordOf = (sq: number): string => `${sq & 7},${sq >> 3}`;

function isPlainBoard(topology: ITopology): boolean {
  const t = topology as unknown as { type?: string; width?: number; height?: number; isToroidal?: boolean; isCubic?: boolean };
  return t.type === 'SQUARE' && (t.width ?? 8) === 8 && (t.height ?? 8) === 8 && !t.isToroidal && !t.isCubic;
}

function livingPieces(domain: IDomainState): IPieceEntity[] {
  return Object.values(domain.boardEntities).filter((e): e is IPieceEntity => e.type === 'PIECE' && !e.isCaptured);
}

/** Only the six orthodox pieces, two players and at most one king each. */
function hasOrthodoxPieces(domain: IDomainState): boolean {
  const kings = [0, 0];
  for (const piece of livingPieces(domain)) {
    const type = TYPE_BY_NAME[piece.variantId.toUpperCase()];
    if (!type || (piece.ownerId !== 'P1' && piece.ownerId !== 'P2') || squareOf(piece.position) < 0) return false;
    if (type === KING && ++kings[piece.ownerId === 'P1' ? 0 : 1] > 1) return false;
  }
  return !domain.terrain || Object.keys(domain.terrain).length === 0;
}

export function supportsStandardEngine(domain: IDomainState, topology: ITopology, variantId = domain.variantId): boolean {
  if (!isPlainBoard(topology) || !hasOrthodoxPieces(domain)) return false;
  if (!STANDARD_VARIANTS.test(String(variantId).toUpperCase()) || !STANDARD_VARIANTS.test(domain.variantId.toUpperCase())) return false;
  return livingPieces(domain).filter((p) => TYPE_BY_NAME[p.variantId.toUpperCase()] === KING).length === 2;
}

export function supportsSpellEngine(domain: IDomainState, topology: ITopology): boolean {
  return isPlainBoard(topology) && hasOrthodoxPieces(domain);
}

export interface IPlayerResources {
  freezeRemaining: number;
  jumpRemaining: number;
  freezeCooldown: number;
  jumpCooldown: number;
}

export interface IBridgeOptions {
  readonly spellMode: boolean;
  readonly enforceCheck: boolean;
  /** Side to move; defaults to the domain's active player. */
  readonly sideToMove?: string;
  /** Used only when the domain does not carry an official spell state. */
  readonly resources?: readonly [IPlayerResources, IPlayerResources];
}

export interface IBridgedPosition {
  readonly position: FastPosition;
  readonly idAt: ReadonlyArray<string | undefined>;
}

export function fromDomain(domain: IDomainState, options: IBridgeOptions): IBridgedPosition {
  const position = new FastPosition();
  position.spellMode = options.spellMode;
  position.enforceCheck = options.enforceCheck;
  const idAt: Array<string | undefined> = new Array(64);
  const pieces = livingPieces(domain);
  const unmoved = new Set<string>();
  for (const piece of pieces) {
    const sq = squareOf(piece.position);
    const type = TYPE_BY_NAME[piece.variantId.toUpperCase()];
    const color = piece.ownerId === 'P1' ? WHITE : BLACK;
    position.put(sq, color, type);
    idAt[sq] = piece.id;
    if (!piece.hasMoved) unmoved.add(`${color}:${type}:${sq}`);
    if (type === PAWN && piece.hasMoved && (sq >> 3) === (color === WHITE ? 1 : 6)) position.noDouble[sq] = 1;
  }
  let castling = 0;
  if (!domain.variantId.toUpperCase().includes('NO_CASTLING')) {
    if (unmoved.has(`0:${KING}:4`)) {
      if (unmoved.has(`0:${ROOK}:7`)) castling |= CASTLE_WK;
      if (unmoved.has(`0:${ROOK}:0`)) castling |= CASTLE_WQ;
    }
    if (unmoved.has(`1:${KING}:60`)) {
      if (unmoved.has(`1:${ROOK}:63`)) castling |= CASTLE_BK;
      if (unmoved.has(`1:${ROOK}:56`)) castling |= CASTLE_BQ;
    }
  }
  position.castling = castling;
  position.side = (options.sideToMove ?? domain.activePlayer) === 'P2' ? BLACK : WHITE;
  position.ep = domain.turnState?.enPassantTarget ? squareOf(domain.turnState.enPassantTarget) : -1;
  position.halfmove = domain.turnState?.fiftyMoveCounter ?? 0;
  if (options.spellMode) loadSpells(position, domain, pieces, options);
  position.finishSetup();
  loadHistory(position, domain);
  return { position, idAt };
}

function loadSpells(position: FastPosition, domain: IDomainState, pieces: IPieceEntity[], options: IBridgeOptions): void {
  const stored = domain.metadata?.officialSpellState as IOfficialSpellState | undefined;
  const state = stored ?? OfficialSpellEngine.createInitialState();
  const write = (color: number, r: IPlayerResources): void => {
    const base = color * 4;
    position.resources[base + FREEZE_CHARGES] = r.freezeRemaining;
    position.resources[base + FREEZE_COOLDOWN] = r.freezeCooldown;
    position.resources[base + JUMP_CHARGES] = r.jumpRemaining;
    position.resources[base + JUMP_COOLDOWN] = r.jumpCooldown;
  };
  if (!stored && options.resources) {
    write(WHITE, options.resources[0]);
    write(BLACK, options.resources[1]);
  } else {
    [state.whiteCharges, state.blackCharges].forEach((c, color) => write(color, {
      freezeRemaining: c.freezeCharges, freezeCooldown: c.freezeCooldownTurns,
      jumpRemaining: c.jumpCharges, jumpCooldown: c.jumpCooldownTurns,
    }));
  }
  for (const piece of pieces) {
    const sq = squareOf(piece.position);
    let frozen = 0, jump = 0;
    if (stored) {
      frozen = stored.activeFrozenPieceIds
        ? stored.activeFrozenPieceIds[piece.id] ?? 0
        : stored.activeFrozenCoordinates[piece.position] ?? 0;
      jump = stored.activeJumpPieceIds[piece.id] ?? 0;
    } else {
      frozen = piece.metadata?.isFrozen ? 1 : 0;
      jump = piece.metadata?.canBeJumpedOver || piece.metadata?.hasJump ? 1 : 0;
    }
    position.frozen[sq] = Math.max(0, Math.min(2, frozen));
    position.jump[sq] = Math.max(0, Math.min(2, jump));
  }
  position.castThisTurn = Boolean(domain.metadata?.hasCastSpellThisTurn);
}

/** Rebuilds repetition keys from the canonical strings produced by computePositionKey. */
function loadHistory(position: FastPosition, domain: IDomainState): void {
  const history = domain.turnState?.positionHistory ?? [];
  const reversible = Math.min(position.halfmove, Math.max(0, history.length - 1));
  for (let i = history.length - 1 - reversible; i < history.length - 1; i++) {
    const key = keyFromHistory(position, history[i]);
    position.historyLo.push(key ? key[0] : 0);
    position.historyHi.push(key ? key[1] : 0);
  }
}

function keyFromHistory(template: FastPosition, text: string): [number, number] | null {
  const [player, castlingText, epText, piecesText, , ...rest] = text.split('|');
  if (piecesText === undefined) return null;
  const past = new FastPosition();
  past.spellMode = template.spellMode;
  past.enforceCheck = template.enforceCheck;
  const bySquare = new Map<string, number>();
  for (const token of piecesText.split(';')) {
    const [coord, owner, name] = token.split(':');
    const sq = squareOf(coord ?? ''), type = TYPE_BY_NAME[name ?? ''];
    if (sq < 0 || !type) return null;
    past.put(sq, owner === 'P1' ? WHITE : BLACK, type);
    bySquare.set(coord, sq);
  }
  past.side = player === 'P2' ? BLACK : WHITE;
  past.castling = (castlingText.includes('K') ? CASTLE_WK : 0) | (castlingText.includes('Q') ? CASTLE_WQ : 0) |
    (castlingText.includes('k') ? CASTLE_BK : 0) | (castlingText.includes('q') ? CASTLE_BQ : 0);
  past.ep = epText && epText !== '-' ? squareOf(epText) : -1;
  if (template.spellMode) {
    if (!rest.length) return null;
    try {
      const [white, black, effects] = JSON.parse(rest.join('|')) as [
        IOfficialSpellState['whiteCharges'], IOfficialSpellState['blackCharges'], Array<[string, number, number]>];
      [white, black].forEach((c, color) => {
        past.resources[color * 4 + FREEZE_CHARGES] = c.freezeCharges;
        past.resources[color * 4 + FREEZE_COOLDOWN] = c.freezeCooldownTurns;
        past.resources[color * 4 + JUMP_CHARGES] = c.jumpCharges;
        past.resources[color * 4 + JUMP_COOLDOWN] = c.jumpCooldownTurns;
      });
      for (const [coord, frozen, jump] of effects) {
        const sq = bySquare.get(coord);
        if (sq === undefined) continue;
        past.frozen[sq] = frozen;
        past.jump[sq] = jump;
      }
    } catch {
      return null;
    }
  }
  past.finishSetup();
  return [past.keyLo, past.keyHi];
}

export interface IEngineMove {
  readonly pieceId: string;
  readonly from: string;
  readonly to: string;
  readonly promotion?: string;
}

/** Describes a move relative to the piece-id map of the root position. */
export function toDomainMove(move: number, pieceId: string): IEngineMove {
  const promo = movePromo(move);
  return {
    pieceId,
    from: coordOf(moveFrom(move)),
    to: coordOf(moveTo(move)),
    promotion: promo ? NAME_BY_TYPE[promo] : undefined,
  };
}
