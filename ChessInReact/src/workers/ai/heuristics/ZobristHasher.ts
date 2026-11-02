import { CoordinateKey, PlayerId } from '../../../core/coordinates/types';
import { IDomainState } from '../../../core/state/gameState';
import { IPieceEntity } from '../../../core/entities/types';

/**
 * Deterministic 64-bit SplitMix64 PRNG generator for repeatable Zobrist keys.
 */
export class DeterministicPRNG64 {
  private state: bigint;

  constructor(seed = 0x853c49e6748fea9bn) {
    this.state = seed;
  }

  public nextBigInt(): bigint {
    this.state = (this.state + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn;
    return (z ^ (z >> 31n)) & 0xffffffffffffffffn;
  }
}

/**
 * Zobrist Hashing implementation (Spec 05 § 4 Fonte 4, § 9, § 14.1 Fonte 5).
 * Uses 64-bit BigInt keys and bitwise XOR operations for constant-time O(1) hash manipulation.
 */
export class ZobristHasher {
  private static pieceKeys = new Map<string, bigint>();
  private static playerKeys = new Map<PlayerId, bigint>();
  private static castlingKeys = new Map<string, bigint>();
  private static enPassantKeys = new Map<CoordinateKey, bigint>();

  /**
   * Deterministic, order-independent 64-bit FNV-1a + SplitMix64 hash for any token.
   * Guarantees 100% identical 64-bit keys across threads, machines, and discovery orders.
   */
  public static hashStringTo64(str: string): bigint {
    let hash = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n;
    for (let i = 0; i < str.length; i++) {
      hash ^= BigInt(str.charCodeAt(i));
      hash = (hash * prime) & 0xffffffffffffffffn;
    }
    // SplitMix64 avalanche mixing
    let z = hash;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn;
    return (z ^ (z >> 31n)) & 0xffffffffffffffffn;
  }

  static {
    // Pre-initialize player keys with deterministic order-independent hashes
    const players: PlayerId[] = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];
    for (const player of players) {
      this.playerKeys.set(player, this.hashStringTo64(`PLAYER:${player}`));
    }

    // Castling rights combinations with deterministic hashes
    const castlingTokens = ['K', 'Q', 'k', 'q', 'KQ', 'kq', 'Kq', 'kQ', 'KQk', 'KQq', 'Kkq', 'Qkq', 'KQkq'];
    for (const token of castlingTokens) {
      this.castlingKeys.set(token, this.hashStringTo64(`CASTLE:${token}`));
    }
  }

  public static clearCache(): void {
    this.pieceKeys.clear();
    this.enPassantKeys.clear();
  }

  public static getPieceKey(coord: CoordinateKey, variantId: string, ownerId: PlayerId): bigint {
    const key = `${coord}:${variantId.toUpperCase()}:${ownerId}`;
    let val = this.pieceKeys.get(key);
    if (val === undefined) {
      val = this.hashStringTo64(`PIECE:${key}`);
      this.pieceKeys.set(key, val);
    }
    return val;
  }

  public static getEnPassantKey(coord: CoordinateKey): bigint {
    let val = this.enPassantKeys.get(coord);
    if (val === undefined) {
      val = this.hashStringTo64(`EP:${coord}`);
      this.enPassantKeys.set(coord, val);
    }
    return val;
  }

  /**
   * Computes the complete 64-bit Zobrist hash for a given game state.
   */
  public static hash(state: IDomainState): bigint {
    let h = 0n;

    // 1. Pieces on board
    for (const coord in state.occupancy) {
      const coordKey = coord as CoordinateKey;
      const entityId = state.occupancy[coordKey];
      if (!entityId) continue;
      const entity = state.boardEntities[entityId] as IPieceEntity | undefined;
      if (entity && entity.type === 'PIECE' && !entity.isCaptured) {
        h ^= this.getPieceKey(coordKey, entity.variantId, entity.ownerId);
      }
    }

    // 2. Active player
    if (state.activePlayer) {
      const pKey = this.playerKeys.get(state.activePlayer);
      if (pKey !== undefined) {
        h ^= pKey;
      }
    }

    // 3. En Passant target
    if (state.turnState?.enPassantTarget) {
      h ^= this.getEnPassantKey(state.turnState.enPassantTarget);
    }

    // 4. Castling rights signature
    let castlingSig = '';
    const whiteKing = Object.values(state.boardEntities).find(
      (e) => e.type === 'PIECE' && !e.isCaptured && e.ownerId === 'P1' && e.variantId.toUpperCase() === 'KING'
    ) as IPieceEntity | undefined;
    const blackKing = Object.values(state.boardEntities).find(
      (e) => e.type === 'PIECE' && !e.isCaptured && e.ownerId === 'P2' && e.variantId.toUpperCase() === 'KING'
    ) as IPieceEntity | undefined;

    if (whiteKing && !whiteKing.hasMoved) {
      castlingSig += 'K';
    }
    if (blackKing && !blackKing.hasMoved) {
      castlingSig += 'k';
    }
    if (castlingSig) {
      const cKey = this.castlingKeys.get(castlingSig);
      if (cKey !== undefined) {
        h ^= cKey;
      }
    }

    return h;
  }

  /**
   * Applies an incremental XOR update for moving a piece from one coordinate to another.
   */
  public static updateMove(
    currentHash: bigint,
    from: CoordinateKey,
    to: CoordinateKey,
    variantId: string,
    ownerId: PlayerId,
    capturedPiece?: { variantId: string; ownerId: PlayerId }
  ): bigint {
    let h = currentHash;
    // Remove piece from origin
    h ^= this.getPieceKey(from, variantId, ownerId);
    // Add piece at destination
    h ^= this.getPieceKey(to, variantId, ownerId);
    // If captured, remove captured piece from destination
    if (capturedPiece) {
      h ^= this.getPieceKey(to, capturedPiece.variantId, capturedPiece.ownerId);
    }
    return h;
  }

  /**
   * Inverts active player hash component.
   */
  public static togglePlayer(currentHash: bigint, prevPlayer: PlayerId, nextPlayer: PlayerId): bigint {
    let h = currentHash;
    const prevKey = this.playerKeys.get(prevPlayer);
    const nextKey = this.playerKeys.get(nextPlayer);
    if (prevKey !== undefined) h ^= prevKey;
    if (nextKey !== undefined) h ^= nextKey;
    return h;
  }
}
