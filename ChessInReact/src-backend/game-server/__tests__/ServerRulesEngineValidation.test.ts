import { describe, it, expect, beforeEach } from 'vitest';
import { ChessRoomStateSchema, NetworkEntitySchema, PlayerSchema } from '../schemas/RoomStateSchema';
import { TurnResolver, IQueuedMove } from '../rooms/TurnResolver';

describe('Authoritative Server RulesEngine Validation', () => {
  let resolver: TurnResolver;
  let state: ChessRoomStateSchema;

  beforeEach(() => {
    resolver = new TurnResolver();
    state = new ChessRoomStateSchema({ matchId: 'rules-test' });
    state.phase = 'PLAYING';
    state.activePlayerId = 'p1';

    // White player
    state.players.set(
      's1',
      new PlayerSchema({
        sessionId: 's1',
        playerId: 'p1',
        username: 'White',
        role: 'WHITE',
        connected: true,
        ping: 10,
      })
    );

    // Black player
    state.players.set(
      's2',
      new PlayerSchema({
        sessionId: 's2',
        playerId: 'p2',
        username: 'Black',
        role: 'BLACK',
        connected: true,
        ping: 10,
      })
    );

    // Setup basic board entities
    // White King at e1 (4,0), White Rook at a1 (0,0) and h1 (7,0), White Pawn at e2 (4,1)
    // Black King at e8 (4,7), Black Rook at a8 (0,7)
    state.boardEntities.set(
      'wk',
      new NetworkEntitySchema({
        id: 'wk',
        entityType: 'PIECE',
        position: 'e1',
        ownerId: 'p1',
        variantId: 'K',
      })
    );
    state.boardEntities.set(
      'wr-a',
      new NetworkEntitySchema({
        id: 'wr-a',
        entityType: 'PIECE',
        position: 'a1',
        ownerId: 'p1',
        variantId: 'R',
      })
    );
    state.boardEntities.set(
      'wr-h',
      new NetworkEntitySchema({
        id: 'wr-h',
        entityType: 'PIECE',
        position: 'h1',
        ownerId: 'p1',
        variantId: 'R',
      })
    );
    state.boardEntities.set(
      'wp-e',
      new NetworkEntitySchema({
        id: 'wp-e',
        entityType: 'PIECE',
        position: 'e2',
        ownerId: 'p1',
        variantId: 'P',
      })
    );
    state.boardEntities.set(
      'bk',
      new NetworkEntitySchema({
        id: 'bk',
        entityType: 'PIECE',
        position: 'e8',
        ownerId: 'p2',
        variantId: 'K',
      })
    );
    state.boardEntities.set(
      'br-a',
      new NetworkEntitySchema({
        id: 'br-a',
        entityType: 'PIECE',
        position: 'a8',
        ownerId: 'p2',
        variantId: 'R',
      })
    );
  });

  it('accepts legal pawn move (e2 to e4) and toggles active player', () => {
    const move: IQueuedMove = {
      playerId: 'p1',
      pieceId: 'wp-e',
      from: 'e2',
      to: 'e4',
      seqId: 1,
      timestamp: Date.now(),
    };

    const result = resolver.executeSequentialMove(move, state);
    expect(result.success).toBe(true);
    expect(state.boardEntities.get('wp-e')?.position).toBe('e4');
    expect(state.activePlayerId).toBe('p2');
    expect(state.turnNumber).toBe(2);
  });

  it('rejects illegal pawn move (e2 to e5, 3 squares)', () => {
    const move: IQueuedMove = {
      playerId: 'p1',
      pieceId: 'wp-e',
      from: 'e2',
      to: 'e5',
      seqId: 1,
      timestamp: Date.now(),
    };

    const result = resolver.executeSequentialMove(move, state);
    expect(result.success).toBe(false);
    expect(result.reason).toContain('invalid');
    expect(state.boardEntities.get('wp-e')?.position).toBe('e2');
    expect(state.activePlayerId).toBe('p1');
  });

  it('supports kingside castling (e1 to g1) and moves the rook to f1', () => {
    // Pawn at e2 is removed so king can castle freely if king path is clear
    state.boardEntities.delete('wp-e');

    const move: IQueuedMove = {
      playerId: 'p1',
      pieceId: 'wk',
      from: 'e1',
      to: 'g1',
      seqId: 1,
      timestamp: Date.now(),
    };

    const result = resolver.executeSequentialMove(move, state);
    expect(result.success).toBe(true);
    expect(state.boardEntities.get('wk')?.position).toBe('g1');
    // Kingside rook at h1 moved to f1
    expect(state.boardEntities.get('wr-h')?.position).toBe('f1');
    expect(state.boardEntities.get('wr-h')?.hasMoved).toBe(true);
  });

  it('rejects move when moving out of turn', () => {
    const move: IQueuedMove = {
      playerId: 'p2', // Black tries to move while active is p1
      pieceId: 'bk',
      from: 'e8',
      to: 'e7',
      seqId: 1,
      timestamp: Date.now(),
    };

    const result = resolver.executeSequentialMove(move, state);
    expect(result.success).toBe(false);
    expect(result.reason).toContain('Not your turn');
  });

  it('validates fairy pieces via Betza resolver (e.g. Archbishop)', () => {
    // White Archbishop (B+N) at d4 (3,3)
    state.boardEntities.set(
      'w-arch',
      new NetworkEntitySchema({
        id: 'w-arch',
        entityType: 'PIECE',
        position: 'd4',
        ownerId: 'p1',
        variantId: 'ARCHBISHOP',
      })
    );

    // 1. Knight leap: d4 to e6 (3,3 to 4,5: dx=1, dy=2)
    const leapMove: IQueuedMove = {
      playerId: 'p1',
      pieceId: 'w-arch',
      from: 'd4',
      to: 'e6',
      seqId: 1,
      timestamp: Date.now(),
    };

    const leapResult = resolver.executeSequentialMove(leapMove, state);
    expect(leapResult.success).toBe(true);
    expect(state.boardEntities.get('w-arch')?.position).toBe('e6');
  });
});
