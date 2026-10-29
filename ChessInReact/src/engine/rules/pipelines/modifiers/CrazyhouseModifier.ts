import { CoordinateKey, PlayerId, asEntityId } from '../../../../core/coordinates';
import { ITopology } from '../../../../core/topology/types';
import { IDomainState } from '../../../../core/state/gameState';
import { IPieceEntity } from '../../../../core/entities/types';
import { ILegalMove } from '../../interfaces/IRulesContracts';
import { CheckValidator } from '../../CheckValidator';

export class CrazyhouseModifier {
  /**
   * Adds a captured piece to the captor's pocket inventory (RF-09).
   */
  public static addCapturedPieceToInventory(
    state: IDomainState,
    capturedPiece: IPieceEntity,
    captorPlayerId: PlayerId
  ): IDomainState {
    const rawVariant = capturedPiece.variantId.toUpperCase();
    // Promoted pieces revert to Pawn in pocket
    const pocketVariant = rawVariant;

    const currentInventory = state.capturedInventory[captorPlayerId] ?? [];
    const updatedInventory = [...currentInventory, pocketVariant];

    return {
      ...state,
      capturedInventory: {
        ...state.capturedInventory,
        [captorPlayerId]: updatedInventory,
      },
    };
  }

  /**
   * Generates all legal drop moves for a given pocket piece variant (RF-09).
   */
  public static getLegalDropMoves(
    state: IDomainState,
    topology: ITopology,
    playerId: PlayerId,
    pieceVariant: string
  ): ILegalMove[] {
    const legalDrops: ILegalMove[] = [];
    const vUpper = pieceVariant.toUpperCase();
    const isPawn = vUpper === 'PAWN' || vUpper === 'P';

    // Verify player actually has this piece in pocket
    const pocket = state.capturedInventory[playerId] ?? [];
    if (!pocket.includes(vUpper) && !pocket.includes(pieceVariant)) {
      return [];
    }

    const king = CheckValidator.findRoyalPiece(playerId, state);
    const opponentId: PlayerId = playerId === 'P1' ? 'P2' : 'P1';

    // Iterate through all 64 squares in square topology or valid topology coordinates
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 8; y++) {
        // Pawns cannot be dropped on rank 1 (y=0) or rank 8 (y=7)
        if (isPawn && (y === 0 || y === 7)) {
          continue;
        }

        const coord = `${x},${y}` as CoordinateKey;
        if (!topology.isValidCoordinate(coord)) continue;

        // Destination square must be completely empty
        if (state.occupancy[coord]) continue;

        // Verify drop does not leave friendly king in check using immutable overlay (RNF-14)
        const virtualPieceId = asEntityId(`drop_${playerId}_${pieceVariant}_${coord}`);
        const virtualPiece: IPieceEntity = {
          id: virtualPieceId,
          type: 'PIECE',
          position: coord,
          ownerId: playerId,
          variantId: vUpper,
          hasMoved: true,
          isCaptured: false,
        };

        const overlayState: IDomainState = {
          ...state,
          occupancy: {
            ...state.occupancy,
            [coord]: virtualPieceId,
          },
          boardEntities: {
            ...state.boardEntities,
            [virtualPieceId]: virtualPiece,
          },
        };

        const kingCoord = king?.position;
        const leavesInCheck = kingCoord
          ? CheckValidator.isSquareAttacked(kingCoord, opponentId, overlayState, topology)
          : false;

        if (!leavesInCheck) {
          legalDrops.push({
            pieceId: virtualPieceId,
            from: '' as CoordinateKey,
            to: coord,
            isCapture: false,
            isDrop: true,
          });
        }
      }
    }

    return legalDrops;
  }
}
