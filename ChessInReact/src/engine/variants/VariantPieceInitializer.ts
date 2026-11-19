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
import { VariantMapConfig } from './VariantMapConfig';

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

    // 4. Horde Chess (36 White pawns vs standard Black army)
    if (v === 'HORDE' || v === 'HORDE_CHESS') {
      return this.createHordePieces();
    }

    // 5. Chess960 / Fischer Random
    if (v === 'CHESS960' || v === 'FISCHER_RANDOM') {
      return this.createChess960Pieces();
    }

    // 6. 3D Cubic Chessboard (Pieces mapped across faces)
    if (v === 'CUBIC_CHESS' || v.includes('CUBIC')) {
      return this.createCubicPieces();
    }

    // 7. Shogi (9x9 Japanese Chess)
    if (v === 'SHOGI') {
      return this.createShogiPieces();
    }

    // 8. Xiangqi (9x10 Chinese Chess)
    if (v === 'XIANGQI') {
      return this.createXiangqiPieces();
    }

    // 9. Standard 8x8 square board pieces (Classic, Duck, Spells, Atomic, Antichess, etc.)
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
        const [rawX, rawY] = finalCoord.split(',').map(Number);
        const isCurrentVoid = VariantMapConfig.isVoidSquare(layout.id, rawX, rawY, boardLimit);
        if (hasOutOfBounds || isCurrentVoid || usedCoords.has(finalCoord)) {
          for (const [dx, dy] of offsets) {
            const cx = Math.max(0, Math.min(boardLimit - 1, baseX + dx));
            const cy = Math.max(0, Math.min(boardLimit - 1, baseY + dy));
            const candidate = `${cx},${cy}`;
            if (
              !usedCoords.has(candidate) &&
              !VariantMapConfig.isVoidSquare(layout.id, cx, cy, boardLimit)
            ) {
              finalCoord = candidate;
              break;
            }
          }
          // Secondary spiral search if all immediate offsets were void or occupied
          if (
            usedCoords.has(finalCoord) ||
            VariantMapConfig.isVoidSquare(
              layout.id,
              Number(finalCoord.split(',')[0]),
              Number(finalCoord.split(',')[1]),
              boardLimit
            )
          ) {
            outer: for (let r = 1; r < boardLimit; r++) {
              for (let sx = -r; sx <= r; sx++) {
                for (let sy = -r; sy <= r; sy++) {
                  const cx = Math.max(0, Math.min(boardLimit - 1, baseX + sx));
                  const cy = Math.max(0, Math.min(boardLimit - 1, baseY + sy));
                  const candidate = `${cx},${cy}`;
                  if (
                    !usedCoords.has(candidate) &&
                    !VariantMapConfig.isVoidSquare(layout.id, cx, cy, boardLimit)
                  ) {
                    finalCoord = candidate;
                    break outer;
                  }
                }
              }
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

  /**
   * Spawns pieces for Horde Chess (36 White pawns vs 16 Black classical pieces).
   */
  private static createHordePieces(): IPieceEntity[] {
    const pieces: IPieceEntity[] = [];

    // White: 36 pawns across ranks 1-4 (y=0..3, all files) and rank 5 (y=4, files b,c,f,g)
    let pIdx = 0;
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 8; x++) {
        pieces.push({
          id: asEntityId(`w-pawn-horde-${pIdx++}`),
          type: 'PIECE',
          ownerId: 'P1',
          variantId: 'PAWN',
          position: SquareCodec.encode(createSquareCoord(x, y)),
          hasMoved: false,
          isCaptured: false,
        });
      }
    }
    for (const x of [1, 2, 5, 6]) {
      pieces.push({
        id: asEntityId(`w-pawn-horde-${pIdx++}`),
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'PAWN',
        position: SquareCodec.encode(createSquareCoord(x, 4)),
        hasMoved: false,
        isCaptured: false,
      });
    }

    // Black: standard 16 classical pieces on ranks 7 and 8
    for (let x = 0; x < 8; x++) {
      pieces.push({
        id: asEntityId(`b-pawn-${x}`),
        type: 'PIECE',
        ownerId: 'P2',
        variantId: 'PAWN',
        position: SquareCodec.encode(createSquareCoord(x, 6)),
        hasMoved: false,
        isCaptured: false,
      });
    }
    const backRank = ['ROOK', 'KNIGHT', 'BISHOP', 'QUEEN', 'KING', 'BISHOP', 'KNIGHT', 'ROOK'];
    for (let x = 0; x < 8; x++) {
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
   * Spawns pieces for Chess960 (Fischer Random).
   */
  private static createChess960Pieces(): IPieceEntity[] {
    const pieces: IPieceEntity[] = [];
    const backRank: (string | null)[] = Array(8).fill(null);

    // 1. Dark bishop (odd index: 1, 3, 5, 7)
    const darkFiles = [1, 3, 5, 7];
    const b1 = darkFiles[Math.floor(Math.random() * darkFiles.length)];
    backRank[b1] = 'BISHOP';

    // 2. Light bishop (even index: 0, 2, 4, 6)
    const lightFiles = [0, 2, 4, 6];
    const b2 = lightFiles[Math.floor(Math.random() * lightFiles.length)];
    backRank[b2] = 'BISHOP';

    // 3. Queen in one of the 6 remaining slots
    const empty1: number[] = [];
    for (let i = 0; i < 8; i++) if (!backRank[i]) empty1.push(i);
    const qPos = empty1[Math.floor(Math.random() * empty1.length)];
    backRank[qPos] = 'QUEEN';

    // 4. Two Knights in the 5 remaining slots
    const empty2: number[] = [];
    for (let i = 0; i < 8; i++) if (!backRank[i]) empty2.push(i);
    const n1 = empty2.splice(Math.floor(Math.random() * empty2.length), 1)[0];
    const n2 = empty2.splice(Math.floor(Math.random() * empty2.length), 1)[0];
    backRank[n1] = 'KNIGHT';
    backRank[n2] = 'KNIGHT';

    // 5. Remaining 3 slots: Rook, King, Rook (King between the two Rooks)
    backRank[empty2[0]] = 'ROOK';
    backRank[empty2[1]] = 'KING';
    backRank[empty2[2]] = 'ROOK';

    // Pawns
    for (let x = 0; x < 8; x++) {
      pieces.push({
        id: asEntityId(`w-pawn-${x}`),
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'PAWN',
        position: SquareCodec.encode(createSquareCoord(x, 1)),
        hasMoved: false,
        isCaptured: false,
      });
      pieces.push({
        id: asEntityId(`b-pawn-${x}`),
        type: 'PIECE',
        ownerId: 'P2',
        variantId: 'PAWN',
        position: SquareCodec.encode(createSquareCoord(x, 6)),
        hasMoved: false,
        isCaptured: false,
      });
    }

    // Back ranks
    for (let x = 0; x < 8; x++) {
      const v = backRank[x]!;
      pieces.push({
        id: asEntityId(`w-${v.toLowerCase()}-${x}`),
        type: 'PIECE',
        ownerId: 'P1',
        variantId: v,
        position: SquareCodec.encode(createSquareCoord(x, 0)),
        hasMoved: false,
        isCaptured: false,
      });
      pieces.push({
        id: asEntityId(`b-${v.toLowerCase()}-${x}`),
        type: 'PIECE',
        ownerId: 'P2',
        variantId: v,
        position: SquareCodec.encode(createSquareCoord(x, 7)),
        hasMoved: false,
        isCaptured: false,
      });
    }

    return pieces;
  }

  /**
   * Spawns pieces for 3D Cubic Chess across the Front (Face 2) and Back (Face 3) surfaces.
   */
  private static createCubicPieces(): IPieceEntity[] {
    const pieces: IPieceEntity[] = [];
    const backRank = ['ROOK', 'KNIGHT', 'BISHOP', 'QUEEN', 'KING', 'BISHOP', 'KNIGHT', 'ROOK'];

    // White pieces on Face 2 (FRONT)
    for (let x = 0; x < 8; x++) {
      pieces.push({
        id: asEntityId(`w-cube-${backRank[x].toLowerCase()}-${x}`),
        type: 'PIECE',
        ownerId: 'P1',
        variantId: backRank[x],
        position: asCoordinateKey(`2:${x},0`),
        hasMoved: false,
        isCaptured: false,
      });
      pieces.push({
        id: asEntityId(`w-cube-pawn-${x}`),
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'PAWN',
        position: asCoordinateKey(`2:${x},1`),
        hasMoved: false,
        isCaptured: false,
      });
    }

    // Black pieces on Face 3 (BACK)
    for (let x = 0; x < 8; x++) {
      pieces.push({
        id: asEntityId(`b-cube-${backRank[x].toLowerCase()}-${x}`),
        type: 'PIECE',
        ownerId: 'P2',
        variantId: backRank[x],
        position: asCoordinateKey(`3:${x},7`),
        hasMoved: false,
        isCaptured: false,
      });
      pieces.push({
        id: asEntityId(`b-cube-pawn-${x}`),
        type: 'PIECE',
        ownerId: 'P2',
        variantId: 'PAWN',
        position: asCoordinateKey(`3:${x},6`),
        hasMoved: false,
        isCaptured: false,
      });
    }

    return pieces;
  }

  /**
   * Spawns canonical 40 pieces for Shogi on a 9x9 board.
   */
  private static createShogiPieces(): IPieceEntity[] {
    const pieces: IPieceEntity[] = [];
    const backRank = ['LANCE', 'KNIGHT', 'SILVER', 'GOLD', 'KING', 'GOLD', 'SILVER', 'KNIGHT', 'LANCE'];

    // White (Sente / P1)
    for (let x = 0; x < 9; x++) {
      pieces.push({
        id: asEntityId(`w-shogi-${backRank[x].toLowerCase()}-${x}`),
        type: 'PIECE',
        ownerId: 'P1',
        variantId: backRank[x],
        position: SquareCodec.encode(createSquareCoord(x, 0)),
        hasMoved: false,
        isCaptured: false,
      });
      pieces.push({
        id: asEntityId(`w-shogi-pawn-${x}`),
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'PAWN',
        position: SquareCodec.encode(createSquareCoord(x, 2)),
        hasMoved: false,
        isCaptured: false,
      });
    }
    // White Bishop & Rook (Rank 1)
    pieces.push({
      id: asEntityId('w-shogi-bishop-1'),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'BISHOP',
      position: SquareCodec.encode(createSquareCoord(1, 1)),
      hasMoved: false,
      isCaptured: false,
    });
    pieces.push({
      id: asEntityId('w-shogi-rook-7'),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'ROOK',
      position: SquareCodec.encode(createSquareCoord(7, 1)),
      hasMoved: false,
      isCaptured: false,
    });

    // Black (Gote / P2)
    for (let x = 0; x < 9; x++) {
      pieces.push({
        id: asEntityId(`b-shogi-${backRank[x].toLowerCase()}-${x}`),
        type: 'PIECE',
        ownerId: 'P2',
        variantId: backRank[x],
        position: SquareCodec.encode(createSquareCoord(x, 8)),
        hasMoved: false,
        isCaptured: false,
      });
      pieces.push({
        id: asEntityId(`b-shogi-pawn-${x}`),
        type: 'PIECE',
        ownerId: 'P2',
        variantId: 'PAWN',
        position: SquareCodec.encode(createSquareCoord(x, 6)),
        hasMoved: false,
        isCaptured: false,
      });
    }
    // Black Rook & Bishop (Rank 7)
    pieces.push({
      id: asEntityId('b-shogi-rook-1'),
      type: 'PIECE',
      ownerId: 'P2',
      variantId: 'ROOK',
      position: SquareCodec.encode(createSquareCoord(1, 7)),
      hasMoved: false,
      isCaptured: false,
    });
    pieces.push({
      id: asEntityId('b-shogi-bishop-7'),
      type: 'PIECE',
      ownerId: 'P2',
      variantId: 'BISHOP',
      position: SquareCodec.encode(createSquareCoord(7, 7)),
      hasMoved: false,
      isCaptured: false,
    });

    return pieces;
  }

  /**
   * Spawns canonical 32 pieces for Xiangqi (Chinese Chess) on a 9x10 board.
   */
  private static createXiangqiPieces(): IPieceEntity[] {
    const pieces: IPieceEntity[] = [];
    const backRank = ['CHARIOT', 'HORSE', 'ELEPHANT', 'ADVISOR', 'KING', 'ADVISOR', 'ELEPHANT', 'HORSE', 'CHARIOT'];

    // Red (P1)
    for (let x = 0; x < 9; x++) {
      pieces.push({
        id: asEntityId(`w-xiangqi-${backRank[x].toLowerCase()}-${x}`),
        type: 'PIECE',
        ownerId: 'P1',
        variantId: backRank[x],
        position: SquareCodec.encode(createSquareCoord(x, 0)),
        hasMoved: false,
        isCaptured: false,
      });
    }
    // Red Cannons (Rank 2)
    pieces.push({
      id: asEntityId('w-xiangqi-cannon-1'),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'CANNON',
      position: SquareCodec.encode(createSquareCoord(1, 2)),
      hasMoved: false,
      isCaptured: false,
    });
    pieces.push({
      id: asEntityId('w-xiangqi-cannon-7'),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'CANNON',
      position: SquareCodec.encode(createSquareCoord(7, 2)),
      hasMoved: false,
      isCaptured: false,
    });
    // Red Soldiers (Rank 3)
    for (const x of [0, 2, 4, 6, 8]) {
      pieces.push({
        id: asEntityId(`w-xiangqi-soldier-${x}`),
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'SOLDIER',
        position: SquareCodec.encode(createSquareCoord(x, 3)),
        hasMoved: false,
        isCaptured: false,
      });
    }

    // Black (P2)
    for (let x = 0; x < 9; x++) {
      pieces.push({
        id: asEntityId(`b-xiangqi-${backRank[x].toLowerCase()}-${x}`),
        type: 'PIECE',
        ownerId: 'P2',
        variantId: backRank[x],
        position: SquareCodec.encode(createSquareCoord(x, 9)),
        hasMoved: false,
        isCaptured: false,
      });
    }
    // Black Cannons (Rank 7)
    pieces.push({
      id: asEntityId('b-xiangqi-cannon-1'),
      type: 'PIECE',
      ownerId: 'P2',
      variantId: 'CANNON',
      position: SquareCodec.encode(createSquareCoord(1, 7)),
      hasMoved: false,
      isCaptured: false,
    });
    pieces.push({
      id: asEntityId('b-xiangqi-cannon-7'),
      type: 'PIECE',
      ownerId: 'P2',
      variantId: 'CANNON',
      position: SquareCodec.encode(createSquareCoord(7, 7)),
      hasMoved: false,
      isCaptured: false,
    });
    // Black Soldiers (Rank 6)
    for (const x of [0, 2, 4, 6, 8]) {
      pieces.push({
        id: asEntityId(`b-xiangqi-soldier-${x}`),
        type: 'PIECE',
        ownerId: 'P2',
        variantId: 'SOLDIER',
        position: SquareCodec.encode(createSquareCoord(x, 6)),
        hasMoved: false,
        isCaptured: false,
      });
    }

    return pieces;
  }
}
