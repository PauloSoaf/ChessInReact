import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asCoordinateKey, asEntityId } from '../../coordinates';
import { IPieceEntity } from '../../entities/types';
import { createDefaultDomainState } from '../../state/initialState';
import { EngineBridge } from '../EngineBridge';
import { MockWorkerPort } from '../dummyWorker';

describe('Worker Protocol & EngineBridge (Zero-Copy & Leak Prevention)', () => {
  let bridge: EngineBridge;
  let mockPort: MockWorkerPort;

  beforeEach(() => {
    mockPort = new MockWorkerPort(5); // 5ms response delay
    bridge = new EngineBridge({
      timeoutMs: 100,
      workerPort: mockPort,
    });
  });

  afterEach(() => {
    bridge.dispose();
  });

  it('performs PING / PONG protocol handshake', async () => {
    const result = await bridge.ping();
    expect(result).toBe('PONG');
    expect(bridge.getPendingCount()).toBe(0);
  });

  it('transfers serialized domain state and echoes correct metadata', async () => {
    const domain = createDefaultDomainState('bridge-test-1');
    const piece: IPieceEntity = {
      id: asEntityId('test-bishop'),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'BISHOP',
      position: asCoordinateKey('2,0'),
      hasMoved: false,
      isCaptured: false,
    };
    domain.boardEntities[piece.id] = piece;

    const metadata = await bridge.echoStateMetadata(domain);

    expect(metadata.entityCount).toBe(1);
    expect(metadata.activePlayer).toBe('P1');
    expect(metadata.schemaVersion).toBe(1);
    expect(bridge.getPendingCount()).toBe(0);
  });

  it('validates binary serialization on worker end', async () => {
    const domain = createDefaultDomainState();
    const result = await bridge.validateSerialization(domain);

    expect(result.valid).toBe(true);
    expect(bridge.getPendingCount()).toBe(0);
  });

  it('handles request timeout gracefully and purges pending promises (Section R)', async () => {
    // Port with 200ms delay while timeout is set to 50ms
    const slowPort = new MockWorkerPort(200);
    const slowBridge = new EngineBridge({
      timeoutMs: 50,
      workerPort: slowPort,
    });

    await expect(slowBridge.ping()).rejects.toThrow(/timed out/);
    expect(slowBridge.getPendingCount()).toBe(0); // Cleaned up!
    slowBridge.dispose();
  });

  it('handles worker errors without crashing main thread', async () => {
    mockPort.postMessage = (req) => {
      setTimeout(() => {
        if (mockPort.onmessage) {
          mockPort.onmessage({
            data: {
              id: req.id,
              type: 'ERROR',
              error: 'Simulated Engine Crash',
            },
          });
        }
      }, 5);
    };

    await expect(bridge.ping()).rejects.toThrow('Simulated Engine Crash');
    expect(bridge.getPendingCount()).toBe(0);
  });

  it('disposes bridge, terminates worker, and rejects all remaining pending promises', async () => {
    const hungPort = new MockWorkerPort(10000); // Does not reply quickly
    const hungBridge = new EngineBridge({
      timeoutMs: 5000,
      workerPort: hungPort,
    });

    const promise = hungBridge.ping();
    expect(hungBridge.getPendingCount()).toBe(1);

    hungBridge.dispose();

    await expect(promise).rejects.toThrow(/disposed/);
    expect(hungBridge.getPendingCount()).toBe(0);
  });

  it('throws in headless environment when no worker port is provided', () => {
    expect(() => new EngineBridge()).toThrow(/Worker is not available/);
  });

  it('is idempotent on multiple dispose calls and rejects new requests', async () => {
    bridge.dispose();
    bridge.dispose(); // No-op
    await expect(bridge.ping()).rejects.toThrow(/disposed/);
  });
});
