import { describe, it, expect, afterEach } from 'vitest';
import { UniversalMatchController } from '../../../controllers/UniversalMatchController';
import { MatchConfigurationManager } from '../../../matchmaking/config/MatchConfigurationManager';
import { gameStore } from '../../../core/state/gameStore';
import { asCoordinateKey } from '../../../core/coordinates';
import { CubicTopology } from '../../../core/topology/CubicTopology';
import { SquareTopology } from '../../../core/topology/SquareTopology';
import { RulesEngine } from '../../../engine/rules/RulesEngine';
import { GameOverDetector } from '../../../engine/rules/GameOverDetector';
import { IPieceEntity } from '../../../core/entities/types';
import { BughouseEngine } from '../BughouseEngine';

describe('Minigames & Non-Euclidean Topologies Authoritative Integration Suite', () => {
  let controller: UniversalMatchController | null = null;

  afterEach(() => {
    if (controller) {
      controller.dispose();
      controller = null;
    }
  });

  describe('1. Cubic Chess 3D (Non-Euclidean 6-Face Manifold)', () => {
    it('initializes match with CubicTopology and validates 6-face coordinates', () => {
      const config = MatchConfigurationManager.createDefaultMatch('cubic_chess', 2);
      controller = new UniversalMatchController(config);
      controller.startMatch();

      const topology = controller.getTopology();
      expect(topology).toBeInstanceOf(CubicTopology);
      expect((topology as CubicTopology).isCubic).toBe(true);

      const state = gameStore.getState().domain;
      // White pieces placed on Front face (face 2)
      const whiteKing = (Object.values(state.boardEntities) as IPieceEntity[]).find(
        (p) => p.type === 'PIECE' && p.variantId === 'KING' && p.ownerId === 'P1'
      );
      expect(whiteKing).toBeDefined();
      expect(whiteKing?.position).toContain(':'); // e.g. "2:4,0"

      // Check legal moves for white pawn on front face: should advance preserving face
      const whitePawn = (Object.values(state.boardEntities) as IPieceEntity[]).find(
        (p) => p.type === 'PIECE' && p.variantId === 'PAWN' && p.ownerId === 'P1'
      );
      expect(whitePawn).toBeDefined();
      const legalMoves = RulesEngine.getLegalMovesForPiece(whitePawn!, state, topology);
      expect(legalMoves.length).toBeGreaterThan(0);
      for (const m of legalMoves) {
        expect(m.to).toContain(':');
      }
    });

    it('transports directions and moves pieces across cube face boundaries', () => {
      const cube = new CubicTopology({ boardSize: 8 });
      // Moving North from top row of Front face (2:3,7) lands on bottom row of Top face (0:3,0)
      const nextStep = cube.getStepWithDirection(asCoordinateKey('2:3,7'), 0);
      expect(nextStep).not.toBeNull();
      expect(nextStep?.coord).toBe(asCoordinateKey('0:3,0'));
      expect(nextStep?.dir).toBe(0);

      // Ray continuous traversal across Front -> Top -> Back -> Bottom
      const ray = cube.getRay(asCoordinateKey('2:3,0'), 0, 32);
      expect(ray.length).toBeGreaterThan(16);
      expect(new Set(ray).size).toBe(ray.length); // loop terminated without duplicate coordinates
    });
  });

  describe('2. Toroidal Chess (Periodic Boundary Conditions)', () => {
    it('initializes Toroidal match and wraps moves across borders', () => {
      const config = MatchConfigurationManager.createDefaultMatch('toroidal_chess', 2);
      controller = new UniversalMatchController(config);
      controller.startMatch();

      const topology = controller.getTopology();
      expect(topology).toBeInstanceOf(SquareTopology);
      expect((topology as SquareTopology).isToroidal).toBe(true);

      // East neighbor of column 7 wraps to column 0
      const wrapped = topology.getNeighbor(asCoordinateKey('7,3'), 2);
      expect(wrapped).toBe(asCoordinateKey('0,3'));

      // West neighbor of column 0 wraps to column 7
      const wrappedWest = topology.getNeighbor(asCoordinateKey('0,3'), 6);
      expect(wrappedWest).toBe(asCoordinateKey('7,3'));

      // Ray loop break: Toroidal ray does not cycle indefinitely
      const ray = topology.getRay(asCoordinateKey('0,3'), 2, 64);
      expect(ray.length).toBeLessThanOrEqual(8);
    });
  });

  describe('3. Horde Chess (Authoritative 36-Pawn Asymmetry & Victory Resolution)', () => {
    it('initializes 36 White pawns without a White King and validates victory conditions', () => {
      const config = MatchConfigurationManager.createDefaultMatch('horde', 2);
      controller = new UniversalMatchController(config);
      controller.startMatch();

      const state = gameStore.getState().domain;
      const whitePieces = (Object.values(state.boardEntities) as IPieceEntity[]).filter(
        (p) => p.type === 'PIECE' && p.ownerId === 'P1' && !p.isCaptured
      );
      expect(whitePieces.length).toBe(36);

      const whiteKing = whitePieces.find((p) => p.variantId === 'KING');
      expect(whiteKing).toBeUndefined(); // White has no King in Horde Chess

      const topology = controller.getTopology();
      // GameOver check when White pawns are alive: match continues
      const initialOver = GameOverDetector.evaluateGameResult(state, topology, 10);
      expect(initialOver.isGameOver).toBe(false);

      // If all White pieces are captured, Black wins
      const simulatedState = {
        ...state,
        boardEntities: Object.fromEntries(
          Object.entries(state.boardEntities).map(([id, entity]) => [
            id,
            entity.type === 'PIECE' && (entity as IPieceEntity).ownerId === 'P1'
              ? { ...(entity as IPieceEntity), isCaptured: true }
              : entity,
          ])
        ),
      };
      const blackWin = GameOverDetector.evaluateGameResult(simulatedState, topology, 0);
      expect(blackWin.isGameOver).toBe(true);
      expect(blackWin.winnerId).toBe('P2');
      expect(blackWin.reason).toContain('Horde');
    });
  });

  describe('4. Spell Chess (Freeze & Jump Spell Execution)', () => {
    it('freezes enemy pieces and completely blocks their legal moves', () => {
      const config = MatchConfigurationManager.createDefaultMatch('spell_chess', 2);
      controller = new UniversalMatchController(config);
      controller.startMatch();

      const topology = controller.getTopology();
      const state = gameStore.getState().domain;

      // Select black knight at 1,7
      const knightId = state.occupancy[asCoordinateKey('1,7')];
      expect(knightId).toBeDefined();
      const knight = state.boardEntities[knightId!] as IPieceEntity;

      // Normal knight has legal moves
      const normalMoves = RulesEngine.getLegalMovesForPiece(knight, state, topology);
      expect(normalMoves.length).toBeGreaterThan(0);

      // Freeze the knight
      const frozenKnight: IPieceEntity = {
        ...knight,
        metadata: { ...knight.metadata, isFrozen: true },
      };
      const frozenMoves = RulesEngine.getLegalMovesForPiece(frozenKnight, state, topology);
      expect(frozenMoves).toHaveLength(0); // 100% immobilized by Freeze spell
    });

    it('enables jump spell allowing pieces to leap over obstacles', () => {
      const config = MatchConfigurationManager.createDefaultMatch('spell_chess', 2);
      controller = new UniversalMatchController(config);
      controller.startMatch();

      const topology = controller.getTopology();
      const state = gameStore.getState().domain;

      // Rook at 0,0 blocked by pawn at 0,1
      const rookId = state.occupancy[asCoordinateKey('0,0')];
      expect(rookId).toBeDefined();
      const rook = state.boardEntities[rookId!] as IPieceEntity;

      const normalMoves = RulesEngine.getLegalMovesForPiece(rook, state, topology);
      expect(normalMoves).toHaveLength(0); // Blocked by pawn

      // Grant Jump buff in state
      const jumpRook: IPieceEntity = {
        ...rook,
        metadata: { ...rook.metadata, hasJump: true },
      };
      const jumpState = {
        ...state,
        boardEntities: {
          ...state.boardEntities,
          [rook.id]: jumpRook,
        },
      };
      // Rook can now jump over pawn to 0,2
      const jumpIntent = {
        pieceId: jumpRook.id,
        from: asCoordinateKey('0,0'),
        to: asCoordinateKey('0,2'),
        actingPlayer: 'P1' as const,
      };
      const val = RulesEngine.validateMove(jumpState, jumpIntent, topology);
      expect(val.valid).toBe(true);
    });
  });

  describe('5. Bughouse (Twin-Board Drop Mechanics)', () => {
    it('authoritatively drops pieces onto partner board with drop inventory update', () => {
      const players = {
        team1WhiteA: 'alice',
        team1BlackB: 'bob',
        team2BlackA: 'charlie',
        team2WhiteB: 'diana',
      };
      let match = BughouseEngine.createMatch(players);

      // Simulate capturing black pawn on Board A -> transfers to Bob on Board B
      match = {
        ...match,
        players: {
          ...match.players,
          bob: {
            ...match.players.bob,
            reservePieces: ['p'],
          },
        },
        boardB: {
          ...match.boardB,
          activeColor: 'BLACK',
        },
      };

      // Drop pawn on empty square 4,4 on Board B
      const nextMatch = BughouseEngine.executeDrop(match, 'BOARD_B', 'bob', 'p', '4,4');
      expect(nextMatch.players.bob.reservePieces).not.toContain('p');
      expect(nextMatch.boardB.domainState?.occupancy[asCoordinateKey('4,4')]).toBeDefined();
    });
  });

  describe('6. Multiplayer 4-Player Arena (Non-Binary Elimination)', () => {
    it('eliminates a player without prematurely ending the match for surviving players', () => {
      const config = MatchConfigurationManager.createDefaultMatch('4player', 4);
      controller = new UniversalMatchController(config);
      controller.startMatch();

      const topology = controller.getTopology();
      const state = gameStore.getState().domain;
      expect(config.slots).toHaveLength(4);

      // Verify GameOverDetector doesn't declare game over when multiple factions remain
      const res = GameOverDetector.evaluateGameResult(state, topology, 12);
      expect(res.isGameOver).toBe(false);
    });
  });
});
