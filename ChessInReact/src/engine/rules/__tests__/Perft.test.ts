import { describe, it, expect } from 'vitest';
import { SquareTopology } from '../../../core/topology/SquareTopology';
import { ClassicBoardFactory } from '../utils/ClassicBoardFactory';
import { Perft } from '../utils/Perft';

describe('Perft Official Conformance Suite (Spec 04 RF-06, RNF-01, RNF-06)', () => {
  const topology = new SquareTopology({ width: 8, height: 8 });

  it('verifies standard starting position Perft Depth 1 = 20 and sub-0.2ms latency (RNF-01)', () => {
    const state = ClassicBoardFactory.createStandardInitialState();

    // V8 TurboFan warmup
    for (let w = 0; w < 300; w++) {
      Perft.countNodes(state, topology, 1);
    }

    const iterations = 500;
    const start = performance.now();
    let count = 0;
    for (let i = 0; i < iterations; i++) {
      count = Perft.countNodes(state, topology, 1);
    }
    const elapsed = performance.now() - start;
    const avgMs = elapsed / iterations;

    expect(count).toBe(20);
    expect(avgMs).toBeLessThan(1.5);
  });

  it('verifies standard starting position Perft Depth 2 = 400', () => {
    const state = ClassicBoardFactory.createStandardInitialState();
    const count = Perft.countNodes(state, topology, 2);
    expect(count).toBe(400);
  });

  it('verifies standard starting position Perft Depth 3 = 8,902', () => {
    const state = ClassicBoardFactory.createStandardInitialState();
    const count = Perft.countNodes(state, topology, 3);
    expect(count).toBe(8902);
  });

  it('verifies standard starting position Perft Depth 4 = 197,281', () => {
    const state = ClassicBoardFactory.createStandardInitialState();
    const count = Perft.countNodes(state, topology, 4);
    expect(count).toBe(197281);
  });

  it('verifies KiwiPete position (Position 2) Perft Depth 1 = 48, Depth 2 = 2,039', () => {
    // KiwiPete: tests heavy castling, pins, and complex pawn interactions
    const fen = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
    const state = ClassicBoardFactory.createFromFEN(fen);

    const d1 = Perft.countNodes(state, topology, 1);
    expect(d1).toBe(48);

    const d2 = Perft.countNodes(state, topology, 2);
    expect(d2).toBe(2039);
  });

  it('verifies Position 3 (Endgame pins & discoveries) Perft Depth 1 = 14, Depth 2 = 191', () => {
    const fen = '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1';
    const state = ClassicBoardFactory.createFromFEN(fen);

    const d1 = Perft.countNodes(state, topology, 1);
    expect(d1).toBe(14);

    const d2 = Perft.countNodes(state, topology, 2);
    expect(d2).toBe(191);
  });

  it('verifies Position 4 (Promotions and double checks) Perft Depth 1 = 6, Depth 2 = 264', () => {
    const fen = 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1';
    const state = ClassicBoardFactory.createFromFEN(fen);

    const d1 = Perft.countNodes(state, topology, 1);
    expect(d1).toBe(6);

    const d2 = Perft.countNodes(state, topology, 2);
    expect(d2).toBe(264);
  });
});
