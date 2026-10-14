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

  it('transfers binary buffer end-to-end to worker, deserializes and preserves exact entity IDs and coordinates (FASE 8 - FIX-08)', async () => {
    const domain = createDefaultDomainState('bridge-e2e-game');
    const piece1: IPieceEntity = {
      id: asEntityId('white-rook-1'),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'ROOK',
      position: asCoordinateKey('0,0'),
      hasMoved: false,
      isCaptured: false,
    };
    const piece2: IPieceEntity = {
      id: asEntityId('black-king-0'),
      type: 'PIECE',
      ownerId: 'P2',
      variantId: 'KING',
      position: asCoordinateKey('4,7'),
      hasMoved: true,
      isCaptured: false,
    };
    domain.boardEntities[piece1.id] = piece1;
    domain.boardEntities[piece2.id] = piece2;

    const response = await bridge.echoDeserializedEntities(domain);

    expect(response.entityCount).toBe(2);
    expect(response.activePlayer).toBe('P1');
    expect(response.schemaVersion).toBe(1);

    const rook = response.entities.find((e) => e.id === 'white-rook-1');
    const king = response.entities.find((e) => e.id === 'black-king-0');

    expect(rook).toBeDefined();
    expect(rook?.position).toBe('0,0');
    expect(rook?.ownerId).toBe('P1');
    expect(rook?.variantId).toBe('ROOK');
    expect(rook?.isCaptured).toBe(false);

    expect(king).toBeDefined();
    expect(king?.position).toBe('4,7');
    expect(king?.ownerId).toBe('P2');
    expect(king?.variantId).toBe('KING');
    expect(king?.isCaptured).toBe(false);

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

describe('Real Multi-threaded Worker Integration (PATCH-08)', () => {
  let realPort: import('../NodeWorkerPort').NodeWorkerPort;
  let realBridge: EngineBridge;

  beforeEach(async () => {
    const { NodeWorkerPort } = await import('../NodeWorkerPort');
    realPort = new NodeWorkerPort();
    realBridge = new EngineBridge({
      timeoutMs: 2000,
      workerPort: realPort,
    });
  });

  afterEach(() => {
    realBridge.dispose();
  });

  it('performs true multi-threaded PING / PONG across OS worker thread boundary', async () => {
    const reply = await realBridge.ping();
    expect(reply).toBe('PONG');
    expect(realBridge.getPendingCount()).toBe(0);
  });

  it('proves native zero-copy Transferable ArrayBuffer detachment on sender thread', async () => {
    const domain = createDefaultDomainState('transfer-domain');
    const piece: IPieceEntity = {
      id: asEntityId('detachable-rook'),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'ROOK',
      position: asCoordinateKey('0,0'),
      hasMoved: false,
      isCaptured: false,
    };
    domain.boardEntities[piece.id] = piece;

    const { serializeStateForWorker } = await import('../../serialization/FlatArraySerializer');
    const snapshot = serializeStateForWorker(domain);
    const rawBuffer = snapshot.buffer.buffer;

    expect(rawBuffer.byteLength).toBeGreaterThan(0);

    // Post with transfer list
    realPort.postMessage(
      {
        id: 777,
        type: 'ECHO_DESERIALIZED_ENTITIES',
        payload: { buffer: rawBuffer, stringTable: snapshot.stringTable },
      },
      [rawBuffer]
    );

    // In native V8 / Node.js worker_threads, transferable buffer is immediately neutered/detached!
    expect(rawBuffer.byteLength).toBe(0);
  });

  it('deserializes square and cubic-hex entities accurately on real worker thread', async () => {
    const domain = createDefaultDomainState('multi-thread-domain');
    const squarePiece: IPieceEntity = {
      id: asEntityId('sq-piece'),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'PAWN',
      position: asCoordinateKey('3,4'),
      hasMoved: false,
      isCaptured: false,
    };
    const hexPiece: IPieceEntity = {
      id: asEntityId('hex-piece'),
      type: 'PIECE',
      ownerId: 'P2',
      variantId: 'KNIGHT',
      position: asCoordinateKey('1,-1,0'),
      hasMoved: true,
      isCaptured: false,
    };
    domain.boardEntities[squarePiece.id] = squarePiece;
    domain.boardEntities[hexPiece.id] = hexPiece;

    const response = await realBridge.echoDeserializedEntities(domain);

    expect(response.entityCount).toBe(2);
    expect(response.activePlayer).toBe('P1');
    expect(response.schemaVersion).toBe(1);

    const sq = response.entities.find((e) => e.id === 'sq-piece');
    const hx = response.entities.find((e) => e.id === 'hex-piece');

    expect(sq).toBeDefined();
    expect(sq?.kind).toBe('SQUARE');
    expect(sq?.position).toBe('3,4');
    expect(sq?.ownerId).toBe('P1');

    expect(hx).toBeDefined();
    expect(hx?.kind).toBe('HEX_CUBIC');
    expect(hx?.position).toBe('1,-1,0');
    expect(hx?.ownerId).toBe('P2');
  });

  it('handles worker error and supports clean resource termination', async () => {
    // Send invalid payload directly
    const invalidPromise = new Promise((resolve, reject) => {
      realPort.onmessage = (event) => {
        if (event.data.type === 'ERROR') {
          resolve(event.data.error);
        } else {
          reject(new Error('Expected ERROR response'));
        }
      };
      realPort.postMessage({
        id: 9999,
        type: 'ECHO_STATE_METADATA',
        payload: { buffer: undefined, stringTable: [] },
      });
    });

    const errorMsg = await invalidPromise;
    expect(errorMsg).toMatch(/Missing ArrayBuffer payload/);

    // Clean disposal terminates the worker thread
    realBridge.dispose();
  });
});
