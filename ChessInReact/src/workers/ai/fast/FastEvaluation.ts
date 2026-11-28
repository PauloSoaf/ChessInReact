/**
 * Static evaluation, from the side to move's point of view, in centipawns.
 *
 * Temporary Freeze and Jump effects are deliberately ignored here: a frozen attacker earns no
 * lasting bonus. Only the search, by playing the following turns, can turn an effect into value.
 */
import {
  BISHOP, BLACK, FREEZE_CHARGES, FREEZE_COOLDOWN, FastPosition, JUMP_CHARGES, JUMP_COOLDOWN, KING,
  KING_TARGETS, KNIGHT, KNIGHT_TARGETS, PAWN, PAWN_CAPTURES, QUEEN, RAYS, ROOK, WHITE,
} from './FastPosition';

export const PIECE_VALUE = [0, 100, 320, 330, 500, 920, 20000];

/** Cumulative worth of holding n charges: the last charge is the most precious one. */
export const FREEZE_RESERVE = [0, 170, 300, 405, 495, 575];
export const JUMP_RESERVE = [0, 210, 360];
/** Worth of availability, indexed by remaining cooldown. */
export const READINESS = [34, 20, 9, 0];

export function spellReserve(position: FastPosition, color: number): number {
  const base = color * 4;
  const freeze = position.resources[base + FREEZE_CHARGES];
  const jump = position.resources[base + JUMP_CHARGES];
  return FREEZE_RESERVE[Math.min(5, freeze)] + JUMP_RESERVE[Math.min(2, jump)] +
    (freeze ? READINESS[Math.min(3, position.resources[base + FREEZE_COOLDOWN])] : 0) +
    (jump ? READINESS[Math.min(3, position.resources[base + JUMP_COOLDOWN])] : 0);
}

const MOBILITY_MG = [0, 0, 4, 5, 2, 1];
const MOBILITY_EG = [0, 0, 4, 5, 4, 2];
const MOBILITY_BASE = [0, 0, 4, 6, 6, 12];
const KING_ATTACK_WEIGHT = [0, 0, 2, 2, 3, 5];
const KING_DANGER = [
  0, 0, 3, 7, 13, 20, 29, 40, 52, 66, 81, 98, 117, 137, 158, 181, 205, 231, 258, 286,
  315, 345, 375, 405, 435, 465, 492, 517, 540, 560, 578, 594, 608, 620, 630, 640, 648, 655, 660, 665,
];
const PASSED_MG = [0, 5, 8, 14, 28, 55, 90, 0];
const PASSED_EG = [0, 12, 20, 36, 62, 105, 165, 0];

const pawnAttack = [new Uint8Array(64), new Uint8Array(64)];
/** Cheapest non-pawn attacker type per square (0 = none). */
const lightest = [new Uint8Array(64), new Uint8Array(64)];
const pawnsOnFile = [new Uint8Array(10), new Uint8Array(10)];
/** Rank of the rearmost pawn per file, from each colour's own point of view. */
const rearPawn = [new Uint8Array(10), new Uint8Array(10)];
const frontPawn = [new Uint8Array(10), new Uint8Array(10)];
const zone = [new Uint8Array(64), new Uint8Array(64)];
const kingUnits = [0, 0];
const kingAttackers = [0, 0];
const pieceSquares = new Int8Array(32);
const mgSide = [0, 0];
const egSide = [0, 0];

function markZone(color: number, king: number): void {
  const z = zone[color];
  z.fill(0);
  if (king < 0) return;
  z[king] = 1;
  for (const s of KING_TARGETS[king]) {
    z[s] = 1;
    const ahead = s + (color === WHITE ? 8 : -8);
    if (ahead >= 0 && ahead < 64) z[ahead] = 1;
  }
}

export function evaluate(position: FastPosition): number {
  const board = position.board;
  let count = 0;
  for (let c = 0; c < 2; c++) {
    pawnAttack[c].fill(0);
    lightest[c].fill(0);
    pawnsOnFile[c].fill(0);
    rearPawn[c].fill(8);
    frontPawn[c].fill(0);
    kingUnits[c] = 0;
    kingAttackers[c] = 0;
    mgSide[c] = 0;
    egSide[c] = 0;
  }
  markZone(0, position.king[0]);
  markZone(1, position.king[1]);

  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (!p) continue;
    pieceSquares[count++] = sq;
    if ((p & 7) !== PAWN) continue;
    const color = p >> 3, file = (sq & 7) + 1;
    const rank = color === WHITE ? sq >> 3 : 7 - (sq >> 3);
    pawnsOnFile[color][file]++;
    if (rank < rearPawn[color][file]) rearPawn[color][file] = rank;
    if (rank > frontPawn[color][file]) frontPawn[color][file] = rank;
    for (const s of PAWN_CAPTURES[color][sq]) pawnAttack[color][s] = 1;
  }

  const bishops = [0, 0];
  const material = [0, 0];
  const pawnCount = [0, 0];

  for (let index = 0; index < count; index++) {
    const sq = pieceSquares[index];
    const p = board[sq];
    const color = p >> 3, type = p & 7, enemy = color ^ 1;
    if (type === PAWN) { pawnCount[color]++; continue; }
    if (type !== KING) material[color] += PIECE_VALUE[type];
    if (type === BISHOP) bishops[color]++;

    let mobility = 0;
    let zoneHits = 0;
    const record = (s: number): void => {
      const current = lightest[color][s];
      if (!current || type < current) lightest[color][s] = type;
      if (zone[enemy][s]) zoneHits++;
      const q = board[s];
      if ((!q || q >> 3 !== color) && !pawnAttack[enemy][s]) mobility++;
    };
    if (type === KNIGHT || type === KING) {
      const list = type === KNIGHT ? KNIGHT_TARGETS[sq] : KING_TARGETS[sq];
      for (let i = 0; i < list.length; i++) record(list[i]);
    } else {
      const first = type === BISHOP ? 4 : 0;
      const last = type === ROOK ? 4 : 8;
      for (let d = first; d < last; d++) {
        const ray = RAYS[sq][d];
        for (let i = 0; i < ray.length; i++) {
          const s = ray[i];
          record(s);
          if (board[s]) break;
        }
      }
    }
    if (type !== KING) {
      mgSide[color] += (mobility - MOBILITY_BASE[type]) * MOBILITY_MG[type];
      egSide[color] += (mobility - MOBILITY_BASE[type]) * MOBILITY_EG[type];
      if (zoneHits) {
        kingAttackers[enemy]++;
        kingUnits[enemy] += KING_ATTACK_WEIGHT[type] * Math.min(zoneHits, 3);
      }
    }
  }

  const threats = [0, 0];
  const hanging = [0, 0];
  const sideToMove = position.side;

  for (let index = 0; index < count; index++) {
    const sq = pieceSquares[index];
    const p = board[sq];
    const color = p >> 3, type = p & 7, enemy = color ^ 1;
    const file = (sq & 7) + 1;
    const rank = color === WHITE ? sq >> 3 : 7 - (sq >> 3);

    if (type === PAWN) {
      if (pawnsOnFile[color][file] > 1 && rank !== frontPawn[color][file]) {
        mgSide[color] -= 10;
        egSide[color] -= 18;
      }
      const isolated = !pawnsOnFile[color][file - 1] && !pawnsOnFile[color][file + 1];
      if (isolated) { mgSide[color] -= 12; egSide[color] -= 12; }
      else if (pawnAttack[color][sq]) { mgSide[color] += 8; egSide[color] += 6; }
      let passed = rank === frontPawn[color][file];
      for (let f = file - 1; passed && f <= file + 1; f++) {
        // Enemy ranks are mirrored; an enemy pawn ahead of us has mirrored rank < 7 - rank.
        if (pawnsOnFile[enemy][f] && rearPawn[enemy][f] < 7 - rank) passed = false;
      }
      if (passed) {
        const stop = sq + (color === WHITE ? 8 : -8);
        const blocked = stop >= 0 && stop < 64 && board[stop] !== 0;
        mgSide[color] += blocked ? PASSED_MG[rank] >> 1 : PASSED_MG[rank];
        egSide[color] += blocked ? PASSED_EG[rank] >> 1 : PASSED_EG[rank];
        const ownKing = position.king[color], enemyKing = position.king[enemy];
        if (rank >= 3 && ownKing >= 0 && enemyKing >= 0 && stop >= 0 && stop < 64) {
          egSide[color] += (distance(enemyKing, stop) * 5 - distance(ownKing, stop) * 2) * (rank - 2);
        }
      }
    } else if (type === ROOK) {
      if (!pawnsOnFile[color][file]) {
        mgSide[color] += pawnsOnFile[enemy][file] ? 14 : 28;
        egSide[color] += pawnsOnFile[enemy][file] ? 8 : 12;
      }
      if (rank === 6) { mgSide[color] += 12; egSide[color] += 22; }
    }

    if (type === KING) continue;
    // Threats: what the enemy can profitably hit.
    const attackedByPawn = pawnAttack[enemy][sq] === 1;
    const attacker = lightest[enemy][sq];
    const defended = pawnAttack[color][sq] === 1 || lightest[color][sq] !== 0;
    let penalty = 0;
    if (type !== PAWN && attackedByPawn) penalty = 28 + (PIECE_VALUE[type] >> 4);
    else if (attacker && type > BISHOP && attacker < type && attacker !== KING) penalty = 20 + (PIECE_VALUE[type] >> 5);
    else if ((attacker || attackedByPawn) && !defended) penalty = type === PAWN ? 12 : 22 + (PIECE_VALUE[type] >> 5);
    if (penalty) {
      // A threat against the side that is not moving will be cashed immediately.
      threats[color] += color === sideToMove ? penalty >> 1 : penalty;
      if (type !== PAWN) hanging[color]++;
    }
  }

  for (let color = 0; color < 2; color++) {
    const enemy = color ^ 1;
    if (hanging[color] > 1) threats[color] += 30;
    mgSide[color] -= threats[color];
    egSide[color] -= threats[color];
    if (bishops[color] > 1) { mgSide[color] += 28; egSide[color] += 48; }

    const king = position.king[color];
    if (king < 0) continue;
    // King safety: attackers around the king plus the state of its pawn shield.
    let enemyHasQueen = false;
    for (let index = 0; index < count && !enemyHasQueen; index++) {
      enemyHasQueen = board[pieceSquares[index]] === (QUEEN | (enemy << 3));
    }
    let units = kingUnits[color];
    if (kingAttackers[color] < 2) units >>= 1;
    const kingFile = king & 7;
    const kingRank = color === WHITE ? king >> 3 : 7 - (king >> 3);
    let shelter = 0;
    for (let f = Math.max(0, kingFile - 1); f <= Math.min(7, kingFile + 1); f++) {
      const own = rearPawn[color][f + 1];
      if (own === 8) { shelter -= 22; units += 2; }
      else if (own === kingRank + 1) shelter += 14;
      else if (own === kingRank + 2) shelter += 6;
      else shelter -= 8;
      if (!pawnsOnFile[enemy][f + 1] && !pawnsOnFile[color][f + 1]) shelter -= 8;
    }
    if (kingRank > 1) shelter -= 18 * Math.min(4, kingRank - 1);
    let danger = KING_DANGER[Math.min(KING_DANGER.length - 1, units)];
    if (!enemyHasQueen) { danger >>= 2; shelter >>= 1; }
    mgSide[color] += shelter - danger;
  }

  const phase = Math.min(24, position.phase);
  const mg = position.mg + mgSide[WHITE] - mgSide[BLACK];
  const eg = position.eg + egSide[WHITE] - egSide[BLACK];
  let score = ((mg * phase + eg * (24 - phase)) / 24) | 0;

  // Mop-up: drive a bare-ish king to the edge so that won endings are actually converted.
  const strong = score >= 0 ? WHITE : BLACK;
  const weak = strong ^ 1;
  if (!pawnCount[weak] && material[strong] - material[weak] >= 400 && position.king[0] >= 0 && position.king[1] >= 0) {
    const loser = position.king[weak];
    const edge = Math.max(3 - (loser & 7), (loser & 7) - 4) + Math.max(3 - (loser >> 3), (loser >> 3) - 4);
    const bonus = edge * 14 + (7 - distance(position.king[0], position.king[1])) * 8;
    score += strong === WHITE ? bonus : -bonus;
  }
  // Without pawns, a small material edge is usually not enough to win.
  if (!position.spellMode && !pawnCount[strong] && material[strong] - material[weak] <= 330) score = (score / 6) | 0;

  if (position.spellMode) score += spellReserve(position, WHITE) - spellReserve(position, BLACK);

  return (sideToMove === WHITE ? score : -score) + 14;
}

function distance(a: number, b: number): number {
  return Math.max(Math.abs((a & 7) - (b & 7)), Math.abs((a >> 3) - (b >> 3)));
}
