/** Level 5 standard chess: the compact search behind the existing engine contract. */
import { IDomainState } from '../../../core/state/gameState';
import { ITopology } from '../../../core/topology/types';
import { asCoordinateKey, asEntityId } from '../../../core/coordinates';
import { IBestMoveResult } from '../interfaces/IAIEngineContracts';
import { FastSearch } from './FastSearch';
import { coordOf, fromDomain, toDomainMove } from './domainBridge';
import { moveFrom, moveTo } from './FastPosition';

let search: FastSearch | null = null;

export function searchStandardChess(
  state: IDomainState, topology: ITopology, timeBudgetMs: number, maxDepth?: number,
): IBestMoveResult {
  void topology; // support is checked by the caller with supportsStandardEngine()
  const { position, idAt } = fromDomain(state, { spellMode: false, enforceCheck: true });
  if (!position.legalMoves().length) {
    return { bestMove: null, evaluationScore: 0, depthReached: 0, nodesCalculated: 0, calculationTimeMs: 0, pvLine: [], hitRate: 0 };
  }
  search ??= new FastSearch();
  const outcome = search.search(position, { timeMs: timeBudgetMs, maxDepth, minDepth: 2 });
  const move = toDomainMove(outcome.best.move, idAt[moveFrom(outcome.best.move)] as string);
  return {
    bestMove: {
      fromCoord: asCoordinateKey(move.from),
      toCoord: asCoordinateKey(move.to),
      pieceId: asEntityId(move.pieceId),
      promotionVariant: move.promotion,
    },
    evaluationScore: outcome.best.score,
    depthReached: outcome.depth,
    nodesCalculated: outcome.nodes,
    calculationTimeMs: Math.round(outcome.elapsedMs),
    pvLine: outcome.best.pv.map((turn) => `${coordOf(moveFrom(turn.move))}->${coordOf(moveTo(turn.move))}`),
    hitRate: 0,
  };
}
