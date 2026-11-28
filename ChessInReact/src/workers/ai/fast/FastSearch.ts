/**
 * Iterative-deepening principal variation search shared by both level 5 engines.
 *
 * Transposition table, null move (standard chess), late move reductions, killer and history
 * ordering, static exchange evaluation and a quiescence search that answers checks and, in
 * Spell Chess, spell-assisted captures and attacks on the king.
 */
import {
  BISHOP, FLAG_CAPTURE, FLAG_EP, FastPosition, KING, KING_TARGETS, KNIGHT, KNIGHT_TARGETS, MAX_PLY,
  MOVES_PER_PLY, PAWN, PAWN_CAPTURES, QUEEN, RAYS, ROOK, SPELL_JUMP, SPELL_NONE, moveFrom, movePromo, moveTo,
} from './FastPosition';
import { PIECE_VALUE, evaluate } from './FastEvaluation';
import {
  ISpellTurn, defensiveSpellTurns, rootSpellTurns, tacticalSpellTurns, unlockingSpellTurns,
} from './spellTurns';

export const MATE = 100000;
const MATE_BOUND = MATE - 1000;
const INFINITE = MATE + 1;
const CONTEMPT = 18;
/** A spell must beat the best ordinary turn by this much, on top of the reserve it consumes. */
export const SPELL_MARGIN = 35;

const TT_BITS = 18;
const TT_MASK = (1 << TT_BITS) - 1;
const EXACT = 1, LOWER = 2, UPPER = 3;

export interface ITurn {
  readonly spell: number;
  readonly move: number;
}

export interface IRootTurn extends ITurn {
  score: number;
  /** Deepest iteration that finished this turn. */
  depth: number;
  /** false when `score` is only an upper bound from a null-window search. */
  exact: boolean;
  /** The turn lets the opponent capture our king immediately. */
  allowsKingCapture: boolean;
  pv: ITurn[];
}

/** The best turn without magic, from the same iteration that produced the decision. */
export interface IBaseline {
  readonly turn: IRootTurn;
  readonly score: number;
  readonly depth: number;
  readonly pv: ITurn[];
}

export interface ISearchLimits {
  readonly timeMs: number;
  readonly maxDepth?: number;
  /** Depth always completed, even past the time budget. */
  readonly minDepth?: number;
}

export interface ISearchOutcome {
  readonly best: IRootTurn;
  readonly baseline: IBaseline | null;
  readonly depth: number;
  readonly selectiveDepth: number;
  readonly nodes: number;
  readonly elapsedMs: number;
  readonly timedOut: boolean;
  readonly rootTurns: IRootTurn[];
}

class Timeout extends Error {}

export class FastSearch {
  private readonly ttCheck = new Int32Array(1 << TT_BITS);
  private readonly ttMove = new Int32Array(1 << TT_BITS);
  private readonly ttSpell = new Int16Array(1 << TT_BITS);
  private readonly ttScore = new Int32Array(1 << TT_BITS);
  private readonly ttDepth = new Int8Array(1 << TT_BITS);
  private readonly ttFlag = new Uint8Array(1 << TT_BITS);

  private readonly moves = new Int32Array(MAX_PLY * MOVES_PER_PLY);
  private readonly order = new Int32Array(MAX_PLY * MOVES_PER_PLY);
  private readonly killers = new Int32Array(MAX_PLY * 2);
  /** The spell turn that last refuted a sibling position, per ply. */
  private readonly spellKillers = new Int32Array(MAX_PLY);
  private readonly spellKillerMoves = new Int32Array(MAX_PLY);
  private readonly history = new Int32Array(2 * 64 * 64);
  private readonly pv: ITurn[][] = Array.from({ length: MAX_PLY + 1 }, () => []);

  private position!: FastPosition;
  private nodes = 0;
  private deadline = 0;
  private abortable = false;
  private rootDepth = 1;
  private selectiveDepth = 0;

  search(position: FastPosition, limits: ISearchLimits): ISearchOutcome {
    const start = performance.now();
    this.position = position;
    this.nodes = 0;
    this.selectiveDepth = 0;
    this.deadline = start + Math.max(1, limits.timeMs);
    this.killers.fill(0);
    this.spellKillers.fill(0);
    this.history.fill(0);
    this.ttFlag.fill(0);

    const rootTurns = this.collectRootTurns();
    if (!rootTurns.length) throw new Error('No legal turn available for the search.');

    const immediate = position.spellMode ? position.findKingCapture() : null;
    if (immediate) {
      const turn = rootTurns.find((t) => t.spell === immediate.spell && moveTo(t.move) === moveTo(immediate.move) &&
        moveFrom(t.move) === moveFrom(immediate.move)) ?? this.rootTurn(immediate.spell, immediate.move);
      if (!rootTurns.includes(turn)) rootTurns.push(turn);
      Object.assign(turn, { score: MATE - 1, depth: 1, exact: true, pv: [{ spell: turn.spell, move: turn.move }] });
      return {
        best: turn, baseline: null, depth: 1, selectiveDepth: 1, nodes: 1,
        elapsedMs: performance.now() - start, timedOut: false, rootTurns,
      };
    }

    const maxDepth = Math.min(limits.maxDepth ?? 64, MAX_PLY - 32);
    const minDepth = Math.min(limits.minDepth ?? 1, maxDepth);
    let best = rootTurns[0];
    let completed = 0;
    let timedOut = false;
    let baseline: IBaseline | null = null;

    for (let depth = 1; depth <= maxDepth; depth++) {
      this.rootDepth = depth;
      this.abortable = depth > minDepth;
      const candidates = this.candidatesFor(rootTurns, depth, best);
      let iteration: { turn: IRootTurn; baseline: IBaseline | null } | null = null;
      try {
        this.searchRoot(candidates, depth, best, (turn, reference) => { iteration = { turn, baseline: reference }; });
      } catch (error) {
        if (!(error instanceof Timeout)) throw error;
        timedOut = true;
      }
      // A partial iteration is still informative: the previous best is always searched first.
      const found = iteration as { turn: IRootTurn; baseline: IBaseline | null } | null;
      if (found) {
        best = found.turn;
        baseline = found.baseline;
      }
      if (timedOut) break;
      completed = depth;
      if (Math.abs(best.score) >= MATE_BOUND && depth >= MATE - Math.abs(best.score) + 2) break;
      if (depth >= minDepth && performance.now() - start > limits.timeMs * 0.55) break;
      if (rootTurns.length === 1 && depth >= minDepth) break;
    }

    return {
      best, baseline, depth: completed, selectiveDepth: this.selectiveDepth, nodes: this.nodes,
      elapsedMs: performance.now() - start, timedOut, rootTurns,
    };
  }

  private rootTurn(spell: number, move: number): IRootTurn {
    return { spell, move, score: -INFINITE, depth: 0, exact: false, allowsKingCapture: false, pv: [{ spell, move }] };
  }

  private collectRootTurns(): IRootTurn[] {
    const position = this.position;
    const turns: IRootTurn[] = [];
    const count = position.generate(this.moves, 0);
    this.scoreMoves(0, count, 0, 0);
    for (let i = 0; i < count; i++) {
      const move = this.pick(0, i, count);
      if (!position.make(move)) continue;
      const turn = this.rootTurn(SPELL_NONE, move);
      turn.allowsKingCapture = position.spellMode && position.findKingCapture() !== null;
      turns.push(turn);
      position.unmake();
    }
    if (!position.spellMode) return turns;
    const spells = turns.length ? rootSpellTurns(position) : unlockingSpellTurns(position);
    for (const candidate of spells) {
      position.cast(candidate.spell);
      if (position.make(candidate.move)) {
        const turn = this.rootTurn(candidate.spell, candidate.move);
        turn.allowsKingCapture = position.findKingCapture() !== null;
        turns.push(turn);
        position.unmake();
      }
      position.uncast();
    }
    return turns;
  }

  /** Progressive narrowing: every ordinary move stays, only promising spell turns go deeper. */
  private candidatesFor(turns: IRootTurn[], depth: number, best: IRootTurn): IRootTurn[] {
    const rank = (a: IRootTurn, b: IRootTurn): number =>
      Number(b === best) - Number(a === best) || b.score - a.score;
    const normal = turns.filter((t) => t.spell === SPELL_NONE).sort(depth > 1 ? rank : () => 0);
    let spell = turns.filter((t) => t.spell !== SPELL_NONE);
    if (depth > 1) spell.sort(rank);
    const limit = depth <= 1 ? spell.length : depth === 2 ? 120 : depth === 3 ? 48 : depth === 4 ? 24 : 12;
    if (spell.length > limit) {
      const kept = spell.slice(0, limit);
      if (best.spell !== SPELL_NONE && !kept.includes(best)) kept.push(best);
      spell = kept;
    }
    return [...normal, ...spell];
  }

  /**
   * Ordinary turns are searched first, which yields the exact best result WITHOUT magic. Each
   * spell turn must then beat that result by a margin, on top of the reserve it consumes.
   * `improved` reports only turns that are safe to play if the clock stops right there.
   */
  private searchRoot(
    turns: IRootTurn[], depth: number, previous: IRootTurn,
    report: (turn: IRootTurn, baseline: IBaseline | null) => void,
  ): void {
    const previousFirst = (list: IRootTurn[]): IRootTurn[] =>
      list.includes(previous) ? [previous, ...list.filter((t) => t !== previous)] : list;
    const normals = previousFirst(turns.filter((t) => t.spell === SPELL_NONE));
    const spells = previousFirst(turns.filter((t) => t.spell !== SPELL_NONE));

    let bestNormal: IRootTurn | null = null;
    let reference: IBaseline | null = null;
    const improved = (turn: IRootTurn): void => report(turn, reference);
    for (const turn of normals) {
      // Depth one uses full windows so that every turn gets a real ordering score.
      this.searchRootTurn(turn, depth, depth === 1 || !bestNormal ? -INFINITE : bestNormal.score);
      if (turn.exact && (!bestNormal || turn.score > bestNormal.score)) {
        bestNormal = turn;
        reference = { turn, score: turn.score, depth, pv: turn.pv };
        if (previous.spell === SPELL_NONE) improved(turn);
      }
    }

    // When every ordinary turn is mated, any better spell turn qualifies without a margin.
    const floor = !bestNormal ? -INFINITE
      : bestNormal.score <= -MATE_BOUND ? bestNormal.score : bestNormal.score + SPELL_MARGIN;
    let bestSpell: IRootTurn | null = null;
    for (const turn of spells) {
      const threshold = bestSpell ? Math.max(floor, bestSpell.score) : floor;
      this.searchRootTurn(turn, depth, depth === 1 ? -INFINITE : threshold);
      if (turn.exact && turn.score > threshold) {
        bestSpell = turn;
        improved(turn);
      } else if (turn === previous && bestNormal) {
        improved(bestNormal); // the earlier spell choice was refuted at this depth
      }
    }
    improved((bestSpell ?? bestNormal) as IRootTurn);
  }

  private searchRootTurn(turn: IRootTurn, depth: number, threshold: number): void {
    const position = this.position;
    if (turn.spell !== SPELL_NONE) position.cast(turn.spell);
    position.make(turn.move);
    let score: number;
    let exact = true;
    try {
      if (threshold <= -INFINITE) {
        score = -this.negamax(depth - 1, -INFINITE, INFINITE, 1, true);
      } else {
        score = -this.negamax(depth - 1, -threshold - 1, -threshold, 1, true);
        if (score > threshold) score = -this.negamax(depth - 1, -INFINITE, -threshold, 1, true);
        exact = score > threshold;
      }
    } catch (error) {
      this.unwind(turn);
      throw error;
    }
    position.unmake();
    if (turn.spell !== SPELL_NONE) position.uncast();
    turn.score = score;
    turn.depth = depth;
    turn.exact = exact;
    if (exact) turn.pv = [{ spell: turn.spell, move: turn.move }, ...this.pv[1]];
  }

  /** A timeout leaves moves on the board; the root restores the position before rethrowing. */
  private unwind(turn: ITurn): void {
    while (this.line.length) {
      const step = this.line.pop() as number;
      if (step === 0) this.position.unmakeNull();
      else {
        this.position.unmake();
        if (step === 2) this.position.uncast();
      }
    }
    this.position.unmake();
    if (turn.spell !== SPELL_NONE) this.position.uncast();
  }

  /** Moves currently made below the root: 0 null, 1 move, 2 spell turn. */
  private readonly line: number[] = [];

  private tick(): void {
    if ((++this.nodes & 255) === 0 && this.abortable && performance.now() >= this.deadline) throw new Timeout();
  }

  private drawScore(ply: number): number {
    return ply % 2 === 0 ? -CONTEMPT : CONTEMPT;
  }

  private negamax(depth: number, alpha: number, beta: number, ply: number, allowNull: boolean): number {
    const position = this.position;
    this.pv[ply].length = 0;
    this.tick();

    if (position.spellMode) {
      if (position.king[position.side] < 0) return -MATE + ply;
      const win = position.findKingCapture();
      if (win) {
        this.pv[ply].push(win);
        return MATE - ply - 1;
      }
    }
    if (position.halfmove >= 100 || position.isRepetition()) return this.drawScore(ply);
    if (!position.spellMode && position.isInsufficientMaterial()) return this.drawScore(ply);
    if (ply >= MAX_PLY - 8) return evaluate(position);

    alpha = Math.max(alpha, -MATE + ply);
    beta = Math.min(beta, MATE - ply - 1);
    if (alpha >= beta) return alpha;

    const inCheck = position.inCheck();
    if (inCheck && ply < this.rootDepth * 2) depth++;
    if (depth <= 0) {
      // Never judge our own spell turn while it is still shaping the board: play the reply.
      if (position.spellMode && position.effects && ply === 1) depth = 1;
      else return this.quiescence(alpha, beta, ply, 0);
    }
    const threats = position.spellMode ? position.royalThreats(position.side) : null;
    const danger = inCheck || (threats !== null && threats.length > 0);

    const pvNode = beta - alpha > 1;
    const slot = position.keyLo & TT_MASK;
    let hashMove = 0, hashSpell = 0;
    if (this.ttFlag[slot] && this.ttCheck[slot] === position.keyHi) {
      hashMove = this.ttMove[slot];
      hashSpell = this.ttSpell[slot];
      if (!pvNode && this.ttDepth[slot] >= depth) {
        let score = this.ttScore[slot];
        if (score > MATE_BOUND) score -= ply; else if (score < -MATE_BOUND) score += ply;
        const flag = this.ttFlag[slot];
        if (flag === EXACT || (flag === LOWER && score >= beta) || (flag === UPPER && score <= alpha)) return score;
      }
    }

    const staticEval = inCheck ? -INFINITE : evaluate(position);
    if (!pvNode && !danger && Math.abs(beta) < MATE_BOUND) {
      if (depth <= 4 && staticEval - (position.spellMode ? 170 : 95) * depth >= beta) return staticEval;
      if (!position.spellMode && allowNull && depth >= 3 && staticEval >= beta && position.hasNonPawnMaterial(position.side)) {
        const reduction = depth >= 7 ? 4 : 3;
        position.makeNull();
        this.line.push(0);
        const score = -this.negamax(depth - 1 - reduction, -beta, -beta + 1, ply + 1, false);
        this.line.pop();
        position.unmakeNull();
        if (score >= beta) return score >= MATE_BOUND ? beta : score;
      }
    }
    if (!hashMove && depth >= 5) depth--;

    const originalAlpha = alpha;
    let bestScore = -INFINITE;
    let bestMove = 0, bestSpell = 0;
    let searched = 0;
    let quiets = 0;
    const side = position.side;

    const consider = (move: number, spell: number): boolean => {
      const quiet = !(move & FLAG_CAPTURE) && !movePromo(move);
      if (spell) position.cast(spell);
      if (!position.make(move)) {
        if (spell) position.uncast();
        return false;
      }
      this.line.push(spell ? 2 : 1);
      const givesCheck = position.inCheck();
      let prune = false;
      if (!pvNode && !danger && !givesCheck && quiet && !spell && searched > 0 && bestScore > -MATE_BOUND) {
        if (depth <= 3 && quiets > 3 + depth * depth * 2) prune = true;
        if (depth <= 2 && staticEval + 130 * depth <= alpha) prune = true;
      }
      let score = alpha;
      if (!prune) {
        searched++;
        if (quiet && !spell) quiets++;
        if (searched === 1) {
          score = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
        } else {
          let reduction = 0;
          if (depth >= 3 && searched > 3 && quiet && !inCheck && !givesCheck) {
            reduction = Math.floor(0.7 + Math.log(depth) * Math.log(searched) / 2.3);
            if (pvNode) reduction--;
            if (move === this.killers[ply * 2] || move === this.killers[ply * 2 + 1]) reduction--;
            reduction = Math.max(0, Math.min(reduction, depth - 2));
          }
          if (spell && quiet && depth >= 2) reduction = Math.max(reduction, searched > 40 ? 2 : 1);
          reduction = Math.min(reduction, Math.max(0, depth - 1));
          score = -this.negamax(depth - 1 - reduction, -alpha - 1, -alpha, ply + 1, true);
          if (score > alpha && reduction > 0) score = -this.negamax(depth - 1, -alpha - 1, -alpha, ply + 1, true);
          if (score > alpha && score < beta) score = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
        }
      }
      this.line.pop();
      position.unmake();
      if (spell) position.uncast();
      if (prune) return false;

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
        bestSpell = spell;
      }
      if (score > alpha) {
        alpha = score;
        const line = this.pv[ply];
        line.length = 0;
        line.push({ spell, move });
        for (const step of this.pv[ply + 1]) line.push(step);
      }
      if (alpha >= beta) {
        if (spell) {
          this.spellKillers[ply] = spell;
          this.spellKillerMoves[ply] = move;
        }
        if (quiet && !spell) {
          if (this.killers[ply * 2] !== move) {
            this.killers[ply * 2 + 1] = this.killers[ply * 2];
            this.killers[ply * 2] = move;
          }
          const h = side * 4096 + (move & 4095);
          this.history[h] = Math.min(900000, this.history[h] + depth * depth);
        }
        return true;
      }
      return false;
    };

    let cut = false;
    const tryRemembered = (spell: number, move: number): boolean => {
      if (!spell || !position.canCast(spell >> 8)) return false;
      if (spell >> 8 === SPELL_JUMP && !position.board[spell & 63]) return false;
      position.cast(spell);
      const valid = this.isPseudoLegal(move, ply);
      position.uncast();
      return valid && consider(move, spell);
    };
    if (position.spellMode) {
      cut = tryRemembered(hashSpell, hashMove);
      if (!cut && (this.spellKillers[ply] !== hashSpell || this.spellKillerMoves[ply] !== hashMove)) {
        cut = tryRemembered(this.spellKillers[ply], this.spellKillerMoves[ply]);
      }
    }
    if (!cut) {
      const offset = ply * MOVES_PER_PLY;
      const count = position.generate(this.moves, offset) - offset;
      this.scoreMoves(offset, count, hashSpell ? 0 : hashMove, ply);
      for (let i = 0; i < count && !cut; i++) cut = consider(this.pick(offset, i, count), SPELL_NONE);
    }

    if (!cut && position.spellMode) {
      let turns: ISpellTurn[] | null = null;
      if (searched === 0) turns = unlockingSpellTurns(position);
      else if (danger) turns = defensiveSpellTurns(position, threats as number[], ply <= 2 ? 3 : 1);
      // The opponent's first reply gets the same breadth as our own options. A narrower reply
      // set made our spells look good simply because the refutation was never generated.
      else if (ply <= 1) turns = depth >= 2 ? rootSpellTurns(position) : tacticalSpellTurns(position, PIECE_VALUE[KNIGHT]);
      else if (depth >= 2) turns = tacticalSpellTurns(position, PIECE_VALUE[KNIGHT]);
      if (turns) {
        // Inner nodes only afford a bounded number of speculative turns.
        const limit = ply <= 1 && depth >= 2 ? turns.length : searched === 0 || danger ? 60 : 6;
        for (let i = 0; i < turns.length && i < limit && !cut; i++) cut = consider(turns[i].move, turns[i].spell);
      }
      if (!cut && searched > 0 && bestScore <= -MATE_BOUND) {
        // Selective generation must never manufacture a forced loss: before concluding one,
        // try every spell turn that could still prevent it.
        for (const turn of unlockingSpellTurns(position)) {
          cut = consider(turn.move, turn.spell);
          if (cut || bestScore > -MATE_BOUND) break;
        }
      }
    }

    if (bestScore === -INFINITE) {
      if (searched === 0) {
        // No turn at all: checkmate, or stalemate when check does not bind.
        return inCheck && position.enforceCheck ? -MATE + ply : this.drawScore(ply);
      }
      return alpha;
    }

    let stored = bestScore;
    if (stored > MATE_BOUND) stored += ply; else if (stored < -MATE_BOUND) stored -= ply;
    this.ttCheck[slot] = position.keyHi;
    this.ttMove[slot] = bestMove;
    this.ttSpell[slot] = bestSpell;
    this.ttScore[slot] = stored;
    this.ttDepth[slot] = Math.min(127, depth);
    this.ttFlag[slot] = bestScore <= originalAlpha ? UPPER : bestScore >= beta ? LOWER : EXACT;
    return bestScore;
  }

  private isPseudoLegal(move: number, ply: number): boolean {
    const offset = ply * MOVES_PER_PLY;
    const end = this.position.generate(this.moves, offset);
    for (let i = offset; i < end; i++) if (this.moves[i] === move) return true;
    return false;
  }

  private quiescence(alpha: number, beta: number, ply: number, quietPly: number): number {
    const position = this.position;
    this.pv[ply].length = 0;
    this.tick();
    if (ply > this.selectiveDepth) this.selectiveDepth = ply;

    if (position.spellMode) {
      if (position.king[position.side] < 0) return -MATE + ply;
      const win = position.findKingCapture();
      if (win) {
        this.pv[ply].push(win);
        return MATE - ply - 1;
      }
    }
    if (ply >= MAX_PLY - 4) return evaluate(position);

    const inCheck = quietPly < 6 && position.inCheck();
    const threats = position.spellMode && quietPly < 2 ? position.royalThreats(position.side) : null;
    const mustAnswer = inCheck || (threats !== null && threats.length > 0);

    let stand = -INFINITE;
    let best = -MATE + ply;
    if (!mustAnswer) {
      stand = evaluate(position);
      if (stand >= beta) return stand;
      alpha = Math.max(alpha, stand);
      best = stand;
    }

    let legal = 0;
    const consider = (move: number, spell: number): boolean => {
      if (spell) position.cast(spell);
      if (!position.make(move)) {
        if (spell) position.uncast();
        return false;
      }
      this.line.push(spell ? 2 : 1);
      legal++;
      const score = -this.quiescence(-beta, -alpha, ply + 1, quietPly + 1);
      this.line.pop();
      position.unmake();
      if (spell) position.uncast();
      if (score > best) best = score;
      if (score > alpha) {
        alpha = score;
        const line = this.pv[ply];
        line.length = 0;
        line.push({ spell, move });
        for (const step of this.pv[ply + 1]) line.push(step);
      }
      return alpha >= beta;
    };

    const offset = ply * MOVES_PER_PLY;
    const count = position.generate(this.moves, offset, !mustAnswer) - offset;
    this.scoreMoves(offset, count, 0, ply);
    for (let i = 0; i < count; i++) {
      const move = this.pick(offset, i, count);
      if (!mustAnswer) {
        const promo = movePromo(move);
        if (promo && promo !== QUEEN) continue;
        const victim = move & FLAG_EP ? PAWN : position.board[moveTo(move)] & 7;
        if (!promo && stand + PIECE_VALUE[victim] + 220 < alpha) continue;
        if (!position.effects && !promo && this.staticExchange(move) < 0) continue;
      }
      if (consider(move, SPELL_NONE)) return best;
    }

    if (position.spellMode && quietPly < 2) {
      let turns: ISpellTurn[] | null = null;
      if (mustAnswer) turns = defensiveSpellTurns(position, threats ?? [], 2);
      else if (quietPly === 0) turns = tacticalSpellTurns(position, PIECE_VALUE[KNIGHT]);
      if (turns) {
        const limit = mustAnswer && !legal ? 40 : mustAnswer ? 12 : 4;
        for (let i = 0; i < turns.length && i < limit; i++) {
          if (consider(turns[i].move, turns[i].spell)) return best;
        }
      }
    }

    if (mustAnswer && position.spellMode && best <= -MATE_BOUND) {
      // Same guarantee as in the main search: no forced loss while a spell remains untried.
      for (const turn of unlockingSpellTurns(position)) {
        if (consider(turn.move, turn.spell) || best > -MATE_BOUND) break;
      }
      if (legal) return best;
    }
    if (inCheck && !legal && position.enforceCheck) return -MATE + ply;
    if (mustAnswer && !legal) return evaluate(position);
    return best;
  }

  // -------------------------------------------------------------------------
  // Move ordering and static exchange evaluation
  // -------------------------------------------------------------------------
  private scoreMoves(offset: number, count: number, hashMove: number, ply: number): void {
    const board = this.position.board;
    const side = this.position.side;
    for (let i = offset; i < offset + count; i++) {
      const move = this.moves[i];
      let score: number;
      if (move === hashMove) score = 10_000_000;
      else if (move & FLAG_CAPTURE) {
        const victim = move & FLAG_EP ? PAWN : board[moveTo(move)] & 7;
        const attacker = board[moveFrom(move)] & 7;
        score = PIECE_VALUE[victim] * 16 - PIECE_VALUE[attacker] / 16;
        score += PIECE_VALUE[victim] >= PIECE_VALUE[attacker] || this.position.effects || this.staticExchange(move) >= 0
          ? 5_000_000 : -1_000_000;
      } else if (movePromo(move)) score = movePromo(move) === QUEEN ? 4_500_000 : -2_000_000;
      else if (move === this.killers[ply * 2]) score = 4_000_000;
      else if (move === this.killers[ply * 2 + 1]) score = 3_900_000;
      else score = this.history[side * 4096 + (move & 4095)];
      this.order[i] = score;
    }
  }

  private pick(offset: number, index: number, count: number): number {
    const start = offset + index;
    let best = start;
    for (let i = start + 1; i < offset + count; i++) if (this.order[i] > this.order[best]) best = i;
    const move = this.moves[best];
    if (best !== start) {
      this.moves[best] = this.moves[start];
      this.moves[start] = move;
      const score = this.order[best];
      this.order[best] = this.order[start];
      this.order[start] = score;
    }
    return move;
  }

  /** Cheapest piece of `color` attacking `sq` on the current (partially exchanged) board. */
  private leastAttacker(sq: number, color: number): number {
    const board = this.position.board, frozen = this.position.frozen, bits = color << 3;
    for (const s of PAWN_CAPTURES[color ^ 1][sq]) if (board[s] === (PAWN | bits) && !frozen[s]) return s;
    for (const s of KNIGHT_TARGETS[sq]) if (board[s] === (KNIGHT | bits) && !frozen[s]) return s;
    let found = -1, foundType = 99;
    for (let d = 0; d < 8; d++) {
      const ray = RAYS[sq][d];
      for (let i = 0; i < ray.length; i++) {
        const s = ray[i];
        const p = board[s];
        if (!p) continue;
        if (p >> 3 === color && !frozen[s]) {
          const t = p & 7;
          if ((t === QUEEN || t === (d < 4 ? ROOK : BISHOP)) && t < foundType) { found = s; foundType = t; }
        }
        break;
      }
    }
    if (found >= 0) return found;
    for (const s of KING_TARGETS[sq]) if (board[s] === (KING | bits) && !frozen[s]) return s;
    return -1;
  }

  /** Material outcome of the capture sequence started by `move`, with best stopping choices. */
  private staticExchange(move: number): number {
    const board = this.position.board;
    const from = moveFrom(move), to = moveTo(move);
    const gain: number[] = [PIECE_VALUE[move & FLAG_EP ? PAWN : board[to] & 7]];
    const removed: number[] = [from, board[from]];
    let occupant = board[from] & 7;
    let color = (board[from] >> 3) ^ 1;
    board[from] = 0;
    for (let depth = 1; depth < 32; depth++) {
      const attacker = this.leastAttacker(to, color);
      if (attacker < 0) break;
      gain[depth] = PIECE_VALUE[occupant] - gain[depth - 1];
      occupant = board[attacker] & 7;
      removed.push(attacker, board[attacker]);
      board[attacker] = 0;
      color ^= 1;
    }
    for (let i = removed.length - 2; i >= 0; i -= 2) board[removed[i]] = removed[i + 1];
    for (let i = gain.length - 1; i > 0; i--) gain[i - 1] = -Math.max(-gain[i - 1], gain[i]);
    return gain[0];
  }
}
