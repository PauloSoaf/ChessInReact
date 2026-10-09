import { describe, expect, it } from 'vitest';
import { asCoordinateKey, asEntityId } from '../coordinates';
import { EntityManager } from '../entities/EntityManager';
import { IPieceEntity } from '../entities/types';
import { MovePieceCommand } from '../commands/MovePieceCommand';
import { createDefaultDomainState } from '../state/initialState';
import { deserializeWorkerState } from '../serialization/FlatArraySerializer';
import { SnapshotSerializer } from '../serialization/SnapshotSerializer';
import { EngineBridge } from '../workers/EngineBridge';
import { MockWorkerPort } from '../workers/dummyWorker';
import { GlobalEventBus } from '../events/EventBus';
import { HistoryManager } from '../history/HistoryManager';
import { OptimisticManager } from '../optimistic/OptimisticManager';
import { MemoryStorageDriver, StorageAdapter } from '../persistence/StorageAdapter';

describe('Adversarial & Fault Injection Test Suite (Spec 01 Verification)', () => {
  const p1: IPieceEntity = {
    id: asEntityId('adv-piece-1'),
    type: 'PIECE',
    ownerId: 'P1',
    variantId: 'PAWN',
    position: asCoordinateKey('0,1'),
    hasMoved: false,
    isCaptured: false,
  };

  const p2: IPieceEntity = {
    id: asEntityId('adv-piece-2'),
    type: 'PIECE',
    ownerId: 'P1',
    variantId: 'ROOK',
    position: asCoordinateKey('0,2'),
    hasMoved: false,
    isCaptured: false,
  };

  it('rejects adding duplicate entity ID (AUDIT-01 & RF-01)', () => {
    const manager = new EntityManager([p1]);
    expect(() => manager.addEntity(p1)).toThrow(/already exists/);
  });

  it('rejects adding entity to already occupied coordinate (AUDIT-01 & RF-01)', () => {
    const manager = new EntityManager([p1]);
    const conflictingPiece: IPieceEntity = {
      ...p2,
      position: p1.position, // Same position
    };
    expect(() => manager.addEntity(conflictingPiece)).toThrow(/already occupied/);
  });

  it('rejects operations on nonexistent entities', () => {
    const manager = new EntityManager([p1]);
    expect(() => manager.moveEntity(asEntityId('nonexistent-id'), asCoordinateKey('5,5'))).toThrow(
      /non-existent entity/i
    );

    const domain = createDefaultDomainState();
    const badCmd = new MovePieceCommand(
      asEntityId('nonexistent-id'),
      asCoordinateKey('0,1'),
      asCoordinateKey('0,2'),
      'P1'
    );
    expect(() => badCmd.execute(domain)).toThrow(/does not exist/);
  });

  it('rejects stale commands where piece is no longer at origin', () => {
    const domain = createDefaultDomainState();
    domain.boardEntities[p1.id] = { ...p1, position: asCoordinateKey('3,3') };
    domain.occupancy[asCoordinateKey('3,3')] = p1.id;

    // Stale command created for position 0,1
    const staleCmd = new MovePieceCommand(
      p1.id,
      asCoordinateKey('0,1'),
      asCoordinateKey('0,2'),
      'P1'
    );
    expect(() => staleCmd.execute(domain)).toThrow(/is at "3,3", not origin "0,1"/);
  });

  it('rejects moving captured entities (AUDIT-02 invariant)', () => {
    const domain = createDefaultDomainState();
    const captured: IPieceEntity = { ...p1, isCaptured: true };
    domain.boardEntities[captured.id] = captured;
    domain.occupancy[captured.position] = captured.id;

    const cmd = new MovePieceCommand(
      captured.id,
      captured.position,
      asCoordinateKey('0,2'),
      'P1'
    );
    expect(() => cmd.execute(domain)).toThrow(/already captured/);
  });

  it('rejects deserializing corrupted or truncated binary worker buffers', () => {
    const truncatedBuffer = new Int32Array([1, 2]); // Less than header size 4
    expect(() => deserializeWorkerState(truncatedBuffer)).toThrow(/Malformed buffer/);

    const badLengthBuffer = new Int32Array([1, 5, 1, 1]); // Claims 5 entities, but buffer is only 4 ints long
    expect(() => deserializeWorkerState(badLengthBuffer)).toThrow(/Buffer corruption/);
  });

  it('rejects unsupported schemaVersion in binary serialization', () => {
    const badSchemaBuffer = new Int32Array([999, 0, 1, 1]);
    expect(() => deserializeWorkerState(badSchemaBuffer)).toThrow(/Schema version mismatch/);
  });

  it('handles worker timeout safely', async () => {
    // Delay of 200ms with timeout of 50ms
    const slowPort = new MockWorkerPort(200);
    const bridge = new EngineBridge({ workerPort: slowPort, timeoutMs: 50 });

    await expect(bridge.ping()).rejects.toThrow(/timed out/);
    bridge.dispose();
  });

  it('cleans up pending requests on bridge disposal without memory leaks', async () => {
    const delayedPort = new MockWorkerPort(1000);
    const bridge = new EngineBridge({ workerPort: delayedPort, timeoutMs: 5000 });

    const promise = bridge.ping();
    expect(bridge.getPendingCount()).toBe(1);

    bridge.dispose();
    expect(bridge.getPendingCount()).toBe(0);

    await expect(promise).rejects.toThrow(/EngineBridge was disposed/);
  });

  it('safely handles double unsubscribe in EventBus', () => {
    let callCount = 0;
    const unsub = GlobalEventBus.subscribe('GAME_ENDED', () => {
      callCount++;
    });

    GlobalEventBus.emit('GAME_ENDED', { winnerId: 'P1', reason: 'Checkmate' });
    expect(callCount).toBe(1);

    unsub();
    expect(() => unsub()).not.toThrow(); // Calling second time is safe no-op

    GlobalEventBus.emit('GAME_ENDED', { winnerId: 'P1', reason: 'Checkmate' });
    expect(callCount).toBe(1);
  });

  it('enforces history buffer overflow eviction (RF-06 boundary)', () => {
    const history = new HistoryManager({ maxHistoryLength: 3 });
    const domain = createDefaultDomainState();
    domain.boardEntities[p1.id] = { ...p1 };
    domain.occupancy[p1.position] = p1.id;

    for (let i = 0; i < 5; i++) {
      const from = asCoordinateKey(`0,${i + 1}`);
      const to = asCoordinateKey(`0,${i + 2}`);
      const cmd = new MovePieceCommand(p1.id, from, to, 'P1');
      history.execute(cmd, domain);
    }

    // Stack should be capped at maxHistoryLength 3
    expect(history.getUndoCount()).toBe(3);
  });

  it('invalidates redo stack upon branching execution after undo', () => {
    const history = new HistoryManager();
    const domain = createDefaultDomainState();
    domain.boardEntities[p1.id] = { ...p1 };
    domain.occupancy[p1.position] = p1.id;

    const cmd1 = new MovePieceCommand(p1.id, asCoordinateKey('0,1'), asCoordinateKey('0,2'), 'P1');
    history.execute(cmd1, domain);
    expect(history.canUndo()).toBe(true);

    history.undo(domain);
    expect(history.canRedo()).toBe(true);
    expect(history.getRedoCount()).toBe(1);

    // New divergent move branch
    const cmd2 = new MovePieceCommand(p1.id, asCoordinateKey('0,1'), asCoordinateKey('0,3'), 'P1');
    history.execute(cmd2, domain);

    // Redo stack MUST be invalidated
    expect(history.canRedo()).toBe(false);
    expect(history.getRedoCount()).toBe(0);
  });

  it('rolls back state cleanly upon optimistic rejection (RF-11)', () => {
    const domain = createDefaultDomainState('match-opt');
    domain.boardEntities[p1.id] = { ...p1 };
    domain.occupancy[p1.position] = p1.id;
    const initialPos = p1.position;

    const authoritativeSnapshot = JSON.parse(JSON.stringify(domain));

    const optManager = new OptimisticManager();
    const moveCmd = new MovePieceCommand(p1.id, asCoordinateKey('0,1'), asCoordinateKey('0,2'), 'P1');

    const optId = optManager.applyOptimistic(moveCmd, domain);
    expect(domain.occupancy[asCoordinateKey('0,2')]).toBe(p1.id);

    // Server rejects move
    const reconciled = optManager.rollbackAndReconcile(optId, authoritativeSnapshot);
    expect(reconciled.occupancy[asCoordinateKey('0,2')]).toBeUndefined();
    expect(reconciled.occupancy[initialPos]).toBe(p1.id);
    expect(reconciled.boardEntities[p1.id].position).toBe(initialPos);
  });

  it('rejects malformed persisted JSON snapshots safely', () => {
    expect(() => SnapshotSerializer.deserialize('{ not valid json')).toThrow();

    const memoryDriver = new MemoryStorageDriver();
    memoryDriver.setItem(StorageAdapter.STORAGE_KEY, '{ bad-json }');
    const adapter = new StorageAdapter(memoryDriver);

    expect(adapter.load()).toBeNull();
  });
});

