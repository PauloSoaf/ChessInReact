/**
 * ChessInReact - Prisma Client Interface & Database Contracts (Spec 09 § 6, § 19, RF-01, RF-06, RF-12)
 *
 * Provides strict TypeScript contracts mirroring prisma/schema.prisma
 * for database operations, write-behind repositories, and testing adapters.
 */

export interface IDBUser {
  id: string;
  username: string;
  email?: string | null;
  avatarUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
  ratingsMap: Record<string, { rating: number; rd: number; vol: number }>;
}

export interface IDBPlayerRating {
  id: string;
  userId: string;
  variantId: string;
  ratingValue: number;
  ratingDeviation: number;
  volatility: number;
  updatedAt: Date;
}

export interface IDBMatchMetadata {
  variantId: string;
  topology: string;
  seed: string;
  timeControl: string;
  totalTurns: number;
  [key: string]: unknown;
}

export interface IDBMatchHistory {
  id: string;
  endedAt: Date;
  variantId: string;
  engineVersion: string;
  isRanked: boolean;
  metadata: IDBMatchMetadata;
  playerIds: string[];
  playerResults: ('WIN' | 'LOSS' | 'DRAW')[];
  moveStream: string[];
  compressedPayload?: Uint8Array | null;
}

export interface IDBCustomVariant {
  id: string;
  authorId: string;
  name: string;
  betzaRules: string;
  visualMeshUrl?: string | null;
  isPublic: boolean;
  createdAt: Date;
  deletedAt?: Date | null;
}

export interface IPrismaDatabaseClient {
  user: {
    findUnique(args: { where: { id?: string; username?: string; email?: string } }): Promise<IDBUser | null>;
    create(args: { data: Omit<IDBUser, 'createdAt' | 'updatedAt'> }): Promise<IDBUser>;
    update(args: { where: { id: string }; data: Partial<IDBUser> }): Promise<IDBUser>;
  };
  playerRating: {
    findUnique(args: { where: { userId_variantId: { userId: string; variantId: string } } }): Promise<IDBPlayerRating | null>;
    findMany(args: {
      where?: { variantId?: string };
      orderBy?: { ratingValue: 'asc' | 'desc' };
      take?: number;
      skip?: number;
    }): Promise<IDBPlayerRating[]>;
    upsert(args: {
      where: { userId_variantId: { userId: string; variantId: string } };
      create: Omit<IDBPlayerRating, 'id' | 'updatedAt'>;
      update: Partial<Omit<IDBPlayerRating, 'id' | 'userId' | 'variantId' | 'updatedAt'>>;
    }): Promise<IDBPlayerRating>;
  };
  matchHistory: {
    findUnique(args: { where: { id: string } }): Promise<IDBMatchHistory | null>;
    findMany(args: {
      where?: {
        variantId?: string;
        playerIds?: { has?: string };
        endedAt?: { gte?: Date; lte?: Date };
      };
      orderBy?: { endedAt: 'asc' | 'desc' };
      take?: number;
      skip?: number;
    }): Promise<IDBMatchHistory[]>;
    create(args: { data: Omit<IDBMatchHistory, 'endedAt'> & { endedAt?: Date } }): Promise<IDBMatchHistory>;
    deleteMany(args: { where: { id?: { in?: string[] }; moveStream?: { isEmpty?: boolean } } }): Promise<{ count: number }>;
  };
  customVariant: {
    findUnique(args: { where: { id: string } }): Promise<IDBCustomVariant | null>;
    findMany(args: {
      where?: {
        isPublic?: boolean;
        authorId?: string;
        deletedAt?: null | { not: null };
      };
      take?: number;
      skip?: number;
    }): Promise<IDBCustomVariant[]>;
    create(args: { data: Omit<IDBCustomVariant, 'createdAt'> }): Promise<IDBCustomVariant>;
    update(args: { where: { id: string }; data: Partial<IDBCustomVariant> }): Promise<IDBCustomVariant>;
  };
  $transaction<T>(fn: (prisma: IPrismaDatabaseClient) => Promise<T>): Promise<T>;
}

