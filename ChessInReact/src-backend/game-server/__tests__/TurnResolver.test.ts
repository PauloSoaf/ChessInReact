import { describe, it, expect, beforeEach } from 'vitest';
import { TurnResolver } from '../rooms/TurnResolver';
import { ChessRoomStateSchema, NetworkEntitySchema, PlayerSchema } from '../schemas/RoomStateSchema';

describe('Spec 03 - TurnResolver (RF-01, RF-06, RF-07)', () => {
  let resolver: TurnResolver;
  let state: ChessRoomStateSchema;

  beforeEach(() => {
    resolver = new TurnResolver();
    state = new ChessRoomStateSchema({
      matchId: 'test-match-1',
      phase: 'PLAYING',
      activePlayerId: 'player-white',
      turnNumber: 1,
    });

    state.players.set(
      'sess-w',
      new PlayerSchema({
        sessionId: 'sess-w',
        playerId: 'player-white',
        role: 'WHITE',
      })
    );
    state.players.set(
      'sess-b',
      new PlayerSchema({
        sessionId: 'sess-b',
        playerId: 'player-black',
        role: 'BLACK',
      })
    );

    // Initial pieces
    state.boardEntities.set(
      'p-w-e2',
      new NetworkEntitySchema({
        id: 'p-w-e2',
        entityType: 'PIECE',
        position: 'e2',
        ownerId: 'player-white',
        variantId: 'P',
        hasMoved: false,
        isCaptured: false,
      })
    );
    state.boardEntities.set(
      'p-w-d2',
      new NetworkEntitySchema({
        id: 'p-w-d2',
        entityType: 'PIECE',
        position: 'd2',
        ownerId: 'player-white',
        variantId: 'P',
        hasMoved: false,
        isCaptured: false,
      })
    );
    state.boardEntities.set(
      'p-b-e7',
      new NetworkEntitySchema({
        id: 'p-b-e7',
        entityType: 'PIECE',
        position: 'e7',
        ownerId: 'player-black',
        variantId: 'P',
        hasMoved: false,
        isCaptured: false,
      })
    );
  });

  describe('Sequential Mode (1v1 Strict Policy)', () => {
    it('rejects moves if the match is not in PLAYING phase', () => {
      state.phase = 'WAITING';
      const result = resolver.executeSequentialMove(
        {
          playerId: 'player-white',
          pieceId: 'p-w-e2',
          from: 'e2',
          to: 'e4',
          seqId: 1,
          timestamp: Date.now(),
        },
        state
      );

      expect(result.success).toBe(false);
      expect(result.reason).toContain('phase');
    });

    it('rejects moves attempted out of turn (Strict Sequential Invariant)', () => {
      const result = resolver.executeSequentialMove(
        {
          playerId: 'player-black', // Black trying to move on White's turn
          pieceId: 'p-b-e7',
          from: 'e7',
          to: 'e5',
          seqId: 1,
          timestamp: Date.now(),
        },
        state
      );

      expect(result.success).toBe(false);
      expect(result.reason).toContain('Not your turn');
    });

    it('rejects moves commanded for an opponent piece (Anti-Cheat)', () => {
      // White attempting to command Black's piece
      const result = resolver.executeSequentialMove(
        {
          playerId: 'player-white',
          pieceId: 'p-b-e7',
          from: 'e7',
          to: 'e5',
          seqId: 1,
          timestamp: Date.now(),
        },
        state
      );

      expect(result.success).toBe(false);
      expect(result.reason).toContain('Anti-cheat violation');
    });

    it('rejects moves when origin equals destination', () => {
      const result = resolver.executeSequentialMove(
        {
          playerId: 'player-white',
          pieceId: 'p-w-e2',
          from: 'e2',
          to: 'e2',
          seqId: 1,
          timestamp: Date.now(),
        },
        state
      );

      expect(result.success).toBe(false);
      expect(result.reason).toContain('Destination equals origin');
    });

    it('rejects moves capturing friendly pieces', () => {
      const result = resolver.executeSequentialMove(
        {
          playerId: 'player-white',
          pieceId: 'p-w-e2',
          from: 'e2',
          to: 'd2', // Friendly piece at d2
          seqId: 1,
          timestamp: Date.now(),
        },
        state
      );

      expect(result.success).toBe(false);
      expect(result.reason).toContain('Cannot capture friendly piece');
    });

    it('executes a valid move, updates state, and alternates active player', () => {
      const result = resolver.executeSequentialMove(
        {
          playerId: 'player-white',
          pieceId: 'p-w-e2',
          from: 'e2',
          to: 'e4',
          seqId: 42,
          timestamp: Date.now(),
        },
        state
      );

      expect(result.success).toBe(true);
      expect(result.pieceId).toBe('p-w-e2');
      expect(result.to).toBe('e4');
      expect(result.seqId).toBe(42);

      const piece = state.boardEntities.get('p-w-e2')!;
      expect(piece.position).toBe('e4');
      expect(piece.hasMoved).toBe(true);
      expect(state.lastProcessedSequenceId).toBe(42);
      expect(state.turnNumber).toBe(2);
      expect(state.activePlayerId).toBe('player-black'); // Turn toggled!
    });

    it('captures opponent piece atomically and reports capturedPieceId', () => {
      // Place black pawn at e4
      state.boardEntities.get('p-b-e7')!.position = 'e4';

      const result = resolver.executeSequentialMove(
        {
          playerId: 'player-white',
          pieceId: 'p-w-e2',
          from: 'e2',
          to: 'e4',
          seqId: 43,
          timestamp: Date.now(),
        },
        state
      );

      expect(result.success).toBe(true);
      expect(result.capturedPieceId).toBe('p-b-e7');

      const capturedPiece = state.boardEntities.get('p-b-e7')!;
      expect(capturedPiece.isCaptured).toBe(true);
      expect(capturedPiece.position).toBe('');
    });
  });

  describe('Simultaneous Resolution Mode (RF-06, RF-07)', () => {
    it('executes uncontested moves without collision', () => {
      const moves = [
        {
          playerId: 'player-white',
          pieceId: 'p-w-e2',
          from: 'e2',
          to: 'e4',
          seqId: 101,
          timestamp: Date.now(),
        },
        {
          playerId: 'player-black',
          pieceId: 'p-b-e7',
          from: 'e7',
          to: 'e5',
          seqId: 102,
          timestamp: Date.now(),
        },
      ];

      const { resolutions, collisions } = resolver.resolveSimultaneousCollisions(moves, state);

      expect(collisions.length).toBe(0);
      expect(resolutions.length).toBe(2);
      expect(resolutions.every((r) => r.success)).toBe(true);
      expect(state.boardEntities.get('p-w-e2')!.position).toBe('e4');
      expect(state.boardEntities.get('p-b-e7')!.position).toBe('e5');
    });

    it('resolves collision using piece weights when Queen contends with Pawn', () => {
      // Add White Queen at d1
      state.boardEntities.set(
        'q-w-d1',
        new NetworkEntitySchema({
          id: 'q-w-d1',
          entityType: 'PIECE',
          position: 'd1',
          ownerId: 'player-white',
          variantId: 'Q', // Weight 9
          hasMoved: false,
          isCaptured: false,
        })
      );

      // Both Queen (weight 9) and Black Pawn (weight 1) move to d5
      const moves = [
        {
          playerId: 'player-white',
          pieceId: 'q-w-d1',
          from: 'd1',
          to: 'd5',
          seqId: 201,
          timestamp: Date.now(),
        },
        {
          playerId: 'player-black',
          pieceId: 'p-b-e7',
          from: 'e7',
          to: 'd5',
          seqId: 202,
          timestamp: Date.now(),
        },
      ];

      const { resolutions, collisions } = resolver.resolveSimultaneousCollisions(moves, state);

      expect(collisions.length).toBe(1);
      expect(collisions[0].targetCoord).toBe('d5');
      expect(collisions[0].victoriousPlayerId).toBe('player-white');
      expect(collisions[0].destroyedPieceIds).toEqual(['p-b-e7']);

      // Queen survives at d5, Pawn is destroyed
      expect(state.boardEntities.get('q-w-d1')!.position).toBe('d5');
      expect(state.boardEntities.get('p-b-e7')!.isCaptured).toBe(true);

      const queenRes = resolutions.find((r) => r.pieceId === 'q-w-d1')!;
      const pawnRes = resolutions.find((r) => r.pieceId === 'p-b-e7')!;
      expect(queenRes.success).toBe(true);
      expect(pawnRes.success).toBe(false);
    });

    it('resolves collision with mutual annihilation when two equal-weight pawns contend', () => {
      // Both White Pawn and Black Pawn move to e4 simultaneously
      const moves = [
        {
          playerId: 'player-white',
          pieceId: 'p-w-e2',
          from: 'e2',
          to: 'e4',
          seqId: 301,
          timestamp: Date.now(),
        },
        {
          playerId: 'player-black',
          pieceId: 'p-b-e7',
          from: 'e7',
          to: 'e4',
          seqId: 302,
          timestamp: Date.now(),
        },
      ];

      const { resolutions, collisions } = resolver.resolveSimultaneousCollisions(moves, state);

      expect(collisions.length).toBe(1);
      expect(collisions[0].victoriousPlayerId).toBeUndefined(); // Tie / mutual clash
      expect(collisions[0].destroyedPieceIds).toEqual(['p-w-e2', 'p-b-e7']);

      // Both pieces destroyed
      expect(state.boardEntities.get('p-w-e2')!.isCaptured).toBe(true);
      expect(state.boardEntities.get('p-b-e7')!.isCaptured).toBe(true);

      expect(resolutions.every((r) => !r.success)).toBe(true);
    });
  });
});
