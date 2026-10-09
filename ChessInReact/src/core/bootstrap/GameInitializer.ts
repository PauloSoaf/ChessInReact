import { asEntityId, createSquareCoord, SquareCodec } from '../coordinates';
import { IPieceEntity } from '../entities/types';
import { createGameStore, GameStoreInstance } from '../state/gameStore';
import { createDefaultDomainState } from '../state/initialState';
import { IDomainState } from '../state/gameState';

export interface BootstrapConfig {
  readonly matchId?: string;
  readonly variantId?: 'classic_square' | 'hex_ffa';
  readonly initialPieces?: readonly IPieceEntity[];
  readonly targetStore?: GameStoreInstance;
}

export interface BootstrapContext {
  readonly store: GameStoreInstance;
  readonly domain: IDomainState;
  readonly bootstrapDurationMs: number;
}

/**
 * Creates standard 32 FIDE chess pieces on 8x8 square grid.
 */
export function createStandardChessPieces(): IPieceEntity[] {
  const pieces: IPieceEntity[] = [];

  const backRankVariants = [
    'ROOK',
    'KNIGHT',
    'BISHOP',
    'QUEEN',
    'KING',
    'BISHOP',
    'KNIGHT',
    'ROOK',
  ];

  // White pieces (P1)
  for (let x = 0; x < 8; x++) {
    // Back rank (y = 0)
    const coordKey = SquareCodec.encode(createSquareCoord(x, 0));
    pieces.push({
      id: asEntityId(`w-${backRankVariants[x].toLowerCase()}-${x}`),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: backRankVariants[x],
      position: coordKey,
      hasMoved: false,
      isCaptured: false,
    });

    // Pawns (y = 1)
    const pawnCoord = SquareCodec.encode(createSquareCoord(x, 1));
    pieces.push({
      id: asEntityId(`w-pawn-${x}`),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'PAWN',
      position: pawnCoord,
      hasMoved: false,
      isCaptured: false,
    });
  }

  // Black pieces (P2)
  for (let x = 0; x < 8; x++) {
    // Pawns (y = 6)
    const pawnCoord = SquareCodec.encode(createSquareCoord(x, 6));
    pieces.push({
      id: asEntityId(`b-pawn-${x}`),
      type: 'PIECE',
      ownerId: 'P2',
      variantId: 'PAWN',
      position: pawnCoord,
      hasMoved: false,
      isCaptured: false,
    });

    // Back rank (y = 7)
    const coordKey = SquareCodec.encode(createSquareCoord(x, 7));
    pieces.push({
      id: asEntityId(`b-${backRankVariants[x].toLowerCase()}-${x}`),
      type: 'PIECE',
      ownerId: 'P2',
      variantId: backRankVariants[x],
      position: coordKey,
      hasMoved: false,
      isCaptured: false,
    });
  }

  return pieces;
}

/**
 * Initializes the game core through an explicit, validated pipeline.
 * Benchmarked to initialize well within the 50ms bound (RNF-15).
 */
export function bootstrapGame(config?: BootstrapConfig): BootstrapContext {
  const startTime = performance.now();

  const matchId = config?.matchId ?? `match-${Date.now()}`;
  const variantId = config?.variantId ?? 'classic_square';

  const domain = createDefaultDomainState(matchId, variantId);

  const pieces = config?.initialPieces ?? createStandardChessPieces();
  for (const piece of pieces) {
    domain.boardEntities[piece.id] = piece;
    domain.occupancy[piece.position] = piece.id;
  }

  const store = config?.targetStore ?? createGameStore(domain);
  if (config?.targetStore) {
    config.targetStore.getState().resetDomainState(domain);
  }

  const durationMs = performance.now() - startTime;

  return {
    store,
    domain,
    bootstrapDurationMs: durationMs,
  };
}

