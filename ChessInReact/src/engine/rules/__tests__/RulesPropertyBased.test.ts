import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { RulesEngine } from '../RulesEngine';
import { ClassicBoardFactory } from '../utils/ClassicBoardFactory';
import { SquareTopology } from '../../../core/topology/SquareTopology';
import { MovePieceCommand } from '../../../core/commands/MovePieceCommand';
import { produce } from 'immer';
import { CheckValidator } from '../CheckValidator';
import { IPieceEntity } from '../../../core/entities/types';
import { parseCoord } from '../utils/CoordinateHelper';
import { computePositionKey } from '../utils/PositionHasher';
import { asEntityId, asCoordinateKey } from '../../../core/coordinates/types';
import { IVariantConfiguration } from '../interfaces/IRulesContracts';

describe('Spec 04 — Property-Based & Invariant Testing', () => {
  const topology = new SquareTopology({ width: 8, height: 8 });

  it('Invariant 1: Soundness — every move in getLegalMoves validates as legal in validateMove', () => {
    // Test across starting position and multiple diverse FEN positions
    const testPositions = [
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', // KiwiPete
      '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', // Pos 3
      'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', // Pos 4
      'rnbqkb1r/pp1p1ppp/2p5/4P3/2B5/8/PPP1NnPP/RNBQK2R w KQkq - 0 6',
    ];

    for (const fen of testPositions) {
      const state = ClassicBoardFactory.createFromFEN(fen);
      const legalMoves = RulesEngine.getLegalMoves(state, topology);

      for (const move of legalMoves) {
        const validation = RulesEngine.validateMove(
          state,
          {
            pieceId: move.pieceId,
            actingPlayer: state.activePlayer,
            from: move.from,
            to: move.to,
          },
          topology
        );

        expect(
          validation.valid,
          `Move ${move.pieceId} from ${move.from} to ${move.to} in FEN "${fen}" must be valid`
        ).toBe(true);
      }
    }
  });

  it('Invariant 2: King Safety — moving player king is NEVER in check after applying any legal move', () => {
    const fen = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
    const state = ClassicBoardFactory.createFromFEN(fen);
    const legalMoves = RulesEngine.getLegalMoves(state, topology);

    for (const move of legalMoves) {
      const nextState = produce(state, (draft) => {
        const cmd = new MovePieceCommand(
          move.pieceId,
          move.from,
          move.to,
          state.activePlayer,
          undefined,
          true,
          false
        );
        cmd.execute(draft);
      });

      const royalPiece = CheckValidator.findRoyalPiece(state.activePlayer, nextState);
      expect(royalPiece).toBeDefined();

      const opponentId = state.activePlayer === 'P1' ? 'P2' : 'P1';
      const leavesInCheck = CheckValidator.isSquareAttacked(
        royalPiece!.position,
        opponentId,
        nextState,
        topology
      );

      expect(
        leavesInCheck,
        `King of ${state.activePlayer} must not be left in check after move ${move.from}->${move.to}`
      ).toBe(false);
    }
  });

  it('Invariant 3: Immutability & Purity — zero state mutations occur on frozen or plain domain states', () => {
    const state = Object.freeze(ClassicBoardFactory.createStandardInitialState());
    Object.freeze(state.occupancy);
    Object.freeze(state.boardEntities);

    // Deep snapshot serialization
    const beforeJson = JSON.stringify(state);

    // Query legal moves and validate moves
    const legalMoves = RulesEngine.getLegalMoves(state, topology);
    expect(legalMoves.length).toBe(20);

    for (const move of legalMoves) {
      const res = RulesEngine.validateMove(
        state,
        {
          pieceId: move.pieceId,
          actingPlayer: state.activePlayer,
          from: move.from,
          to: move.to,
        },
        topology
      );
      expect(res.valid).toBe(true);
    }

    const afterJson = JSON.stringify(state);
    expect(afterJson).toBe(beforeJson);
  });

  it('Invariant 4: Reversible Symmetry — execute(cmd) then undo(cmd) restores bit-for-bit domain occupancy', () => {
    const state = ClassicBoardFactory.createStandardInitialState();
    const legalMoves = RulesEngine.getLegalMoves(state, topology);

    for (const move of legalMoves) {
      const cmd = new MovePieceCommand(
        move.pieceId,
        move.from,
        move.to,
        state.activePlayer,
        undefined,
        true,
        false
      );

      // Apply move
      const movedState = produce(state, (draft) => {
        cmd.execute(draft);
      });

      expect(movedState.occupancy[move.to]).toBe(move.pieceId);
      expect(movedState.occupancy[move.from]).toBeUndefined();

      // Undo move
      const undoneState = produce(movedState, (draft) => {
        cmd.undo(draft);
      });

      expect(undoneState.occupancy[move.from]).toBe(move.pieceId);
      expect(undoneState.occupancy[move.to]).toBeUndefined();
      expect(undoneState.boardEntities[move.pieceId]?.position).toBe(move.from);
      expect((undoneState.boardEntities[move.pieceId] as IPieceEntity | undefined)?.hasMoved).toBe(
        (state.boardEntities[move.pieceId] as IPieceEntity | undefined)?.hasMoved
      );
      expect(undoneState.activePlayer).toBe(state.activePlayer);
    }
  });

  it('Invariant 5: Multi-ply Random Walk — 25 games of 20 plies maintain bijective occupancy invariants', () => {
    const numGames = 25;
    const pliesPerGame = 20;

    for (let g = 0; g < numGames; g++) {
      let state = ClassicBoardFactory.createStandardInitialState();

      for (let ply = 0; ply < pliesPerGame; ply++) {
        const legalMoves = RulesEngine.getLegalMoves(state, topology);
        if (legalMoves.length === 0) {
          // Terminal node (checkmate or stalemate)
          break;
        }

        // Deterministic pseudo-random pick
        const pickIndex = (g * 31 + ply * 17) % legalMoves.length;
        const chosenMove = legalMoves[pickIndex];

        state = produce(state, (draft) => {
          const cmd = new MovePieceCommand(
            chosenMove.pieceId,
            chosenMove.from,
            chosenMove.to,
            state.activePlayer,
            undefined,
            true,
            false
          );
          cmd.execute(draft);
        });

        // Verify Invariant: Occupancy map is 100% bijective with non-captured entities
        const activeEntities = Object.values(state.boardEntities).filter(
          (e) => e && e.type === 'PIECE' && !e.isCaptured
        );

        const occupancyCount = Object.keys(state.occupancy).length;
        expect(occupancyCount).toBe(activeEntities.length);

        for (const ent of activeEntities) {
          expect(state.occupancy[ent.position]).toBe(ent.id);
          const parsed = parseCoord(ent.position);
          expect(parsed).not.toBeNull();
          expect(parsed!.x).toBeGreaterThanOrEqual(0);
          expect(parsed!.x).toBeLessThan(8);
          expect(parsed!.y).toBeGreaterThanOrEqual(0);
          expect(parsed!.y).toBeLessThan(8);
        }
      }
    }
  });

  it('Invariant 6: fast-check Property — Arbitrary move choices maintain soundness, king safety, and occupancy bijection (RNF-15)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 50 }), { minLength: 5, maxLength: 25 }),
        (choiceIndices) => {
          let state = ClassicBoardFactory.createStandardInitialState();

          for (const choice of choiceIndices) {
            const legalMoves = RulesEngine.getLegalMoves(state, topology);
            if (legalMoves.length === 0) {
              break; // Terminal
            }

            // Every legal move must validate
            const chosenMove = legalMoves[choice % legalMoves.length];
            const validation = RulesEngine.validateMove(
              state,
              {
                pieceId: chosenMove.pieceId,
                actingPlayer: state.activePlayer,
                from: chosenMove.from,
                to: chosenMove.to,
              },
              topology
            );
            expect(validation.valid).toBe(true);

            // Execute move
            const actingPlayer = state.activePlayer;
            state = produce(state, (draft) => {
              const cmd = new MovePieceCommand(
                chosenMove.pieceId,
                chosenMove.from,
                chosenMove.to,
                actingPlayer,
                undefined,
                true,
                false
              );
              cmd.execute(draft);
            });

            // King safety check for moving player
            const royal = CheckValidator.findRoyalPiece(actingPlayer, state);
            if (royal) {
              const opponent = actingPlayer === 'P1' ? 'P2' : 'P1';
              const inCheck = CheckValidator.isSquareAttacked(royal.position, opponent, state, topology);
              expect(inCheck).toBe(false);
            }

            // Occupancy bijection check
            const activePieces = Object.values(state.boardEntities).filter(
              (e) => e && e.type === 'PIECE' && !e.isCaptured
            );
            expect(Object.keys(state.occupancy).length).toBe(activePieces.length);
          }

          return true;
        }
      ),
      { numRuns: 40 }
    );
  });

  it('Invariant 7: fast-check Property — Crazyhouse drop integrity: arbitrary drops on invalid cells, occupied cells, or rank 1/8 pawns always reject without state mutation (P0, RF-12)', () => {
    const crazyVariant: IVariantConfiguration = {
      variantId: 'crazyhouse',
      allowDrops: true,
    };

    fc.assert(
      fc.property(
        fc.integer({ min: -2, max: 10 }),
        fc.integer({ min: -2, max: 10 }),
        fc.constantFrom<'PAWN' | 'KNIGHT' | 'BISHOP' | 'ROOK' | 'QUEEN'>('PAWN', 'KNIGHT', 'BISHOP', 'ROOK', 'QUEEN'),
        (x, y, pieceType) => {
          const state = produce(ClassicBoardFactory.createStandardInitialState(), (draft) => {
            draft.capturedInventory.P1 = [pieceType];
          });
          const originalJson = JSON.stringify(state);

          const targetCoord = `${x},${y}`;
          const isOffBoard = x < 0 || x > 7 || y < 0 || y > 7;
          const isOccupied = !isOffBoard && Boolean(state.occupancy[asCoordinateKey(targetCoord)]);
          const isPawnRankViolation = !isOffBoard && pieceType === 'PAWN' && (y === 0 || y === 7);

          const shouldReject = isOffBoard || isOccupied || isPawnRankViolation;

          const cmd = new MovePieceCommand(
            asEntityId('drop-test-fc'),
            asCoordinateKey(targetCoord),
            asCoordinateKey(targetCoord),
            'P1',
            undefined,
            true,
            true,
            undefined,
            topology,
            crazyVariant,
            true,
            pieceType
          );

          if (shouldReject) {
            expect(() => {
              produce(state, (draft) => {
                cmd.execute(draft);
              });
            }).toThrow();
            // State must be unmutated
            expect(JSON.stringify(state)).toBe(originalJson);
          }

          return true;
        }
      ),
      { numRuns: 80 }
    );
  });

  it('Invariant 8: fast-check Property — FIDE position hashing canonical determinism and sensitivity (RNF-05)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<'P1' | 'P2'>('P1', 'P2'),
        fc.constantFrom('e3', 'd6', null),
        (activePlayer, epTarget) => {
          const state1 = produce(ClassicBoardFactory.createStandardInitialState(), (draft) => {
            draft.activePlayer = activePlayer;
            draft.turnState.enPassantTarget = epTarget ? asCoordinateKey(epTarget) : null;
          });
          const state2 = produce(ClassicBoardFactory.createStandardInitialState(), (draft) => {
            draft.activePlayer = activePlayer;
            draft.turnState.enPassantTarget = epTarget ? asCoordinateKey(epTarget) : null;
          });

          const hash1 = computePositionKey(state1);
          const hash2 = computePositionKey(state2);

          // Determinism invariant
          expect(hash1).toBe(hash2);

          // Active player sensitivity
          const otherPlayer = activePlayer === 'P1' ? 'P2' : 'P1';
          const stateOtherPlayer = produce(state1, (draft) => {
            draft.activePlayer = otherPlayer;
          });
          const hashOther = computePositionKey(stateOtherPlayer);
          expect(hashOther).not.toBe(hash1);

          return true;
        }
      ),
      { numRuns: 30 }
    );
  });
});

