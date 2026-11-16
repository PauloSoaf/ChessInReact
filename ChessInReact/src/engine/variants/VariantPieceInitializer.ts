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
   * Normalizes radial coordinates onto the [0, 15] x [0, 15] board when any
   * raw coordinate lies outside non-negative board bounds.
   */
  private static createArenaPieces(layout: ReturnType<typeof CompositeArenaLayouts.getLayout> & object): IPieceEntity[] {
    const pieces: IPieceEntity[] = [];
    const boardLimit = layout.boardType === 'SQUARE_CROSS' ? 14 : 16;

    const hasOutOfBounds = layout.factions.some((f) =>
      f.initialCoordinates.some((c) => {
        const [x, y] = c.coordKey.split(',').map(Number);
        return x < 0 || y < 0 || x >= boardLimit || y >= boardLimit;
      })
    );

    const usedCoords = new Set<string>();

    layout.factions.forEach((faction, fIdx) => {
      const ownerId = `P${fIdx + 1}` as PlayerId;
      const total = layout.factions.length;
      const angle = (2 * Math.PI * fIdx) / total;
      const center = Math.floor((boardLimit - 1) / 2);
      const radius = Math.max(3, center - 1);
      const baseX = Math.max(1, Math.min(boardLimit - 2, Math.round(center + Math.cos(angle) * radius)));
      const baseY = Math.max(1, Math.min(boardLimit - 2, Math.round(center + Math.sin(angle) * radius)));
      const offsets: ReadonlyArray<readonly [number, number]> = [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, baseY >= center ? -1 : 1],
        [0, baseY >= center ? 1 : -1],
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ];

      faction.initialCoordinates.forEach((coord, cIdx) => {
        let finalCoord = coord.coordKey;
        if (hasOutOfBounds || usedCoords.has(finalCoord)) {
          for (const [dx, dy] of offsets) {
            const cx = Math.max(0, Math.min(boardLimit - 1, baseX + dx));
            const cy = Math.max(0, Math.min(boardLimit - 1, baseY + dy));
            const candidate = `${cx},${cy}`;
            if (!usedCoords.has(candidate)) {
              finalCoord = candidate;
              break;
            }
          }
        }
        usedCoords.add(finalCoord);

        pieces.push({
          id: asEntityId(`${ownerId.toLowerCase()}-${coord.pieceVariantId.toLowerCase()}-${cIdx}`),
          type: 'PIECE',
          ownerId,
          variantId: coord.pieceVariantId,
          position: asCoordinateKey(finalCoord),
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
   * Spawns pieces for Racing Kings (canonical starting FEN: 8/8/8/8/8/8/krbnNBRK/qrbnNBRQ).
   */
  private static createRacingKingsPieces(): IPieceEntity[] {
    const pieces: IPieceEntity[] = [];

    // Rank 0 (y = 0): Black q(0,0), r(1,0), b(2,0), n(3,0) | White N(4,0), B(5,0), R(6,0), Q(7,0)
    const rank0: ReadonlyArray<{ owner: PlayerId; variant: string }> = [
      { owner: 'P2', variant: 'QUEEN' },
      { owner: 'P2', variant: 'ROOK' },
      { owner: 'P2', variant: 'BISHOP' },
      { owner: 'P2', variant: 'KNIGHT' },
      { owner: 'P1', variant: 'KNIGHT' },
      { owner: 'P1', variant: 'BISHOP' },
      { owner: 'P1', variant: 'ROOK' },
      { owner: 'P1', variant: 'QUEEN' },
    ];

    // Rank 1 (y = 1): Black k(0,1), r(1,1), b(2,1), n(3,1) | White N(4,1), B(5,1), R(6,1), K(7,1)
    const rank1: ReadonlyArray<{ owner: PlayerId; variant: string }> = [
      { owner: 'P2', variant: 'KING' },
      { owner: 'P2', variant: 'ROOK' },
      { owner: 'P2', variant: 'BISHOP' },
      { owner: 'P2', variant: 'KNIGHT' },
      { owner: 'P1', variant: 'KNIGHT' },
      { owner: 'P1', variant: 'BISHOP' },
      { owner: 'P1', variant: 'ROOK' },
      { owner: 'P1', variant: 'KING' },
    ];

    for (let x = 0; x < 8; x++) {
      const r0 = rank0[x];
      pieces.push({
        id: asEntityId(`${r0.owner === 'P1' ? 'w' : 'b'}-${r0.variant.toLowerCase()}-r0-${x}`),
        type: 'PIECE',
        ownerId: r0.owner,
        variantId: r0.variant,
        position: SquareCodec.encode(createSquareCoord(x, 0)),
        hasMoved: false,
        isCaptured: false,
      });

      const r1 = rank1[x];
      pieces.push({
        id: asEntityId(`${r1.owner === 'P1' ? 'w' : 'b'}-${r1.variant.toLowerCase()}-r1-${x}`),
        type: 'PIECE',
        ownerId: r1.owner,
        variantId: r1.variant,
        position: SquareCodec.encode(createSquareCoord(x, 1)),
        hasMoved: false,
        isCaptured: false,
      });
    }

    return pieces;
  }
}
