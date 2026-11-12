/**
 * ChessInReact - Universal Variant Piece Initializer (Spec 13 § 4, Spec 14 § 4, Spec 16 § 4)
 *
 * Spawns piece entities with appropriate positions and variants for:
 * - Standard 8x8 variants (FIDE, Duck, Spells, Atomic, Antichess, Three-Check, etc.)
 * - Expanded Capablanca Chess (10x8 with Chancellor & Archbishop)
 * - Massive Multiplayer Arenas (3 to 12 players across radial/cross topologies)
 */

import { asCoordinateKey, asEntityId, createSquareCoord, PlayerId, SquareCodec } from '../../core/coordinates';
import { IPieceEntity } from '../../core/entities/types';
import { createStandardChessPieces } from '../../core/bootstrap/GameInitializer';
import { CompositeArenaLayouts } from '../multiplayer/arenas/CompositeArenaLayouts';
import { ArenaModeId } from '../multiplayer/arenas/interfaces/IArenaContracts';

export class VariantPieceInitializer {
  /**
   * Creates initial piece array customized for the given variant and player count.
   */
  public static createPiecesForVariant(variantId: string): IPieceEntity[] {
    const v = variantId.toUpperCase();

    // 1. Massive Multiplayer Arena layouts (3 to 12 players)
    const arenaLayout = CompositeArenaLayouts.getLayout(v as ArenaModeId);
    if (arenaLayout) {
      return this.createArenaPieces(arenaLayout);
    }

    // 2. Capablanca Chess (10x8 board with Archbishop and Chancellor)
    if (v === 'CAPABLANCA_CHESS') {
      return this.createCapablancaPieces();
    }

    // 3. Racing Kings (Ranks 1 and 2 start with non-pawn pieces)
    if (v === 'RACING_KINGS') {
      return this.createRacingKingsPieces();
    }

    // 4. Standard 8x8 square board pieces (Classic, Duck, Spells, Atomic, Antichess, etc.)
    return createStandardChessPieces();
  }

  /**
   * Spawns pieces for multiplayer arenas from composite arena definitions.
   */
  private static createArenaPieces(layout: ReturnType<typeof CompositeArenaLayouts.getLayout> & object): IPieceEntity[] {
    const pieces: IPieceEntity[] = [];

    layout.factions.forEach((faction, fIdx) => {
      const ownerId = `P${fIdx + 1}` as PlayerId;

      faction.initialCoordinates.forEach((coord, cIdx) => {
        pieces.push({
          id: asEntityId(`${ownerId.toLowerCase()}-${coord.pieceVariantId.toLowerCase()}-${cIdx}`),
          type: 'PIECE',
          ownerId,
          variantId: coord.pieceVariantId,
          position: asCoordinateKey(coord.coordKey),
          hasMoved: false,
          isCaptured: false,
        });
      });
    });

    return pieces;
  }

  /**
   * Spawns pieces for 10x8 Capablanca Chess.
   */
  private static createCapablancaPieces(): IPieceEntity[] {
    const pieces: IPieceEntity[] = [];
    const backRank = [
      'ROOK',
      'KNIGHT',
      'ARCHBISHOP',
      'BISHOP',
      'QUEEN',
      'KING',
      'BISHOP',
      'CHANCELLOR',
      'KNIGHT',
      'ROOK',
    ];

    // White pieces (P1)
    for (let x = 0; x < 10; x++) {
      pieces.push({
        id: asEntityId(`w-${backRank[x].toLowerCase()}-${x}`),
        type: 'PIECE',
        ownerId: 'P1',
        variantId: backRank[x],
        position: SquareCodec.encode(createSquareCoord(x, 0)),
        hasMoved: false,
        isCaptured: false,
      });

      pieces.push({
        id: asEntityId(`w-pawn-${x}`),
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'PAWN',
        position: SquareCodec.encode(createSquareCoord(x, 1)),
        hasMoved: false,
        isCaptured: false,
      });
    }

    // Black pieces (P2)
    for (let x = 0; x < 10; x++) {
      pieces.push({
        id: asEntityId(`b-pawn-${x}`),
        type: 'PIECE',
        ownerId: 'P2',
        variantId: 'PAWN',
        position: SquareCodec.encode(createSquareCoord(x, 6)),
        hasMoved: false,
        isCaptured: false,
      });

      pieces.push({
        id: asEntityId(`b-${backRank[x].toLowerCase()}-${x}`),
        type: 'PIECE',
        ownerId: 'P2',
        variantId: backRank[x],
        position: SquareCodec.encode(createSquareCoord(x, 7)),
        hasMoved: false,
        isCaptured: false,
      });
    }

    return pieces;
  }

  /**
   * Spawns pieces for Racing Kings.
   */
  private static createRacingKingsPieces(): IPieceEntity[] {
    const pieces: IPieceEntity[] = [];

    // White rank 0: Q, R, B, N, K, B, N, R
    // White rank 1: P, P, P, P, P, P, P, P (or non-check setup)
    const whitePieces = ['QUEEN', 'ROOK', 'BISHOP', 'KNIGHT', 'KING', 'BISHOP', 'KNIGHT', 'ROOK'];
    for (let x = 0; x < 8; x++) {
      pieces.push({
        id: asEntityId(`w-${whitePieces[x].toLowerCase()}-${x}`),
        type: 'PIECE',
        ownerId: 'P1',
        variantId: whitePieces[x],
        position: SquareCodec.encode(createSquareCoord(x, 0)),
        hasMoved: false,
        isCaptured: false,
      });
    }

    // Black rank 1: Q, R, B, N, K, B, N, R
    const blackPieces = ['QUEEN', 'ROOK', 'BISHOP', 'KNIGHT', 'KING', 'BISHOP', 'KNIGHT', 'ROOK'];
    for (let x = 0; x < 8; x++) {
      pieces.push({
        id: asEntityId(`b-${blackPieces[x].toLowerCase()}-${x}`),
        type: 'PIECE',
        ownerId: 'P2',
        variantId: blackPieces[x],
        position: SquareCodec.encode(createSquareCoord(x, 1)),
        hasMoved: false,
        isCaptured: false,
      });
    }

    return pieces;
  }
}
