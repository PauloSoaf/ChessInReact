import { describe, expect, it } from 'vitest';
import { runAllBenchmarks, runScaleBenchmark } from '../coreBenchmarks';

describe('Quantitative Architecture Benchmarks (Spec 01 Verification)', () => {
  it('executes 64 entities benchmark and verifies dispatchMove < 1ms (Critério de Aceite 1)', () => {
    const result = runScaleBenchmark(64);
    console.log('[BENCHMARK 64 ENTITIES]', JSON.stringify(result, null, 2));

    expect(result.entityCount).toBe(64);
    // Critério 1: Despachar dispatchMove() não deve bloquear por mais de 1ms
    expect(result.dispatchMoveWithHistoryMs).toBeLessThan(1.0);
    // Lookup expected O(1) in microseconds (< 50µs)
    expect(result.lookupByIdTimeUs).toBeLessThan(50);
  });

  it('runs complete benchmark matrix across 64, 1000, 4000, and 10000 entities', () => {
    const allResults = runAllBenchmarks();
    console.log('[FULL BENCHMARK MATRIX]');
    console.table(allResults);

    expect(allResults['64_entities']).toBeDefined();
    expect(allResults['1000_entities']).toBeDefined();
    expect(allResults['4000_entities']).toBeDefined();
    expect(allResults['10000_entities']).toBeDefined();

    // Verify 10,000 entities can initialize and run without crashing
    expect(allResults['10000_entities'].entityCount).toBe(10000);
    expect(allResults['10000_entities'].initTimeMs).toBeGreaterThan(0);
  });
});
