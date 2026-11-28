/**
 * Selective generation of spell turns for the search.
 *
 * Legality is never decided here: every turn is cast and played on the real position. This module
 * only chooses which of the several thousand legal spell turns are worth examining.
 */
import {
  BISHOP, FastPosition, KING, KING_TARGETS, KNIGHT, KNIGHT_TARGETS, PAWN, PAWN_CAPTURES, QUEEN, RAYS,
  ROOK, SPELL_FREEZE, SPELL_JUMP, encodeSpell, moveFrom, moveTo, spellType,
} from './FastPosition';
import { PIECE_VALUE } from './FastEvaluation';

export interface ISpellTurn {
  readonly spell: number;
  readonly move: number;
  /** Ordering hint; higher is searched first. */
  readonly priority: number;
}

/** Squares attacked by the piece on `from`, ignoring temporary effects. */
function attackedSquares(position: FastPosition, from: number, out: number[]): number[] {
  out.length = 0;
  const board = position.board;
  const p = board[from];
  const type = p & 7;
  if (type === PAWN) for (const s of PAWN_CAPTURES[p >> 3][from]) out.push(s);
  else if (type === KNIGHT) for (const s of KNIGHT_TARGETS[from]) out.push(s);
  else if (type === KING) for (const s of KING_TARGETS[from]) out.push(s);
  else {
    const first = type === BISHOP ? 4 : 0;
    const last = type === ROOK ? 4 : 8;
    for (let d = first; d < last; d++) {
      const ray = RAYS[from][d];
      for (let i = 0; i < ray.length; i++) {
        out.push(ray[i]);
        if (board[ray[i]]) break;
      }
    }
  }
  return out;
}

interface IBoardRelations {
  /** For every occupied square, the squares of the pieces (any colour) that attack or defend it. */
  readonly hitBy: number[][];
  readonly attacks: number[][];
}

function relations(position: FastPosition): IBoardRelations {
  const hitBy: number[][] = Array.from({ length: 64 }, () => []);
  const attacks: number[][] = Array.from({ length: 64 }, () => []);
  const buffer: number[] = [];
  for (let from = 0; from < 64; from++) {
    if (!position.board[from]) continue;
    for (const to of attackedSquares(position, from, buffer)) {
      attacks[from].push(to);
      hitBy[to].push(from);
    }
  }
  return { hitBy, attacks };
}

export interface IFreezeZone {
  readonly spell: number;
  readonly score: number;
}

/**
 * Distinct Freeze zones ranked by what they actually change: attackers of our pieces or king,
 * defenders of pieces we can take, and the enemy king's ability to react. Zones that change
 * none of these are discarded as speculative.
 */
export function rankFreezeZones(position: FastPosition, limit: number, minimum: number, threats: readonly number[]): IFreezeZone[] {
  if (!position.canCast(SPELL_FREEZE)) return [];
  const board = position.board;
  const side = position.side, enemy = side ^ 1;
  const { hitBy, attacks } = relations(position);
  const worth = new Int32Array(64);
  const enemyKing = position.king[enemy];
  let pressureOnKing = 0;
  if (enemyKing >= 0) {
    const around = [enemyKing, ...Array.from(KING_TARGETS[enemyKing])];
    const seen = new Set<number>();
    for (const s of around) for (const a of hitBy[s]) if (board[a] >> 3 === side) seen.add(a);
    pressureOnKing = seen.size;
  }
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (!p || position.frozen[sq] >= 2) continue;
    const type = p & 7;
    let value = 0;
    if (p >> 3 === enemy) {
      if (type === KING) value += 30 + pressureOnKing * 90;
      for (const target of attacks[sq]) {
        const q = board[target];
        if (!q) continue;
        const victim = q & 7;
        if (q >> 3 === side) {
          const defended = hitBy[target].some((d) => d !== target && board[d] >> 3 === side);
          if (victim === KING) value += 700;
          else if (!defended) value += PIECE_VALUE[victim] >> 1;
          else if (PIECE_VALUE[victim] > PIECE_VALUE[type]) value += (PIECE_VALUE[victim] - PIECE_VALUE[type]) >> 1;
        } else if (hitBy[target].some((a) => board[a] >> 3 === side) && victim !== KING) {
          value += PIECE_VALUE[victim] >> 3; // removes a defender of something we attack
        }
      }
      if (type !== KING && hitBy[sq].some((a) => board[a] >> 3 === side)) value += PIECE_VALUE[type] >> 4;
      if (enemyKing >= 0 && pressureOnKing && attacks[sq].some((s) => adjacent(s, enemyKing))) value += 20;
      if (threats.includes(sq)) value += 900;
    } else {
      // A frozen friendly piece cannot move, attack or defend.
      value -= (PIECE_VALUE[type] >> 5) + (type === KING ? 25 : 0);
    }
    worth[sq] = value;
  }

  const zones: IFreezeZone[] = [];
  const seenSets = new Set<string>();
  for (let center = 0; center < 64; center++) {
    const cx = center & 7, cy = center >> 3;
    let score = 0, lo = 0, hi = 0, enemies = 0;
    for (let y = Math.max(0, cy - 1); y <= Math.min(7, cy + 1); y++) {
      for (let x = Math.max(0, cx - 1); x <= Math.min(7, cx + 1); x++) {
        const sq = y * 8 + x;
        if (!board[sq]) continue;
        if (sq < 32) lo |= 1 << sq; else hi |= 1 << (sq - 32);
        if (board[sq] >> 3 === enemy) enemies++;
        score += worth[sq];
      }
    }
    if (!enemies || score < minimum) continue;
    const key = `${lo},${hi}`;
    if (seenSets.has(key)) continue;
    seenSets.add(key);
    zones.push({ spell: encodeSpell(SPELL_FREEZE, center), score });
  }
  zones.sort((a, b) => b.score - a.score);
  return zones.slice(0, limit);
}

function adjacent(a: number, b: number): boolean {
  return Math.abs((a & 7) - (b & 7)) <= 1 && Math.abs((a >> 3) - (b >> 3)) <= 1;
}

/** Whether the straight path from `from` to `to` passes over `via`. */
function passesThrough(from: number, to: number, via: number): boolean {
  const fx = from & 7, fy = from >> 3, tx = to & 7, ty = to >> 3, vx = via & 7, vy = via >> 3;
  const dx = tx - fx, dy = ty - fy;
  if (dx && dy && Math.abs(dx) !== Math.abs(dy)) return false;
  const sx = Math.sign(dx), sy = Math.sign(dy);
  for (let x = fx + sx, y = fy + sy; x !== tx || y !== ty; x += sx, y += sy) {
    if (x === vx && y === vy) return true;
  }
  return false;
}

/** Squares whose Jump would open at least one line for a friendly slider or pawn. */
function jumpBlockers(position: FastPosition): number[] {
  const board = position.board, side = position.side;
  const result = new Set<number>();
  for (let from = 0; from < 64; from++) {
    const p = board[from];
    if (!p || p >> 3 !== side || position.frozen[from]) continue;
    const type = p & 7;
    if (type === PAWN) {
      const one = from + (side === 0 ? 8 : -8);
      if (one >= 0 && one < 64 && board[one] && !position.jump[one]) result.add(one);
    } else if (type === BISHOP || type === ROOK || type === QUEEN) {
      for (let d = type === BISHOP ? 4 : 0; d < (type === ROOK ? 4 : 8); d++) {
        const ray = RAYS[from][d];
        for (let i = 0; i < ray.length; i++) {
          if (!board[ray[i]]) continue;
          if (!position.jump[ray[i]] && i < ray.length - 1) result.add(ray[i]);
          break;
        }
      }
    }
  }
  return Array.from(result);
}

const scratch = new Int32Array(512);

/** Jump turns whose move really uses the opened line. */
function addJumpTurns(position: FastPosition, out: ISpellTurn[], minimumVictim: number): void {
  if (!position.canCast(SPELL_JUMP)) return;
  const board = position.board;
  for (const blocker of jumpBlockers(position)) {
    const spell = encodeSpell(SPELL_JUMP, blocker);
    position.cast(spell);
    const count = position.generate(scratch, 0, minimumVictim > 0);
    for (let i = 0; i < count; i++) {
      const move = scratch[i];
      const to = moveTo(move);
      if (!passesThrough(moveFrom(move), to, blocker)) continue;
      const victim = board[to] & 7;
      if (minimumVictim > 0 && PIECE_VALUE[victim] < minimumVictim) continue;
      const gain = victim ? PIECE_VALUE[victim] * 4 - (PIECE_VALUE[board[moveFrom(move)] & 7] >> 2) : 0;
      out.push({ spell, move, priority: gain });
    }
    position.uncast();
  }
}

/**
 * Freeze-assisted captures: take a defended piece while freezing every one of its defenders,
 * without freezing the capturing piece.
 */
function addFreezeCaptures(position: FastPosition, out: ISpellTurn[], minimumVictim: number): void {
  if (!position.canCast(SPELL_FREEZE)) return;
  const board = position.board;
  const side = position.side, enemy = side ^ 1;
  const captures = new Int32Array(256);
  const count = position.generate(captures, 0, true);
  let links: IBoardRelations | null = null;
  for (let i = 0; i < count; i++) {
    const move = captures[i];
    const from = moveFrom(move), to = moveTo(move);
    const victim = board[to] & 7;
    if (!victim || victim === KING || PIECE_VALUE[victim] < minimumVictim) continue;
    // A much cheaper attacker already wins material without magic. Even trades are kept:
    // with the defenders frozen, knight takes knight wins a clean piece.
    if (PIECE_VALUE[board[from] & 7] + 150 <= PIECE_VALUE[victim]) continue;
    links ??= relations(position);
    const defenders = links.hitBy[to].filter((s) => s !== to && board[s] >> 3 === enemy && !position.frozen[s]);
    if (!defenders.length) continue;
    for (let center = 0; center < 64; center++) {
      const covers = defenders.every((s) => adjacent(s, center));
      if (!covers || adjacent(from, center)) continue;
      out.push({ spell: encodeSpell(SPELL_FREEZE, center), move, priority: PIECE_VALUE[victim] * 4 });
      break;
    }
  }
}

const WAITING_MOVES = 3;

/**
 * Counter-Freeze that holds an intruder in place until our frozen pieces thaw and can take it.
 * This is the main answer to a Freeze-assisted capture, and it is played with a quiet move.
 */
function addRetentionFreezes(position: FastPosition, out: ISpellTurn[], minimumVictim: number): void {
  if (!position.effects || !position.canCast(SPELL_FREEZE)) return;
  const board = position.board;
  const side = position.side, enemy = side ^ 1;
  const buffer: number[] = [];
  const waking = new Map<number, number[]>(); // intruder -> our frozen pieces that will hit it
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (!p || p >> 3 !== side || position.frozen[sq] !== 1) continue;
    for (const target of attackedSquares(position, sq, buffer)) {
      const q = board[target];
      if (!q || q >> 3 !== enemy || (q & 7) === KING || PIECE_VALUE[q & 7] < minimumVictim) continue;
      const list = waking.get(target);
      if (list) list.push(sq); else waking.set(target, [sq]);
    }
  }
  for (const [target, recapturers] of waking) {
    for (let center = 0; center < 64; center++) {
      // The zone must hold the intruder without freezing our recapturers again.
      if (!adjacent(target, center) || recapturers.every((sq) => adjacent(sq, center))) continue;
      const spell = encodeSpell(SPELL_FREEZE, center);
      position.cast(spell);
      const count = position.generate(scratch, 0);
      let added = 0;
      for (let i = 0; i < count && added < WAITING_MOVES; i++) {
        const move = scratch[i];
        const type = board[moveFrom(move)] & 7;
        // A waiting move: quiet, and not one that abandons the king or the queen's guard.
        if (board[moveTo(move)] || type === KING || type === QUEEN) continue;
        out.push({ spell, move, priority: PIECE_VALUE[board[target] & 7] * 3 - added });
        added++;
      }
      position.uncast();
      break;
    }
  }
}

function addZoneTurns(position: FastPosition, zones: readonly IFreezeZone[], out: ISpellTurn[]): void {
  for (const zone of zones) {
    position.cast(zone.spell);
    const count = position.generate(scratch, 0);
    for (let i = 0; i < count; i++) {
      const move = scratch[i];
      const victim = position.board[moveTo(move)] & 7;
      out.push({ spell: zone.spell, move, priority: zone.score + (victim ? PIECE_VALUE[victim] * 3 : 0) });
    }
    position.uncast();
  }
}

function dedupe(turns: ISpellTurn[]): ISpellTurn[] {
  const seen = new Set<string>();
  return turns.sort((a, b) => b.priority - a.priority).filter((turn) => {
    const key = `${turn.spell}:${turn.move}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const ROOT_FREEZE_ZONES = 14;

/** Wide selection used at the root. */
export function rootSpellTurns(position: FastPosition): ISpellTurn[] {
  const turns: ISpellTurn[] = [];
  const threats = position.royalThreats(position.side);
  addJumpTurns(position, turns, 0);
  addFreezeCaptures(position, turns, PIECE_VALUE[PAWN]);
  addRetentionFreezes(position, turns, PIECE_VALUE[KNIGHT]);
  addZoneTurns(position, rankFreezeZones(position, ROOT_FREEZE_ZONES, 1, threats), turns);
  return dedupe(turns);
}

/** Spell turns that win material outright; used near the horizon. */
export function tacticalSpellTurns(position: FastPosition, minimumVictim: number): ISpellTurn[] {
  const turns: ISpellTurn[] = [];
  addRetentionFreezes(position, turns, minimumVictim);
  addJumpTurns(position, turns, minimumVictim);
  addFreezeCaptures(position, turns, minimumVictim);
  return dedupe(turns);
}

/** Spell turns able to answer an attack on our king. */
export function defensiveSpellTurns(position: FastPosition, threats: readonly number[], zones = 3): ISpellTurn[] {
  const turns: ISpellTurn[] = [];
  const ranked = rankFreezeZones(position, 40, -200, threats)
    .map((zone) => ({ zone, covered: threats.filter((s) => adjacent(s, zone.spell & 63)).length }))
    .filter((entry) => entry.covered > 0)
    .sort((a, b) => b.covered - a.covered || b.zone.score - a.zone.score);
  addZoneTurns(position, ranked.slice(0, zones).map((entry) => entry.zone), turns);
  addJumpTurns(position, turns, PIECE_VALUE[KNIGHT]);
  return dedupe(turns);
}

/** Every spell turn that might unlock a position with no ordinary move. */
export function unlockingSpellTurns(position: FastPosition): ISpellTurn[] {
  const turns: ISpellTurn[] = [];
  addJumpTurns(position, turns, 0);
  // 64 is every possible centre: each distinct set of frozen pieces is covered.
  addZoneTurns(position, rankFreezeZones(position, 64, -Infinity, position.royalThreats(position.side)), turns);
  return dedupe(turns);
}

export const isFreeze = (spell: number): boolean => spellType(spell) === SPELL_FREEZE;
