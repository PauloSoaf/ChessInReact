import { describe, expect, it } from 'vitest';
import { asCoordinateKey } from '../../coordinates';
import { ChunkManager } from '../../procedural/ChunkManager';
import type { TopologyType } from '../../topology/types';
import { VoronoiTopology } from '../../topology/VoronoiTopology';
import { MockWorkerPort, processWorkerRequest } from '../dummyWorker';
import { EngineBridge } from '../EngineBridge';

describe('PATCH-13: Voronoi Topology Integration in Worker Protocol', () => {
  const seed = 'voronoi-worker-spec02-test';

  it('T13-01: GENERATE_CHUNKS with VORONOI_IRREGULAR produces Voronoi cells instead of square cells', () => {
    const response = processWorkerRequest({
      id: 1,
      type: 'GENERATE_CHUNKS',
      payload: {
        topologyType: 'VORONOI_IRREGULAR',
        seed,
        chunkCoords: [{ chunkX: 0, chunkY: 0 }],
        chunkSize: 16,
        topologyOptions: { boundingRadius: 32 },
      },
    });

    expect(response.type).toBe('GENERATE_CHUNKS_RESULT');
    const chunks = response.result as Array<{ cells: Record<string, { topology: string }> }>;
    expect(chunks.length).toBe(1);

    const cell00 = chunks[0].cells['0,0'];
    expect(cell00).toBeDefined();
    expect(cell00.topology).toBe('VORONOI_IRREGULAR');
  });

  it('T13-02: COMPUTE_PATHFINDING in Voronoi topology produces valid paths with adjacent neighbors', () => {
    const start = asCoordinateKey('0,0');
    const goal = asCoordinateKey('2,2');

    const response = processWorkerRequest({
      id: 2,
      type: 'COMPUTE_PATHFINDING',
      payload: {
        topologyType: 'VORONOI_IRREGULAR',
        start,
        goal,
        topologyOptions: { seed, boundingRadius: 32 },
      },
    });

    expect(response.type).toBe('PATHFINDING_RESULT');
    const result = response.result as { found: boolean; path: string[] };
    expect(result.found).toBe(true);
    expect(result.path[0]).toBe(start);
    expect(result.path[result.path.length - 1]).toBe(goal);

    // Validate that every step is a valid Voronoi neighbor
    const topology = new VoronoiTopology({ seed, boundingRadius: 32 });
    for (let i = 0; i < result.path.length - 1; i++) {
      const current = asCoordinateKey(result.path[i]);
      const next = asCoordinateKey(result.path[i + 1]);
      const neighbors = topology.getAllNeighbors(current);
      expect(neighbors).toContain(next);
    }
  });

  it('T13-03: worker generation yields identical chunks to main thread Voronoi generator', () => {
    // 1. Main thread reference
    const topology = new VoronoiTopology({ seed, boundingRadius: 32 });
    const manager = new ChunkManager(topology, { seed }, { chunkSize: 16 });
    const localChunk = manager.getOrGenerateChunk({ chunkX: 0, chunkY: 0 });

    // 2. Worker generation
    const response = processWorkerRequest({
      id: 3,
      type: 'GENERATE_CHUNKS',
      payload: {
        topologyType: 'VORONOI_IRREGULAR',
        seed,
        chunkCoords: [{ chunkX: 0, chunkY: 0 }],
        chunkSize: 16,
        topologyOptions: { seed, boundingRadius: 32 },
      },
    });

    expect(response.type).toBe('GENERATE_CHUNKS_RESULT');
    const workerChunks = response.result as Array<typeof localChunk>;
    const workerChunk = workerChunks[0];

    const localKeys = Object.keys(localChunk.cells).sort();
    const workerKeys = Object.keys(workerChunk.cells).sort();
    expect(workerKeys).toEqual(localKeys);

    for (const key of localKeys) {
      expect(workerChunk.cells[asCoordinateKey(key)].biome).toBe(
        localChunk.cells[asCoordinateKey(key)].biome
      );
      expect(workerChunk.cells[asCoordinateKey(key)].elevation).toBeCloseTo(
        localChunk.cells[asCoordinateKey(key)].elevation
      );
    }
  });

  it('T13-05: rejects unknown topology types with explicit error and no silent square fallback', async () => {
    const mockPort = new MockWorkerPort(5);
    const bridge = new EngineBridge({ workerPort: mockPort });

    await expect(
      bridge.generateChunks({
        topologyType: 'UNKNOWN_OCTAGONAL' as unknown as TopologyType,
        seed: 'test',
        chunkCoords: [{ chunkX: 0, chunkY: 0 }],
      })
    ).rejects.toThrow(/unsupported or unknown topology type/i);

    await expect(
      bridge.computePath({
        topologyType: 'NON_EXISTENT_LATTICE' as unknown as TopologyType,
        start: asCoordinateKey('0,0'),
        goal: asCoordinateKey('1,1'),
      })
    ).rejects.toThrow(/unsupported or unknown topology type/i);
  });
});
