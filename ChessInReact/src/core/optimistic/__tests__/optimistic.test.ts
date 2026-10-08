import { beforeEach, describe, expect, it } from 'vitest';
import { asCoordinateKey, asEntityId } from '../../coordinates';
import { IPieceEntity } from '../../entities/types';
import { MovePieceCommand } from '../../commands';
import { createDefaultDomainState } from '../../state/initialState';
import { IDomainState } from '../../state/gameState';
import { OptimisticManager } from '../OptimisticManager';

describe('OptimisticManager (Client-side Prediction & Rollback Reconciliation)', () => {
  let optimistic: OptimisticManager;
  let domain: IDomainState;

  const piece1: IPieceEntity = {
    id: asEntityId('pawn-1'),
    type: 'PIECE',
    ownerId: 'P1',
    variantId: 'PAWN',
    position: asCoordinateKey('0,1'),
    hasMoved: false,
    isCaptured: false,
  };

  const piece2: IPieceEntity = {
    id: asEntityId('pawn-2'),
    type: 'PIECE',
    ownerId: 'P1',
    variantId: 'PAWN',
    position: asCoordinateKey('1,1'),
    hasMoved: false,
    isCaptured: false,
  };

  beforeEach(() => {
    optimistic = new OptimisticManager();
    domain = createDefaultDomainState('optimistic-match');
    domain.boardEntities[piece1.id] = { ...piece1 };
    domain.occupancy[piece1.position] = piece1.id;
    domain.boardEntities[piece2.id] = { ...piece2 };
    domain.occupancy[piece2.position] = piece2.id;
  });

  it('applies optimistic command immediately and registers pending record (RF-07)', () => {
    const cmd = new MovePieceCommand(piece1.id, asCoordinateKey('0,1'), asCoordinateKey('0,2'), 'P1');
    const optId = optimistic.applyOptimistic(cmd, domain);

    expect(domain.boardEntities[piece1.id].position).toBe('0,2');
    expect(optimistic.getPendingCount()).toBe(1);
    expect(optimistic.getPendingCommandIds()).toContain(optId);
  });

  it('acknowledges optimistic command once server confirms', () => {
    const cmd = new MovePieceCommand(piece1.id, asCoordinateKey('0,1'), asCoordinateKey('0,2'), 'P1');
    const optId = optimistic.applyOptimistic(cmd, domain);

    optimistic.acknowledge(optId);
    expect(optimistic.getPendingCount()).toBe(0);
  });

  it('rolls back rejected command to authoritative state while preserving subsequent valid moves', () => {
    const authoritativeBase = JSON.parse(JSON.stringify(domain)) as IDomainState;

    // Apply move 1 (which will be rejected)
    const cmd1 = new MovePieceCommand(piece1.id, asCoordinateKey('0,1'), asCoordinateKey('0,2'), 'P1');
    const optId1 = optimistic.applyOptimistic(cmd1, domain);

    // Apply move 2 on independent piece (which remains pending)
    const cmd2 = new MovePieceCommand(piece2.id, asCoordinateKey('1,1'), asCoordinateKey('1,2'), 'P1');
    const optId2 = optimistic.applyOptimistic(cmd2, domain);

    expect(optimistic.getPendingCount()).toBe(2);

    // Server rejects cmd1 (e.g. server detected pin or collision)
    const reconciled = optimistic.rollbackAndReconcile(optId1, authoritativeBase);

    // Piece 1 is back at authoritative position 0,1
    expect(reconciled.boardEntities[piece1.id].position).toBe('0,1');
    // Piece 2 move was replayed on top of authoritative base, so it is at 1,2!
    expect(reconciled.boardEntities[piece2.id].position).toBe('1,2');
    expect(optimistic.getPendingCount()).toBe(1);
    expect(optimistic.getPendingCommandIds()).toContain(optId2);
  });

  it('resets completely to authoritative snapshot (RF-08)', () => {
    const cmd = new MovePieceCommand(piece1.id, asCoordinateKey('0,1'), asCoordinateKey('0,2'), 'P1');
    optimistic.applyOptimistic(cmd, domain);

    const freshServerState = createDefaultDomainState('server-override');
    const result = optimistic.resetToAuthoritative(freshServerState);

    expect(optimistic.getPendingCount()).toBe(0);
    expect(result.matchId).toBe('server-override');
  });
});
