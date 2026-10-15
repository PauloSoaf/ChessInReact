import { describe, expect, it } from 'vitest';
import { EngineBridge } from '../EngineBridge';
import { MockWorkerPort } from '../dummyWorker';
import { asCoordinateKey, CoordinateKey } from '../../coordinates';

describe('Procedural & Topology Worker Integration (Spec 02 Verification)', () => {
  it('generates procedural chunks asynchronously through the Worker protocol', async () => {
    const bridge = new EngineBridge({
      workerPort: new MockWorkerPort(5), // 5ms simulated async delay
    });

    const chunks = await bridge.generateChunks({
      topologyType: 'HEXAGONAL',
      seed: 'worker-chunk-seed',
      chunkCoords: [
        { chunkX: 0, chunkY: 0 },
        { chunkX: 1, chunkY: 0 },
      ],
      chunkSize: 16,
    });

    expect(chunks.length).toBe(2);
    expect(chunks[0].chunkId).toBe('chunk_0_0');
    expect(chunks[1].chunkId).toBe('chunk_1_0');
    expect(Object.keys(chunks[0].cells).length).toBe(256);

    bridge.dispose();
  });

  it('computes A* pathfinding asynchronously through the Worker protocol', async () => {
    const bridge = new EngineBridge({
      workerPort: new MockWorkerPort(5),
    });

    const pathResult = await bridge.computePath({
      topologyType: 'HEXAGONAL',
      start: '0,0,0' as CoordinateKey,
      goal: '2,0,-2' as CoordinateKey,
      obstacleCoords: ['1,0,-1' as CoordinateKey], // Block direct path
    });

    expect(pathResult.found).toBe(true);
    expect(pathResult.path[0]).toBe('0,0,0');
    expect(pathResult.path[pathResult.path.length - 1]).toBe('2,0,-2');
    expect(pathResult.path).not.toContain('1,0,-1'); // Obstacle avoided

    bridge.dispose();
  });

  it('handles multiple concurrent worker requests without race conditions', async () => {
    const bridge = new EngineBridge({
      workerPort: new MockWorkerPort(10),
    });

    const [pingRes, chunksRes, pathRes] = await Promise.all([
      bridge.ping(),
      bridge.generateChunks({
        topologyType: 'SQUARE',
        seed: 'multi-seed',
        chunkCoords: [{ chunkX: 0, chunkY: 0 }],
      }),
      bridge.computePath({
        topologyType: 'SQUARE',
        start: '0,0' as CoordinateKey,
        goal: '3,3' as CoordinateKey,
      }),
    ]);

    expect(pingRes).toBe('PONG');
    expect(chunksRes.length).toBe(1);
    expect(pathRes.found).toBe(true);
    expect(bridge.getPendingCount()).toBe(0);

    bridge.dispose();
  });

  it('generates 256 cells for square chunks outside 8x8 (PATCH-04: chunk_1_1, negative, and large offsets)', async () => {
    const bridge = new EngineBridge({
      workerPort: new MockWorkerPort(5),
    });

    const chunks = await bridge.generateChunks({
      topologyType: 'SQUARE',
      seed: 'infinite-square-test',
      chunkCoords: [
        { chunkX: 0, chunkY: 0 },
        { chunkX: 1, chunkY: 1 },
        { chunkX: -2, chunkY: -3 },
        { chunkX: 1000, chunkY: -1000 },
      ],
      chunkSize: 16,
    });

    expect(chunks.length).toBe(4);
    // Every 16x16 chunk in infinite mode must have exactly 256 valid cells
    for (const chunk of chunks) {
      expect(Object.keys(chunk.cells).length).toBe(256);
    }

    // Verify chunk_1000_-1000 contains correct coordinate ranges (16000..16015, -16000..-15985)
    const farChunk = chunks[3];
    expect(farChunk.chunkId).toBe('chunk_1000_-1000');
    expect(farChunk.cells[asCoordinateKey('16000,-16000')]).toBeDefined();

    bridge.dispose();
  });

  it('respects bounded 8x8 borders when explicit bounded options are passed', async () => {
    const bridge = new EngineBridge({
      workerPort: new MockWorkerPort(5),
    });

    const chunks = await bridge.generateChunks({
      topologyType: 'SQUARE',
      seed: 'bounded-square-test',
      chunkCoords: [
        { chunkX: 0, chunkY: 0 },
        { chunkX: 1, chunkY: 1 },
      ],
      chunkSize: 16,
      topologyOptions: { width: 8, height: 8 },
    });

    // Chunk (0,0) only has 64 cells (8x8) within bounds:
    expect(Object.keys(chunks[0].cells).length).toBe(64);
    // Chunk (1,1) has 0 cells within bounds 8x8:
    expect(Object.keys(chunks[1].cells).length).toBe(0);

    bridge.dispose();
  });
});
