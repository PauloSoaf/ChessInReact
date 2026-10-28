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

    it('captures opponent piece atomically on legal diagonal pawn move', () => {
      // Place black pawn at d3 (diagonal to e2)
      state.boardEntities.get('p-b-e7')!.position = 'd3';

      const result = resolver.executeSequentialMove(
        {
          playerId: 'player-white',
          pieceId: 'p-w-e2',
          from: 'e2',
          to: 'd3',
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

  describe('Geometric & Path Validation (S03-01 Authoritative Anti-Cheat)', () => {
    beforeEach(() => {
      // Set up standard back-rank pieces for White
      state.boardEntities.set(
        'r-w-a1',
        new NetworkEntitySchema({
          id: 'r-w-a1',
          entityType: 'PIECE',
          position: 'a1',
          ownerId: 'player-white',
          variantId: 'R',
        })
      );
      state.boardEntities.set(
        'b-w-c1',
        new NetworkEntitySchema({
          id: 'b-w-c1',
          entityType: 'PIECE',
          position: 'c1',
          ownerId: 'player-white',
          variantId: 'B',
        })
      );
      state.boardEntities.set(
        'n-w-b1',
        new NetworkEntitySchema({
          id: 'n-w-b1',
          entityType: 'PIECE',
          position: 'b1',
          ownerId: 'player-white',
          variantId: 'N',
        })
      );
      state.boardEntities.set(
        'q-w-d1',
        new NetworkEntitySchema({
          id: 'q-w-d1',
          entityType: 'PIECE',
          position: 'd1',
          ownerId: 'player-white',
          variantId: 'Q',
        })
      );
      state.boardEntities.set(
        'k-w-e1',
        new NetworkEntitySchema({
          id: 'k-w-e1',
          entityType: 'PIECE',
          position: 'e1',
          ownerId: 'player-white',
          variantId: 'K',
        })
      );
    });

    it('rejects pawn teleport (e2 -> e8) and preserves state', () => {
      const stateBefore = JSON.stringify(state);
      const res = resolver.executeSequentialMove(
        { playerId: 'player-white', pieceId: 'p-w-e2', from: 'e2', to: 'e8', seqId: 10, timestamp: Date.now() },
        state
      );
      expect(res.success).toBe(false);
      expect(res.reason).toContain('Illegal pawn advance distance');
      expect(JSON.stringify(state)).toBe(stateBefore);
    });

    it('rejects diagonal rook move (a1 -> h8) and preserves state', () => {
      const stateBefore = JSON.stringify(state);
      const res = resolver.executeSequentialMove(
        { playerId: 'player-white', pieceId: 'r-w-a1', from: 'a1', to: 'h8', seqId: 11, timestamp: Date.now() },
        state
      );
      expect(res.success).toBe(false);
      expect(res.reason).toContain('Illegal rook move');
      expect(JSON.stringify(state)).toBe(stateBefore);
    });

    it('rejects bishop jumping through pieces (c1 -> a3 with b2 or friendly pieces) and preserves state', () => {
      // Place piece at d2 obstructing c1 -> e3
      state.boardEntities.set(
        'obstacle-d2',
        new NetworkEntitySchema({ id: 'obstacle-d2', position: 'd2', ownerId: 'player-white', variantId: 'P' })
      );
      const stateBefore = JSON.stringify(state);
      const res = resolver.executeSequentialMove(
        { playerId: 'player-white', pieceId: 'b-w-c1', from: 'c1', to: 'e3', seqId: 12, timestamp: Date.now() },
        state
      );
      expect(res.success).toBe(false);
      expect(res.reason).toContain('obstructed');
      expect(JSON.stringify(state)).toBe(stateBefore);
    });

    it('rejects pawn moving forward into an occupied square without diagonal capture and preserves state', () => {
      // Put opponent at e3 blocking e2 pawn
      state.boardEntities.set(
        'blocker-e3',
        new NetworkEntitySchema({ id: 'blocker-e3', position: 'e3', ownerId: 'player-black', variantId: 'P' })
      );
      const stateBefore = JSON.stringify(state);
      const res = resolver.executeSequentialMove(
        { playerId: 'player-white', pieceId: 'p-w-e2', from: 'e2', to: 'e3', seqId: 13, timestamp: Date.now() },
        state
      );
      expect(res.success).toBe(false);
      expect(res.reason).toContain('cannot advance forward into an occupied square');
      expect(JSON.stringify(state)).toBe(stateBefore);
    });

    it('rejects knight with invalid non-L displacement and preserves state', () => {
      const stateBefore = JSON.stringify(state);
      const res = resolver.executeSequentialMove(
        { playerId: 'player-white', pieceId: 'n-w-b1', from: 'b1', to: 'b3', seqId: 14, timestamp: Date.now() },
        state
      );
      expect(res.success).toBe(false);
      expect(res.reason).toContain('Illegal knight move');
      expect(JSON.stringify(state)).toBe(stateBefore);
    });

    it('rejects moves with malformed coordinates and preserves state', () => {
      const stateBefore = JSON.stringify(state);
      const res = resolver.executeSequentialMove(
        { playerId: 'player-white', pieceId: 'p-w-e2', from: 'e2', to: 'malformed_coord', seqId: 15, timestamp: Date.now() },
        state
      );
      expect(res.success).toBe(false);
      expect(res.reason).toContain('Malformed');
      expect(JSON.stringify(state)).toBe(stateBefore);
    });

    it('rejects moves outside the board boundary (e.g. e9, i4) and preserves state', () => {
      const stateBefore = JSON.stringify(state);
      const res = resolver.executeSequentialMove(
        { playerId: 'player-white', pieceId: 'p-w-e2', from: 'e2', to: 'e9', seqId: 16, timestamp: Date.now() },
        state
      );
      expect(res.success).toBe(false);
      expect(res.reason).toContain('out-of-bounds');
      expect(JSON.stringify(state)).toBe(stateBefore);
    });

    it('accepts valid knight jump over pieces (b1 -> c3)', () => {
      const res = resolver.executeSequentialMove(
        { playerId: 'player-white', pieceId: 'n-w-b1', from: 'b1', to: 'c3', seqId: 17, timestamp: Date.now() },
        state
      );
      expect(res.success).toBe(true);
      expect(state.boardEntities.get('n-w-b1')!.position).toBe('c3');
    });

    it('accepts valid pawn move e2 -> e4 on starting rank', () => {
      const res = resolver.executeSequentialMove(
        { playerId: 'player-white', pieceId: 'p-w-e2', from: 'e2', to: 'e4', seqId: 18, timestamp: Date.now() },
        state
      );
      expect(res.success).toBe(true);
      expect(state.boardEntities.get('p-w-e2')!.position).toBe('e4');
      expect(state.turnNumber).toBe(2);
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
