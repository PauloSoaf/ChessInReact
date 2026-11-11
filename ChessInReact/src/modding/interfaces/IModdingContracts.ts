/**
 * ChessInReact - Modding API & Workshop Contracts (Spec 10 § 19)
 */

export interface ICreateFairyPiecePayload {
  readonly name: string;
  readonly pieceCode: string; // Ex: 'PEGASUS', 'CENTAUR'
  readonly betzaString: string; // Ex: 'N+bW', 'W', 'F', 'D'
  readonly valuePoints: number;
  readonly colorHexDefault?: string;
  readonly authorId: string;
}

export interface ICustomPieceDefinition {
  readonly pieceCode: string;
  readonly betzaString: string;
  readonly modelGlbUrl: string;
}

export interface ICommunityVariantManifest {
  readonly variantId: string;
  readonly title: string;
  readonly description: string;
  readonly topology: 'SQUARE' | 'HEXAGONAL' | 'TRIANGULAR' | 'VORONOI';
  readonly playerCount: number; // 2, 3, 4, 6, 8
  readonly boardRadius: number;
  readonly customPieces: readonly ICustomPieceDefinition[];
  readonly modifiers: {
    readonly atomic: boolean;
    readonly crazyhouse: boolean;
    readonly antichess: boolean;
    readonly fogOfWar: boolean;
  };
  readonly totalPlays: number;
  readonly ratingStarsAverage: number;
  readonly authorDisplayName: string;
  readonly publishedAtTimestamp: number;
  readonly isRanked: false; // Invariant: Custom variants are strictly unranked (Spec 10 § 10.2, RF-05)
}

export interface ILiveOpsMotdPayload {
  readonly eventId: string;
  readonly headlineTitle: string;
  readonly bannerImageUrl: string;
  readonly accentColorHex: string;
  readonly callToActionLabel: string;
  readonly targetRoute: string; // Ex: '/queue/hex_winter_cup'
  readonly activeUntilTimestamp: number;
}

export interface IValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly string[];
  readonly executionTimeMs: number;
}

