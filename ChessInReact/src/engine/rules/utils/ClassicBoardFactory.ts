import { CoordinateKey, EntityId, PlayerId, asEntityId } from '../../../core/coordinates';
import { IDomainState } from '../../../core/state/gameState';
import { IPieceEntity } from '../../../core/entities/types';
import { parseCoord, toCoordKey } from './CoordinateHelper';
import { computePositionKey } from './PositionHasher';

const FEN_PIECE_MAP: Record<string, { variantId: string; ownerId: PlayerId }> = {
  p: { variantId: 'PAWN', ownerId: 'P2' },
  r: { variantId: 'ROOK', ownerId: 'P2' },
  n: { variantId: 'KNIGHT', ownerId: 'P2' },
  b: { variantId: 'BISHOP', ownerId: 'P2' },
  q: { variantId: 'QUEEN', ownerId: 'P2' },
  k: { variantId: 'KING', ownerId: 'P2' },
  P: { variantId: 'PAWN', ownerId: 'P1' },
  R: { variantId: 'ROOK', ownerId: 'P1' },
  N: { variantId: 'KNIGHT', ownerId: 'P1' },
  B: { variantId: 'BISHOP', ownerId: 'P1' },
  Q: { variantId: 'QUEEN', ownerId: 'P1' },
  K: { variantId: 'KING', ownerId: 'P1' },
};

export class ClassicBoardFactory {
  /**
   * Creates the standard initial FIDE 8x8 starting state.
   */
  public static createStandardInitialState(): IDomainState {
    return this.createFromFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  }

  /**
   * Creates an IDomainState from a FEN string.
   */
  public static createFromFEN(fen: string): IDomainState {
    const parts = fen.trim().split(/\s+/);
    const placement = parts[0];
    const activeColor = parts[1] ?? 'w';
    const castling = parts[2] ?? '-';
    const epTarget = parts[3] ?? '-';
    const halfMoves = parts[4] ? parseInt(parts[4], 10) : 0;
    const fullMoves = parts[5] ? parseInt(parts[5], 10) : 1;

    const boardEntities: Record<EntityId, IPieceEntity> = {};
    const occupancy: Record<CoordinateKey, EntityId> = {};
    const ranks = placement.split('/');

    let entityCounter = 1;

    for (let r = 0; r < 8; r++) {
      const y = 7 - r;
      const rankStr = ranks[r] || '8';
      let x = 0;

      for (let c = 0; c < rankStr.length; c++) {
        const char = rankStr[c];
        if (char >= '1' && char <= '8') {
          x += parseInt(char, 10);
        } else {
          const pieceInfo = FEN_PIECE_MAP[char];
          if (pieceInfo) {
            const coord = toCoordKey(x, y);
            const id = asEntityId(`piece_${entityCounter++}_${pieceInfo.variantId}_${coord}`);

            // Determine if piece has moved based on castling string
            let hasMoved = false;
            if (pieceInfo.variantId === 'PAWN') {
              hasMoved = pieceInfo.ownerId === 'P1' ? y !== 1 : y !== 6;
            } else if (pieceInfo.variantId === 'KING') {
              if (pieceInfo.ownerId === 'P1') {
                hasMoved = !(castling.includes('K') || castling.includes('Q')) || coord !== '4,0';
              } else {
                hasMoved = !(castling.includes('k') || castling.includes('q')) || coord !== '4,7';
              }
            } else if (pieceInfo.variantId === 'ROOK') {
              if (pieceInfo.ownerId === 'P1') {
                if (coord === '7,0' && castling.includes('K')) hasMoved = false;
                if (coord === '0,0' && castling.includes('Q')) hasMoved = false;
              } else {
                if (coord === '7,7' && castling.includes('k')) hasMoved = false;
                if (coord === '0,7' && castling.includes('q')) hasMoved = false;
              }
            }

            const entity: IPieceEntity = {
              id,
              type: 'PIECE',
              position: coord,
              ownerId: pieceInfo.ownerId,
              variantId: pieceInfo.variantId,
              hasMoved,
              isCaptured: false,
            };

            boardEntities[id] = entity;
            occupancy[coord] = id;
          }
          x++;
        }
      }
    }

    const parsedEp = epTarget !== '-' ? parseCoord(epTarget) : null;
    const enPassantTarget = parsedEp ? toCoordKey(parsedEp.x, parsedEp.y) : null;

    const capturedInventory: Record<PlayerId, string[]> = {
      P1: [],
      P2: [],
      P3: [],
      P4: [],
      P5: [],
      P6: [],
      P7: [],
      P8: [],
      NONE: [],
    };

    const state: IDomainState = {
      matchId: `match-${Date.now()}`,
      variantId: 'CHESS_STANDARD',
      isGameOver: false,
      winnerId: null,
      activePlayer: activeColor === 'b' ? 'P2' : 'P1',
      turnNumber: fullMoves,
      revision: 1,
      boardEntities,
      occupancy,
      capturedInventory,
      turnState: {
        phase: 'COMMIT',
        lastActionTimestamp: Date.now(),
        enPassantTarget,
        fiftyMoveCounter: halfMoves,
        positionHistory: [],
      },
    };

    // Seed initial position key into history for FIDE repetition tracking (RF-11)
    const initialKey = computePositionKey(state);
    (state.turnState as { positionHistory?: readonly string[] }).positionHistory = [initialKey];

    return state;
  }
}
