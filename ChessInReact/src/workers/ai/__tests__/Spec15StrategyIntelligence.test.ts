import { describe, it, expect } from 'vitest';
import { AIWorkerPool } from '../AIWorkerPool';
import { VariantSpecializedStrategy } from '../strategies/VariantSpecializedStrategy';
import { DuckChessPlannerStrategy } from '../strategies/DuckChessPlannerStrategy';
import { SpellOptimizationStrategy } from '../strategies/SpellOptimizationStrategy';
import { SimultaneousForecaster } from '../strategies/SimultaneousForecaster';
import { IAIDecisionRequest } from '../interfaces/IUniversalAIEngine';

const base = (over: Partial<IAIDecisionRequest>): IAIDecisionRequest => ({
  matchId: 'm',
  variantId: 'CHESS_STANDARD',
  actingPlayer: 'P1',
  difficultyLevel: 3,
  timeBudgetMs: 100,
  legalMoves: [],
  ...over,
});

describe('Spec 15 - rule-aware bot strategies', () => {
  it('Atomic: detonates adjacent to enemy king and never next to own king', () => {
    const s = new VariantSpecializedStrategy();
    const win = s.decideMove(
      base({
        variantId: 'ATOMIC',
        specializedContext: { opponentKingCoord: '4,7', friendlyKingCoord: '4,0' },
        legalMoves: [
          { from: '0,0', to: '1,1', pieceId: 'a', isCapture: true },
          { from: '2,2', to: '3,6', pieceId: 'b', isCapture: true },
        ],
      })
    );
    expect(win.move.pieceId).toBe('b');

    const safe = s.decideMove(
      base({
        variantId: 'ATOMIC',
        specializedContext: { friendlyKingCoord: '4,0' },
        legalMoves: [
          { from: '0,0', to: '4,1', pieceId: 'suicide', isCapture: true },
          { from: '2,2', to: '2,3', pieceId: 'quiet' },
        ],
      })
    );
    expect(safe.move.pieceId).toBe('quiet');
  });

  it('Racing Kings: king reaching rank 8 wins immediately', () => {
    const r = new VariantSpecializedStrategy().decideMove(
      base({
        variantId: 'RACING_KINGS',
        legalMoves: [
          { from: '0,1', to: '0,2', pieceId: 'rook' },
          { from: '4,6', to: '4,7', pieceId: 'king' },
        ],
      })
    );
    expect(r.move.pieceId).toBe('king');
  });

  it('Duck: captures enemy king and places duck on a free square', () => {
    const r = new DuckChessPlannerStrategy().decideMove(
      base({
        variantId: 'DUCK_CHESS',
        specializedContext: { opponentKingCoord: '4,7', emptySquares: ['4,7', '3,3', '4,4'] },
        legalMoves: [
          { from: '0,0', to: '0,1', pieceId: 'p' },
          { from: '4,0', to: '4,7', pieceId: 'q', isCapture: true },
        ],
      })
    );
    expect(r.move.pieceId).toBe('q');
    const duck = (r.secondaryAction?.payload as { targetCoordinate: string }).targetCoordinate;
    expect(duck).not.toBe('4,7');
  });

  it('Spell: master casts a spell; novice does not', () => {
    const moves = [{ from: '0,1', to: '0,2', pieceId: 'p' }];
    const s = new SpellOptimizationStrategy();
    expect(s.decideMove(base({ variantId: 'SPELL_CHESS', legalMoves: moves })).secondaryAction).toBeDefined();
    expect(
      s.decideMove(base({ variantId: 'SPELL_CHESS', difficultyLevel: 1, legalMoves: moves })).secondaryAction
    ).toBeUndefined();
  });

  it('Diplomacy forecaster avoids contested centre squares', () => {
    const r = new SimultaneousForecaster().decideMove(
      base({
        variantId: 'DIPLOMACY_CHESS',
        legalMoves: [
          { from: 'e2', to: 'e4', pieceId: 'a' },
          { from: 'a2', to: 'a3', pieceId: 'b' },
        ],
      })
    );
    expect(r.move.pieceId).toBe('b');
  });

  it('pool routes variants to dedicated strategies', () => {
    expect(AIWorkerPool.selectStrategyForVariant('DIPLOMACY_CHESS', 6)).toBe('CONCURRENT_ACTION_FORECASTER');
    expect(AIWorkerPool.selectStrategyForVariant('RACING_KINGS')).toBe('VARIANT_SPECIALIZED');
    expect(AIWorkerPool.selectStrategyForVariant('FOUR_PLAYER_FFA', 4)).toBe('MAXN_MULTIPLAYER');
  });
});

