/**
 * Compact 8x8 position for the level 5 engines (standard chess and official Spell Chess).
 *
 * The domain model clones objects for every simulated move, which limited the old search to a
 * few thousand positions per second. This board uses typed arrays with make/unmake.
 *
 * Spell semantics mirror OfficialSpellRules / RulesEngine / CheckValidator and are verified
 * against them by FastEngineRulesParity.test.ts:
 *  - Freeze marks the pieces standing in the 3x3 area at cast time (not the squares).
 *  - Jump marks one piece: it may leap one blocker, and any slider may pass through it.
 *  - Effects last 2 half-turns; cooldown ticks only for the player who just moved.
 *  - The moved piece loses its Jump buff before effects expire.
 */

export const WHITE = 0;
export const BLACK = 1;
export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

export const FLAG_CAPTURE = 1 << 15;
export const FLAG_EP = 1 << 16;
export const FLAG_CASTLE = 1 << 17;
export const FLAG_DOUBLE = 1 << 18;

export const SPELL_NONE = 0;
export const SPELL_FREEZE = 1;
export const SPELL_JUMP = 2;
export const encodeSpell = (type: number, square: number): number => (type << 8) | square;
export const spellType = (spell: number): number => spell >> 8;
export const spellSquare = (spell: number): number => spell & 63;

export const moveFrom = (m: number): number => m & 63;
export const moveTo = (m: number): number => (m >> 6) & 63;
export const movePromo = (m: number): number => (m >> 12) & 7;
export const encodeMove = (from: number, to: number, promo = 0, flags = 0): number =>
  from | (to << 6) | (promo << 12) | flags;

/** Spell resource layout: 4 slots per colour. */
export const FREEZE_CHARGES = 0;
export const FREEZE_COOLDOWN = 1;
export const JUMP_CHARGES = 2;
export const JUMP_COOLDOWN = 3;
export const SPELL_COOLDOWN_TURNS = 3;

export const CASTLE_WK = 1;
export const CASTLE_WQ = 2;
export const CASTLE_BK = 4;
export const CASTLE_BQ = 8;

export const MAX_PLY = 96;
export const MOVES_PER_PLY = 256;

// ---------------------------------------------------------------------------
// Geometry tables
// ---------------------------------------------------------------------------
/** Directions 0-3 are orthogonal, 4-7 diagonal. */
const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1],
];

function targets(offsets: ReadonlyArray<readonly [number, number]>): Int8Array[] {
  return Array.from({ length: 64 }, (_, sq) => {
    const x = sq & 7, y = sq >> 3;
    const list: number[] = [];
    for (const [dx, dy] of offsets) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8) list.push(ny * 8 + nx);
    }
    return Int8Array.from(list);
  });
}

export const RAYS: ReadonlyArray<ReadonlyArray<Int8Array>> = Array.from({ length: 64 }, (_, sq) =>
  DIRECTIONS.map(([dx, dy]) => {
    const list: number[] = [];
    let x = (sq & 7) + dx, y = (sq >> 3) + dy;
    while (x >= 0 && x < 8 && y >= 0 && y < 8) {
      list.push(y * 8 + x);
      x += dx; y += dy;
    }
    return Int8Array.from(list);
  }));
export const KNIGHT_TARGETS = targets([[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]);
export const KING_TARGETS = targets(DIRECTIONS);
/** PAWN_CAPTURES[color][sq]: squares a pawn of `color` on sq attacks. */
export const PAWN_CAPTURES: ReadonlyArray<Int8Array[]> = [targets([[-1, 1], [1, 1]]), targets([[-1, -1], [1, -1]])];

// ---------------------------------------------------------------------------
// Zobrist keys (two independent 32-bit lanes, deterministic)
// ---------------------------------------------------------------------------
function randomTable(size: number, seed: number): Int32Array {
  let s = seed >>> 0;
  const table = new Int32Array(size);
  for (let i = 0; i < size; i++) {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    table[i] = (z ^ (z >>> 16)) | 0;
  }
  return table;
}
const Z_PIECE_LO = randomTable(16 * 64, 0x1234abcd);
const Z_PIECE_HI = randomTable(16 * 64, 0x7c3a91e5);
const Z_STATE_LO = randomTable(64, 0x0badf00d);
const Z_STATE_HI = randomTable(64, 0x51ed270b);
// 64 squares x {frozen 1, frozen 2, jump 1, jump 2} followed by 8 resources x 16 values.
const Z_SPELL_LO = randomTable(64 * 4 + 8 * 16, 0x2545f491);
const Z_SPELL_HI = randomTable(64 * 4 + 8 * 16, 0x6c078965);
const Z_SIDE = 0, Z_CASTLE = 1, Z_EP = 17;

// ---------------------------------------------------------------------------
// Tapered material + piece-square values (PeSTO tables, listed from a8 to h1)
// ---------------------------------------------------------------------------
const MG_VALUE = [0, 82, 337, 365, 477, 1025, 0];
const EG_VALUE = [0, 94, 281, 297, 512, 936, 0];
export const PHASE_WEIGHT = [0, 0, 1, 1, 2, 4, 0];

const MG_PST: number[][] = [[], [
  0, 0, 0, 0, 0, 0, 0, 0, 98, 134, 61, 95, 68, 126, 34, -11, -6, 7, 26, 31, 65, 56, 25, -20,
  -14, 13, 6, 21, 23, 12, 17, -23, -27, -2, -5, 12, 17, 6, 10, -25, -26, -4, -4, -10, 3, 3, 33, -12,
  -35, -1, -20, -23, -15, 24, 38, -22, 0, 0, 0, 0, 0, 0, 0, 0,
], [
  -167, -89, -34, -49, 61, -97, -15, -107, -73, -41, 72, 36, 23, 62, 7, -17, -47, 60, 37, 65, 84, 129, 73, 44,
  -9, 17, 19, 53, 37, 69, 18, 22, -13, 4, 16, 13, 28, 19, 21, -8, -23, -9, 12, 10, 19, 17, 25, -16,
  -29, -53, -12, -3, -1, 18, -14, -19, -105, -21, -58, -33, -17, -28, -19, -23,
], [
  -29, 4, -82, -37, -25, -42, 7, -8, -26, 16, -18, -13, 30, 59, 18, -47, -16, 37, 43, 40, 35, 50, 37, -2,
  -4, 5, 19, 50, 37, 37, 7, -2, -6, 13, 13, 26, 34, 12, 10, 4, 0, 15, 15, 15, 14, 27, 18, 10,
  4, 15, 16, 0, 7, 21, 33, 1, -33, -3, -14, -21, -13, -12, -39, -21,
], [
  32, 42, 32, 51, 63, 9, 31, 43, 27, 32, 58, 62, 80, 67, 26, 44, -5, 19, 26, 36, 17, 45, 61, 16,
  -24, -11, 7, 26, 24, 35, -8, -20, -36, -26, -12, -1, 9, -7, 6, -23, -45, -25, -16, -17, 3, 0, -5, -33,
  -44, -16, -20, -9, -1, 11, -6, -71, -19, -13, 1, 17, 16, 7, -37, -26,
], [
  -28, 0, 29, 12, 59, 44, 43, 45, -24, -39, -5, 1, -16, 57, 28, 54, -13, -17, 7, 8, 29, 56, 47, 57,
  -27, -27, -16, -16, -1, 17, -2, 1, -9, -26, -9, -10, -2, -4, 3, -3, -14, 2, -11, -2, -5, 2, 14, 5,
  -35, -8, 11, 2, 8, 15, -3, 1, -1, -18, -9, 10, -15, -25, -31, -50,
], [
  -65, 23, 16, -15, -56, -34, 2, 13, 29, -1, -20, -7, -8, -4, -38, -29, -9, 24, 2, -16, -20, 6, 22, -22,
  -17, -20, -12, -27, -30, -25, -14, -36, -49, -1, -27, -39, -46, -44, -33, -51, -14, -14, -22, -46, -44, -30, -15, -27,
  1, 7, -8, -64, -43, -16, 9, 8, -15, 36, 12, -54, 8, -28, 24, 14,
]];

const EG_PST: number[][] = [[], [
  0, 0, 0, 0, 0, 0, 0, 0, 178, 173, 158, 134, 147, 132, 165, 187, 94, 100, 85, 67, 56, 53, 82, 84,
  32, 24, 13, 5, -2, 4, 17, 17, 13, 9, -3, -7, -7, -8, 3, -1, 4, 7, -6, 1, 0, -5, -1, -8,
  13, 8, 8, 10, 13, 0, 2, -7, 0, 0, 0, 0, 0, 0, 0, 0,
], [
  -58, -38, -13, -28, -31, -27, -63, -99, -25, -8, -25, -2, -9, -25, -24, -52, -24, -20, 10, 9, -1, -9, -19, -41,
  -17, 3, 22, 22, 22, 11, 8, -18, -18, -6, 16, 25, 16, 17, 4, -18, -23, -3, -1, 15, 10, -3, -20, -22,
  -42, -20, -10, -5, -2, -20, -23, -44, -29, -51, -23, -15, -22, -18, -50, -64,
], [
  -14, -21, -11, -8, -7, -9, -17, -24, -8, -4, 7, -12, -3, -13, -4, -14, 2, -8, 0, -1, -2, 6, 0, 4,
  -3, 9, 12, 9, 14, 10, 3, 2, -6, 3, 13, 19, 7, 10, -3, -9, -12, -3, 8, 10, 13, 3, -7, -15,
  -14, -18, -7, -1, 4, -9, -15, -27, -23, -9, -23, -5, -9, -16, -5, -17,
], [
  13, 10, 18, 15, 12, 12, 8, 5, 11, 13, 13, 11, -3, 3, 8, 3, 7, 7, 7, 5, 4, -3, -5, -3,
  4, 3, 13, 1, 2, 1, -1, 2, 3, 5, 8, 4, -5, -6, -8, -11, -4, 0, -5, -1, -7, -12, -8, -16,
  -6, -6, 0, 2, -9, -9, -11, -3, -9, 2, 3, -1, -5, -13, 4, -20,
], [
  -9, 22, 22, 27, 27, 19, 10, 20, -17, 20, 32, 41, 58, 25, 30, 0, -20, 6, 9, 49, 47, 35, 19, 9,
  3, 22, 24, 45, 57, 40, 57, 36, -18, 28, 19, 47, 31, 34, 39, 23, -16, -27, 15, 6, 9, 17, 10, 5,
  -22, -23, -30, -16, -16, -23, -36, -32, -33, -28, -22, -43, -5, -32, -20, -41,
], [
  -74, -35, -18, -18, -11, 15, 4, -17, -12, 17, 14, 17, 17, 38, 23, 11, 10, 17, 23, 15, 20, 45, 44, 13,
  -8, 22, 24, 27, 26, 33, 26, 3, -18, -4, 21, 24, 27, 23, 9, -11, -19, -3, 11, 21, 23, 16, 7, -9,
  -27, -11, 4, 13, 14, 4, -5, -17, -53, -34, -21, -11, -28, -14, -24, -43,
]];

/** Signed (white-positive) value of piece code at square. */
const PSQ_MG = new Int32Array(16 * 64);
const PSQ_EG = new Int32Array(16 * 64);
for (let color = 0; color < 2; color++) {
  for (let type = PAWN; type <= KING; type++) {
    for (let sq = 0; sq < 64; sq++) {
      const index = color === WHITE ? sq ^ 56 : sq;
      const sign = color === WHITE ? 1 : -1;
      const code = type | (color << 3);
      PSQ_MG[code * 64 + sq] = sign * (MG_VALUE[type] + MG_PST[type][index]);
      PSQ_EG[code * 64 + sq] = sign * (EG_VALUE[type] + EG_PST[type][index]);
    }
  }
}

class Undo {
  move = 0; piece = 0; captured = 0; capSq = 0; castling = 0; ep = -1; halfmove = 0;
  lo = 0; hi = 0; mg = 0; eg = 0; phase = 0; king0 = 0; king1 = 0; effects = 0;
  freezeCooldown = 0; jumpCooldown = 0; castThisTurn = false; snapshot = false;
  readonly frozen = new Uint8Array(64);
  readonly jump = new Uint8Array(64);
}

class CastUndo {
  count = 0; type = 0; effects = 0; charges = 0; cooldown = 0;
  readonly squares = new Int8Array(9);
  readonly values = new Uint8Array(9);
}

export class FastPosition {
  readonly board = new Int8Array(64);
  readonly frozen = new Uint8Array(64);
  readonly jump = new Uint8Array(64);
  /** Pawns on their home rank that may not double-step (hand-built positions). */
  readonly noDouble = new Uint8Array(64);
  readonly king = new Int8Array(2).fill(-1);
  readonly resources = new Uint8Array(8);
  /** Number of non-zero entries across `frozen` and `jump`. */
  effects = 0;
  side = WHITE;
  castling = 0;
  ep = -1;
  halfmove = 0;
  spellMode = false;
  /** false only in the king-capture-only Spell Chess mode. */
  enforceCheck = true;
  castThisTurn = false;
  lo = 0;
  hi = 0;
  mg = 0;
  eg = 0;
  phase = 0;
  /** Keys of earlier positions (game history followed by the search path). */
  readonly historyLo: number[] = [];
  readonly historyHi: number[] = [];

  private readonly undoStack: Undo[] = [];
  private undoTop = 0;
  private readonly castStack: CastUndo[] = [];
  private castTop = 0;
  keyLo = 0;
  keyHi = 0;

  // -------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------
  put(sq: number, color: number, type: number): void {
    const code = type | (color << 3);
    this.board[sq] = code;
    this.lo ^= Z_PIECE_LO[code * 64 + sq];
    this.hi ^= Z_PIECE_HI[code * 64 + sq];
    this.mg += PSQ_MG[code * 64 + sq];
    this.eg += PSQ_EG[code * 64 + sq];
    this.phase += PHASE_WEIGHT[type];
    if (type === KING) this.king[color] = sq;
  }

  private remove(sq: number): number {
    const code = this.board[sq];
    this.board[sq] = 0;
    this.lo ^= Z_PIECE_LO[code * 64 + sq];
    this.hi ^= Z_PIECE_HI[code * 64 + sq];
    this.mg -= PSQ_MG[code * 64 + sq];
    this.eg -= PSQ_EG[code * 64 + sq];
    this.phase -= PHASE_WEIGHT[code & 7];
    return code;
  }

  /** Call once after pieces and scalar fields are set. */
  finishSetup(): void {
    if (this.side === BLACK) this.toggle(Z_SIDE);
    this.toggle(Z_CASTLE + this.castling);
    if (this.ep >= 0 && this.epCapturable(this.ep, this.side)) this.toggle(Z_EP + (this.ep & 7));
    this.recountEffects();
    this.updateKey();
  }

  recountEffects(): void {
    let n = 0;
    for (let sq = 0; sq < 64; sq++) {
      if (this.frozen[sq]) n++;
      if (this.jump[sq]) n++;
    }
    this.effects = n;
  }

  private toggle(index: number): void {
    this.lo ^= Z_STATE_LO[index];
    this.hi ^= Z_STATE_HI[index];
  }

  private epCapturable(ep: number, capturer: number): boolean {
    for (const from of PAWN_CAPTURES[capturer ^ 1][ep]) {
      if (this.board[from] === (PAWN | (capturer << 3))) return true;
    }
    return false;
  }

  /** Full position key including spell effects and resources. */
  updateKey(): void {
    let lo = this.lo, hi = this.hi;
    if (this.spellMode) {
      if (this.effects) {
        for (let sq = 0; sq < 64; sq++) {
          if (this.frozen[sq]) {
            const i = sq * 4 + this.frozen[sq] - 1;
            lo ^= Z_SPELL_LO[i]; hi ^= Z_SPELL_HI[i];
          }
          if (this.jump[sq]) {
            const i = sq * 4 + 2 + this.jump[sq] - 1;
            lo ^= Z_SPELL_LO[i]; hi ^= Z_SPELL_HI[i];
          }
        }
      }
      for (let r = 0; r < 8; r++) {
        const i = 256 + r * 16 + (this.resources[r] & 15);
        lo ^= Z_SPELL_LO[i]; hi ^= Z_SPELL_HI[i];
      }
    }
    this.keyLo = lo | 0;
    this.keyHi = hi | 0;
  }

  /** True when the current position already occurred (since the last irreversible move). */
  isRepetition(): boolean {
    const end = this.historyLo.length;
    const start = Math.max(0, end - this.halfmove);
    for (let i = end - 2; i >= start; i -= 2) {
      if (this.historyLo[i] === this.keyLo && this.historyHi[i] === this.keyHi) return true;
    }
    return false;
  }

  hasNonPawnMaterial(color: number): boolean {
    for (let sq = 0; sq < 64; sq++) {
      const p = this.board[sq];
      if (p && p >> 3 === color) {
        const t = p & 7;
        if (t !== PAWN && t !== KING) return true;
      }
    }
    return false;
  }

  isInsufficientMaterial(): boolean {
    if (this.phase > 1) return false;
    for (let sq = 0; sq < 64; sq++) if ((this.board[sq] & 7) === PAWN) return false;
    return true;
  }

  // -------------------------------------------------------------------------
  // Attacks
  // -------------------------------------------------------------------------
  /** Mirrors CheckValidator.isSquareAttacked: only blockers carrying Jump are transparent. */
  isAttacked(sq: number, by: number): boolean {
    const board = this.board, frozen = this.frozen;
    const colorBits = by << 3;
    const pawns = PAWN_CAPTURES[by ^ 1][sq];
    for (let i = 0; i < pawns.length; i++) {
      const s = pawns[i];
      if (board[s] === (PAWN | colorBits) && !frozen[s]) return true;
    }
    const knights = KNIGHT_TARGETS[sq];
    for (let i = 0; i < knights.length; i++) {
      const s = knights[i];
      if (board[s] === (KNIGHT | colorBits) && !frozen[s]) return true;
    }
    const rays = RAYS[sq];
    for (let d = 0; d < 8; d++) {
      const ray = rays[d];
      let jumped = false;
      for (let i = 0; i < ray.length; i++) {
        const s = ray[i];
        const p = board[s];
        if (!p) continue;
        if (p >> 3 === by && !frozen[s]) {
          const t = p & 7;
          if (t === QUEEN || t === (d < 4 ? ROOK : BISHOP) || (t === KING && i === 0)) return true;
        }
        if (!this.jump[s] || jumped) break;
        jumped = true;
      }
    }
    return false;
  }

  inCheck(color: number = this.side): boolean {
    const k = this.king[color];
    return k >= 0 && this.isAttacked(k, color ^ 1);
  }

  canCast(type: number, color: number = this.side): boolean {
    if (!this.spellMode || this.castThisTurn) return false;
    const base = color * 4 + (type === SPELL_FREEZE ? FREEZE_CHARGES : JUMP_CHARGES);
    return this.resources[base] > 0 && this.resources[base + 1] === 0;
  }

  private slidesAlong(type: number, direction: number): boolean {
    return type === QUEEN || type === (direction < 4 ? ROOK : BISHOP);
  }

  /**
   * An executable capture of the enemy king by `color` in the current position, with or
   * without casting Jump. Returns the spell and move, or null.
   */
  findKingCapture(color: number = this.side): { spell: number; move: number } | null {
    const target = this.king[color ^ 1];
    if (target < 0) return null;
    const board = this.board, frozen = this.frozen, colorBits = color << 3;
    const promo = (from: number): number =>
      (board[from] & 7) === PAWN && (target >> 3) === (color === WHITE ? 7 : 0) ? QUEEN : 0;
    for (const s of PAWN_CAPTURES[color ^ 1][target]) {
      if (board[s] === (PAWN | colorBits) && !frozen[s]) {
        return { spell: SPELL_NONE, move: encodeMove(s, target, promo(s), FLAG_CAPTURE) };
      }
    }
    for (const s of KNIGHT_TARGETS[target]) {
      if (board[s] === (KNIGHT | colorBits) && !frozen[s]) {
        return { spell: SPELL_NONE, move: encodeMove(s, target, 0, FLAG_CAPTURE) };
      }
    }
    let viaJump: { spell: number; move: number } | null = null;
    const mayJump = this.canCast(SPELL_JUMP, color);
    const rays = RAYS[target];
    for (let d = 0; d < 8; d++) {
      const ray = rays[d];
      let blocker = -1;
      for (let i = 0; i < ray.length; i++) {
        const s = ray[i];
        const p = board[s];
        if (!p) continue;
        const mine = p >> 3 === color && !frozen[s];
        const type = p & 7;
        const reaches = mine && (this.slidesAlong(type, d) || (type === KING && i === 0));
        if (blocker < 0) {
          if (reaches) return { spell: SPELL_NONE, move: encodeMove(s, target, 0, FLAG_CAPTURE) };
          blocker = s;
          continue;
        }
        // One blocker between this piece and the king.
        if (mine && this.slidesAlong(type, d)) {
          if (this.jump[blocker] || this.jump[s]) {
            return { spell: SPELL_NONE, move: encodeMove(s, target, 0, FLAG_CAPTURE) };
          }
          if (mayJump && !viaJump) {
            viaJump = { spell: encodeSpell(SPELL_JUMP, blocker), move: encodeMove(s, target, 0, FLAG_CAPTURE) };
          }
        }
        break;
      }
    }
    return viaJump;
  }

  /**
   * Enemy pieces that would be able to capture `color`'s king on the next turn if `color`
   * ignored the threat (effects expired, one Jump allowed when the enemy has it ready).
   */
  royalThreats(color: number, out: number[] = []): number[] {
    out.length = 0;
    const target = this.king[color];
    if (target < 0) return out;
    const enemy = color ^ 1;
    const board = this.board, enemyBits = enemy << 3;
    const base = enemy * 4 + JUMP_CHARGES;
    const jumpReady = this.spellMode && this.resources[base] > 0 && this.resources[base + 1] === 0;
    for (const s of PAWN_CAPTURES[color][target]) if (board[s] === (PAWN | enemyBits) && this.frozen[s] < 2) out.push(s);
    for (const s of KNIGHT_TARGETS[target]) if (board[s] === (KNIGHT | enemyBits) && this.frozen[s] < 2) out.push(s);
    const rays = RAYS[target];
    for (let d = 0; d < 8; d++) {
      const ray = rays[d];
      let blockers = 0;
      let passable = false;
      for (let i = 0; i < ray.length; i++) {
        const s = ray[i];
        const p = board[s];
        if (!p) continue;
        if (p >> 3 === enemy && this.slidesAlong(p & 7, d) && this.frozen[s] < 2 &&
          (blockers === 0 || passable || jumpReady)) {
          out.push(s);
          break;
        }
        if (++blockers > 1) break;
        passable = this.jump[s] > 1;
      }
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Move generation (pseudo-legal; make() rejects self-check when required)
  // -------------------------------------------------------------------------
  generate(out: Int32Array, offset: number, tacticalOnly = false): number {
    const board = this.board, side = this.side;
    let n = offset;
    for (let from = 0; from < 64; from++) {
      const p = board[from];
      if (!p || p >> 3 !== side || this.frozen[from]) continue;
      const type = p & 7;
      if (type === PAWN) {
        n = this.generatePawn(out, n, from, tacticalOnly);
      } else if (type === KNIGHT || type === KING) {
        const list = type === KNIGHT ? KNIGHT_TARGETS[from] : KING_TARGETS[from];
        for (let i = 0; i < list.length; i++) {
          const to = list[i];
          const q = board[to];
          if (q) { if (q >> 3 !== side) out[n++] = encodeMove(from, to, 0, FLAG_CAPTURE); }
          else if (!tacticalOnly) out[n++] = encodeMove(from, to);
        }
        if (type === KING && !tacticalOnly && this.castling) n = this.generateCastling(out, n, from);
      } else {
        const first = type === BISHOP ? 4 : 0;
        const last = type === ROOK ? 4 : 8;
        const canLeap = this.jump[from] > 0;
        for (let d = first; d < last; d++) {
          const ray = RAYS[from][d];
          let jumped = false;
          for (let i = 0; i < ray.length; i++) {
            const to = ray[i];
            const q = board[to];
            if (!q) {
              if (!tacticalOnly) out[n++] = encodeMove(from, to);
              continue;
            }
            if (q >> 3 !== side) out[n++] = encodeMove(from, to, 0, FLAG_CAPTURE);
            if (jumped || !(canLeap || this.jump[to])) break;
            jumped = true;
          }
        }
      }
    }
    return n;
  }

  private pushPawnMove(out: Int32Array, n: number, from: number, to: number, flags: number): number {
    const rank = to >> 3;
    if (rank === 7 || rank === 0) {
      out[n++] = encodeMove(from, to, QUEEN, flags);
      out[n++] = encodeMove(from, to, KNIGHT, flags);
      out[n++] = encodeMove(from, to, ROOK, flags);
      out[n++] = encodeMove(from, to, BISHOP, flags);
    } else {
      out[n++] = encodeMove(from, to, 0, flags);
    }
    return n;
  }

  private generatePawn(out: Int32Array, n: number, from: number, tacticalOnly: boolean): number {
    const board = this.board, side = this.side;
    const step = side === WHITE ? 8 : -8;
    const one = from + step;
    const onBoard = one >= 0 && one < 64;
    const two = one + step;
    const twoOnBoard = two >= 0 && two < 64;
    if (onBoard && !board[one]) {
      const promotes = (one >> 3) === 7 || (one >> 3) === 0;
      if (!tacticalOnly || promotes) n = this.pushPawnMove(out, n, from, one, 0);
      if (!tacticalOnly && (from >> 3) === (side === WHITE ? 1 : 6) && !this.noDouble[from] && twoOnBoard && !board[two]) {
        out[n++] = encodeMove(from, two, 0, FLAG_DOUBLE);
      }
    } else if (onBoard && (this.jump[from] || this.jump[one])) {
      if (twoOnBoard && !board[two]) {
        const promotes = (two >> 3) === 7 || (two >> 3) === 0;
        if (!tacticalOnly || promotes) n = this.pushPawnMove(out, n, from, two, FLAG_DOUBLE);
      }
    }
    const captures = PAWN_CAPTURES[side][from];
    for (let i = 0; i < captures.length; i++) {
      const to = captures[i];
      const q = board[to];
      if (q) { if (q >> 3 !== side) n = this.pushPawnMove(out, n, from, to, FLAG_CAPTURE); }
      else if (to === this.ep) out[n++] = encodeMove(from, to, 0, FLAG_CAPTURE | FLAG_EP);
    }
    return n;
  }

  private generateCastling(out: Int32Array, n: number, from: number): number {
    const side = this.side, home = side === WHITE ? 4 : 60;
    if (from !== home) return n;
    const rights = side === WHITE ? this.castling & 3 : (this.castling >> 2) & 3;
    if (!rights) return n;
    const enemy = side ^ 1, rook = ROOK | (side << 3), board = this.board;
    if (this.isAttacked(from, enemy)) return n;
    if ((rights & 1) && board[home + 3] === rook && !this.frozen[home + 3] && !board[home + 1] && !board[home + 2] &&
      !this.isAttacked(home + 1, enemy) && !this.isAttacked(home + 2, enemy)) {
      out[n++] = encodeMove(from, home + 2, 0, FLAG_CASTLE);
    }
    if ((rights & 2) && board[home - 4] === rook && !this.frozen[home - 4] && !board[home - 1] && !board[home - 2] &&
      !board[home - 3] && !this.isAttacked(home - 1, enemy) && !this.isAttacked(home - 2, enemy)) {
      out[n++] = encodeMove(from, home - 2, 0, FLAG_CASTLE);
    }
    return n;
  }

  // -------------------------------------------------------------------------
  // Make / unmake
  // -------------------------------------------------------------------------
  private nextUndo(): Undo {
    if (this.undoTop === this.undoStack.length) this.undoStack.push(new Undo());
    return this.undoStack[this.undoTop++];
  }

  private moveEffects(from: number, to: number): void {
    if (this.frozen[to]) this.effects--;
    if (this.jump[to]) this.effects--;
    this.frozen[to] = this.frozen[from];
    this.jump[to] = this.jump[from];
    this.frozen[from] = 0;
    this.jump[from] = 0;
  }

  /** Executes a pseudo-legal move and finishes the turn. Returns false (and reverts) if illegal. */
  make(move: number): boolean {
    const u = this.nextUndo();
    const from = move & 63, to = (move >> 6) & 63, promo = (move >> 12) & 7;
    const side = this.side, enemy = side ^ 1;
    const piece = this.board[from];
    const type = piece & 7;
    const capSq = move & FLAG_EP ? to + (side === WHITE ? -8 : 8) : to;
    const captured = this.board[capSq];

    u.move = move; u.piece = piece; u.captured = captured; u.capSq = capSq;
    u.castling = this.castling; u.ep = this.ep; u.halfmove = this.halfmove;
    u.lo = this.lo; u.hi = this.hi; u.mg = this.mg; u.eg = this.eg; u.phase = this.phase;
    u.king0 = this.king[0]; u.king1 = this.king[1]; u.effects = this.effects;
    u.freezeCooldown = this.resources[side * 4 + FREEZE_COOLDOWN];
    u.jumpCooldown = this.resources[side * 4 + JUMP_COOLDOWN];
    u.castThisTurn = this.castThisTurn;
    u.snapshot = this.effects > 0;
    if (u.snapshot) { u.frozen.set(this.frozen); u.jump.set(this.jump); }

    this.historyLo.push(this.keyLo);
    this.historyHi.push(this.keyHi);

    if (this.ep >= 0 && this.epCapturable(this.ep, side)) this.toggle(Z_EP + (this.ep & 7));
    if (captured) {
      this.remove(capSq);
      if ((captured & 7) === KING) this.king[enemy] = -1;
      if (this.effects) {
        if (this.frozen[capSq]) { this.frozen[capSq] = 0; this.effects--; }
        if (this.jump[capSq]) { this.jump[capSq] = 0; this.effects--; }
      }
    }
    this.remove(from);
    this.put(to, side, promo || type);
    if (this.effects) this.moveEffects(from, to);
    if (move & FLAG_CASTLE) {
      const rookFrom = to > from ? from + 3 : from - 4;
      const rookTo = to > from ? from + 1 : from - 1;
      this.remove(rookFrom);
      this.put(rookTo, side, ROOK);
      if (this.effects) this.moveEffects(rookFrom, rookTo);
    }

    if (this.enforceCheck && (captured & 7) !== KING) {
      const own = this.king[side];
      let illegal = own >= 0 && this.isAttacked(own, enemy);
      if (!illegal && type === KING) {
        const other = this.king[enemy];
        illegal = other >= 0 && Math.abs((other & 7) - (to & 7)) <= 1 && Math.abs((other >> 3) - (to >> 3)) <= 1;
      }
      if (illegal) { this.restore(this.undoStack[--this.undoTop]); return false; }
    }

    // Finish the turn: the moved piece loses Jump, effects tick, the mover's cooldowns tick.
    if (this.effects) {
      if (this.jump[to]) { this.jump[to] = 0; this.effects--; }
      for (let sq = 0; sq < 64; sq++) {
        if (this.frozen[sq] && --this.frozen[sq] === 0) this.effects--;
        if (this.jump[sq] && --this.jump[sq] === 0) this.effects--;
      }
    }
    if (this.spellMode) {
      const f = side * 4 + FREEZE_COOLDOWN, j = side * 4 + JUMP_COOLDOWN;
      if (this.resources[f]) this.resources[f]--;
      if (this.resources[j]) this.resources[j]--;
    }

    this.toggle(Z_CASTLE + this.castling);
    if (this.castling) {
      this.castling &= CASTLE_MASK[from] & CASTLE_MASK[to];
    }
    this.toggle(Z_CASTLE + this.castling);

    this.halfmove = type === PAWN || captured ? 0 : this.halfmove + 1;
    this.ep = type === PAWN && Math.abs(to - from) === 16 ? (from + to) >> 1 : -1;
    this.side = enemy;
    this.toggle(Z_SIDE);
    if (this.ep >= 0 && this.epCapturable(this.ep, enemy)) this.toggle(Z_EP + (this.ep & 7));
    this.castThisTurn = false;
    this.updateKey();
    return true;
  }

  unmake(): void {
    const u = this.undoStack[--this.undoTop];
    this.side ^= 1;
    this.resources[this.side * 4 + FREEZE_COOLDOWN] = u.freezeCooldown;
    this.resources[this.side * 4 + JUMP_COOLDOWN] = u.jumpCooldown;
    this.restore(u);
  }

  private restore(u: Undo): void {
    const from = u.move & 63, to = (u.move >> 6) & 63;
    this.board[from] = u.piece;
    this.board[to] = 0;
    if (u.captured) this.board[u.capSq] = u.captured;
    if (u.move & FLAG_CASTLE) {
      const rookFrom = to > from ? from + 3 : from - 4;
      const rookTo = to > from ? from + 1 : from - 1;
      this.board[rookFrom] = this.board[rookTo];
      this.board[rookTo] = 0;
    }
    this.castling = u.castling; this.ep = u.ep; this.halfmove = u.halfmove;
    this.lo = u.lo; this.hi = u.hi; this.mg = u.mg; this.eg = u.eg; this.phase = u.phase;
    this.king[0] = u.king0; this.king[1] = u.king1;
    if (u.snapshot) { this.frozen.set(u.frozen); this.jump.set(u.jump); }
    this.effects = u.effects;
    this.castThisTurn = u.castThisTurn;
    this.keyLo = this.historyLo.pop() as number;
    this.keyHi = this.historyHi.pop() as number;
  }

  /** Passes the turn (null-move pruning in standard chess only). */
  makeNull(): void {
    const u = this.nextUndo();
    u.ep = this.ep; u.halfmove = this.halfmove; u.lo = this.lo; u.hi = this.hi;
    this.historyLo.push(this.keyLo);
    this.historyHi.push(this.keyHi);
    if (this.ep >= 0 && this.epCapturable(this.ep, this.side)) this.toggle(Z_EP + (this.ep & 7));
    this.ep = -1;
    this.halfmove = 0;
    this.side ^= 1;
    this.toggle(Z_SIDE);
    this.updateKey();
  }

  unmakeNull(): void {
    const u = this.undoStack[--this.undoTop];
    this.side ^= 1;
    this.ep = u.ep; this.halfmove = u.halfmove; this.lo = u.lo; this.hi = u.hi;
    this.keyLo = this.historyLo.pop() as number;
    this.keyHi = this.historyHi.pop() as number;
  }

  /** Applies a spell for the side to move. The caller must have checked canCast(). */
  cast(spell: number): void {
    if (this.castTop === this.castStack.length) this.castStack.push(new CastUndo());
    const u = this.castStack[this.castTop++];
    const type = spellType(spell), center = spellSquare(spell);
    const base = this.side * 4 + (type === SPELL_FREEZE ? FREEZE_CHARGES : JUMP_CHARGES);
    u.type = type; u.effects = this.effects; u.count = 0;
    u.charges = this.resources[base]; u.cooldown = this.resources[base + 1];
    const mark = (array: Uint8Array, sq: number): void => {
      u.squares[u.count] = sq;
      u.values[u.count++] = array[sq];
      if (!array[sq]) this.effects++;
      array[sq] = 2;
    };
    if (type === SPELL_FREEZE) {
      const cx = center & 7, cy = center >> 3;
      for (let y = Math.max(0, cy - 1); y <= Math.min(7, cy + 1); y++) {
        for (let x = Math.max(0, cx - 1); x <= Math.min(7, cx + 1); x++) {
          if (this.board[y * 8 + x]) mark(this.frozen, y * 8 + x);
        }
      }
    } else {
      mark(this.jump, center);
    }
    this.resources[base]--;
    this.resources[base + 1] = SPELL_COOLDOWN_TURNS;
    this.castThisTurn = true;
    // The key is refreshed by make(); repetition history keeps the pre-cast key.
  }

  uncast(): void {
    const u = this.castStack[--this.castTop];
    const array = u.type === SPELL_FREEZE ? this.frozen : this.jump;
    for (let i = u.count - 1; i >= 0; i--) array[u.squares[i]] = u.values[i];
    const base = this.side * 4 + (u.type === SPELL_FREEZE ? FREEZE_CHARGES : JUMP_CHARGES);
    this.resources[base] = u.charges;
    this.resources[base + 1] = u.cooldown;
    this.effects = u.effects;
    this.castThisTurn = false;
  }

  /** All strictly legal moves for the side to move. */
  legalMoves(): number[] {
    const buffer = new Int32Array(MOVES_PER_PLY * 2);
    const n = this.generate(buffer, 0);
    const result: number[] = [];
    for (let i = 0; i < n; i++) {
      if (this.make(buffer[i])) { this.unmake(); result.push(buffer[i]); }
    }
    return result;
  }
}

const CASTLE_MASK = new Uint8Array(64).fill(15);
CASTLE_MASK[0] = 15 & ~CASTLE_WQ;
CASTLE_MASK[4] = 15 & ~(CASTLE_WK | CASTLE_WQ);
CASTLE_MASK[7] = 15 & ~CASTLE_WK;
CASTLE_MASK[56] = 15 & ~CASTLE_BQ;
CASTLE_MASK[60] = 15 & ~(CASTLE_BK | CASTLE_BQ);
CASTLE_MASK[63] = 15 & ~CASTLE_BK;
