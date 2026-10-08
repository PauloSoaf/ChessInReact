import { describe, expect, it } from 'vitest';
import { bootstrapGame, createStandardChessPieces } from '../GameInitializer';

describe('Bootstrap Subsystem (Pipeline & Initialization Bounds)', () => {
  it('creates full set of 32 standard chess pieces with valid coordinates', () => {
    const pieces = createStandardChessPieces();
    expect(pieces).toHaveLength(32);

    const whitePieces = pieces.filter((p) => p.ownerId === 'P1');
    const blackPieces = pieces.filter((p) => p.ownerId === 'P2');
    expect(whitePieces).toHaveLength(16);
    expect(blackPieces).toHaveLength(16);

    const kings = pieces.filter((p) => p.variantId === 'KING');
    expect(kings).toHaveLength(2);
  });

  it('initializes game within 50ms limit (RNF-15)', () => {
    const context = bootstrapGame({ matchId: 'perf-boot-test' });

    // RNF-15: Initial boot duration under 50ms
    expect(context.bootstrapDurationMs).toBeLessThan(50);

    const state = context.store.getState();
    expect(state.domain.matchId).toBe('perf-boot-test');
    expect(state.domain.turnNumber).toBe(1);
    expect(state.domain.activePlayer).toBe('P1');
    expect(Object.keys(state.domain.boardEntities)).toHaveLength(32);
    expect(Object.keys(state.domain.occupancy)).toHaveLength(32);
  });
});
