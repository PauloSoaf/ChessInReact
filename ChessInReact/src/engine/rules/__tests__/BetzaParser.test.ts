import { describe, it, expect, beforeEach } from 'vitest';
import { BetzaParser } from '../behaviors/BetzaParser';
import { LeaperBehavior } from '../behaviors/LeaperBehavior';
import { SliderBehavior } from '../behaviors/SliderBehavior';
import { HopperBehavior } from '../behaviors/HopperBehavior';
import { SquareTopology } from '../../../core/topology/SquareTopology';
import { asCoordinateKey, asEntityId, PlayerId } from '../../../core/coordinates';
import { IDomainState } from '../../../core/state/gameState';
import { IPieceEntity } from '../../../core/entities/types';

describe('BetzaParser & Primitive Behaviors (Spec 04 RF-03, RF-06, RF-07, RNF-10)', () => {
  beforeEach(() => {
    BetzaParser.clearCache();
  });

  const topology = new SquareTopology({ width: 8, height: 8 });

  function createMinimalState(): IDomainState {
    const emptyInventory: Record<PlayerId, string[]> = {
      P1: [],
      P2: [],
      P3: [],
      P4: [],
      P5: [],
      P6: [],
      P7: [],
      P8: [],
      NONE: [],
    };
    return {
      matchId: 'test-match',
      variantId: 'CHESS_STANDARD',
      isGameOver: false,
      winnerId: null,
      activePlayer: 'P1',
      turnNumber: 1,
      revision: 1,
      boardEntities: {},
      occupancy: {},
      capturedInventory: emptyInventory,
      turnState: {
        phase: 'COMMIT',
        lastActionTimestamp: Date.now(),
        enPassantTarget: null,
        fiftyMoveCounter: 0,
      },
    };
  }

  it('correctly compiles classic piece shortcuts', () => {
    const knightBehaviors = BetzaParser.parse('KNIGHT');
    expect(knightBehaviors).toHaveLength(1);
    expect(knightBehaviors[0]).toBeInstanceOf(LeaperBehavior);

    const rookBehaviors = BetzaParser.parse('R');
    expect(rookBehaviors).toHaveLength(1);
    expect(rookBehaviors[0]).toBeInstanceOf(SliderBehavior);

    const bishopBehaviors = BetzaParser.parse('B');
    expect(bishopBehaviors).toHaveLength(1);
    expect(bishopBehaviors[0]).toBeInstanceOf(SliderBehavior);

    const queenBehaviors = BetzaParser.parse('Q');
    expect(queenBehaviors).toHaveLength(1);
    expect(queenBehaviors[0]).toBeInstanceOf(SliderBehavior);

    const kingBehaviors = BetzaParser.parse('KING');
    expect(kingBehaviors).toHaveLength(2); // W + F
  });

  it('correctly compiles compound fairy pieces (Amazon, Chancellor, Archbishop)', () => {
    const amazon = BetzaParser.parse('AMAZON');
    expect(amazon).toHaveLength(2); // Queen slider + Knight leaper

    const chancellor = BetzaParser.parse('CHANCELLOR');
    expect(chancellor).toHaveLength(2); // Rook slider + Knight leaper

    const archbishop = BetzaParser.parse('ARCHBISHOP');
    expect(archbishop).toHaveLength(2); // Bishop slider + Knight leaper
  });

  it('correctly compiles elemental leapers (Wazir, Ferz, Camel, Zebra)', () => {
    const wazir = BetzaParser.parse('W');
    expect(wazir[0].name).toBe('Leaper(1,0)');

    const ferz = BetzaParser.parse('F');
    expect(ferz[0].name).toBe('Leaper(1,1)');

    const camel = BetzaParser.parse('C');
    expect(camel[0].name).toBe('Leaper(1,3)');

    const zebra = BetzaParser.parse('Z');
    expect(zebra[0].name).toBe('Leaper(2,3)');
  });

  it('correctly compiles hopper pieces (Grasshopper)', () => {
    const grasshopper = BetzaParser.parse('GRASSHOPPER');
    expect(grasshopper).toHaveLength(1);
    expect(grasshopper[0]).toBeInstanceOf(HopperBehavior);

    const pR = BetzaParser.parse('pR');
    expect(pR).toHaveLength(1);
    expect(pR[0]).toBeInstanceOf(HopperBehavior);
  });

  it('correctly parses directional and conditional prefixes (fmW, fcF)', () => {
    const pawnMove = BetzaParser.parse('fmW');
    expect(pawnMove).toHaveLength(1);

    const pawnCapture = BetzaParser.parse('fcF');
    expect(pawnCapture).toHaveLength(1);

    const state = createMinimalState();
    const pId = asEntityId('pawn-1');
    const piece: IPieceEntity = {
      id: pId,
      type: 'PIECE',
      position: asCoordinateKey('4,1'),
      ownerId: 'P1',
      variantId: 'PAWN',
      hasMoved: false,
      isCaptured: false,
    };
    state.boardEntities[pId] = piece;
    state.occupancy[asCoordinateKey('4,1')] = pId;

    // Move forward 1 step into empty square
    const moves = pawnMove[0].generatePseudoLegalMoves(asCoordinateKey('4,1'), topology, state, piece, true);
    expect(moves).toContain(asCoordinateKey('4,2'));

    // Move forward into friendly piece should be blocked
    const fId = asEntityId('friendly');
    state.occupancy[asCoordinateKey('4,2')] = fId;
    state.boardEntities[fId] = {
      id: fId,
      type: 'PIECE',
      position: asCoordinateKey('4,2'),
      ownerId: 'P1',
      variantId: 'PAWN',
      hasMoved: false,
      isCaptured: false,
    };
    const blockedMoves = pawnMove[0].generatePseudoLegalMoves(asCoordinateKey('4,1'), topology, state, piece, true);
    expect(blockedMoves).not.toContain(asCoordinateKey('4,2'));
  });

  it('correctly parses explicit tuples like (1,2) and (2,4)', () => {
    const behaviors = BetzaParser.parse('(1,2)');
    expect(behaviors).toHaveLength(1);
    expect(behaviors[0].name).toBe('Leaper(1,2)');

    const custom = BetzaParser.parse('(2,4)');
    expect(custom).toHaveLength(1);
    expect(custom[0].name).toBe('Leaper(2,4)');
  });

  it('safely handles empty strings, malformed input, and DOS attempts', () => {
    expect(BetzaParser.parse('')).toEqual([]);
    expect(BetzaParser.parse('   ')).toEqual([]);
    expect(BetzaParser.parse('!@#$%^&*')).toEqual([]);
    expect(BetzaParser.parse('A'.repeat(150))).toEqual([]); // Guard against huge strings
  });

  it('achieves sub-0.1ms parsing latency (RNF-10)', () => {
    const iterations = 1000;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      BetzaParser.parse('QN');
      BetzaParser.parse('fmWfcF');
      BetzaParser.parse('RN');
    }
    const elapsed = performance.now() - start;
    const avgMs = elapsed / (iterations * 3);
    expect(avgMs).toBeLessThan(0.1);
  });
});
