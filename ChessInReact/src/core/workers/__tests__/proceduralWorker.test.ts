import { describe, expect, it } from 'vitest';
import { EngineBridge } from '../EngineBridge';
import { MockWorkerPort } from '../dummyWorker';
import { CoordinateKey } from '../../coordinates';

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
});
