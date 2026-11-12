/**
 * ChessInReact - Massive Multiplayer Arenas & Simultaneous Action Contracts (Spec 14 § 2, § 4, § 5)
 */

export type ArenaModeId =
  | 'THREE_PLAYER_CHESS'
  | 'TRIANGULAR_CHAOS_3P'
  | 'FOUR_PLAYER_FFA'
  | 'FOUR_PLAYER_TEAMS'
  | 'FOUR_PLAYER_SOLO'
  | 'CHATURAJI'
  | 'FORTRESS_5P'
  | 'STRONGHOLD_5P'
  | 'CITADEL_5P'
  | 'HEXAGON_SIX_PLAYER'
  | 'SIX_PLAYER_TEAMS'
  | 'MINI_HEXAGON_6P'
  | 'SEVEN_PLAYER_FFA'
  | 'OCTAGON_FFA'
  | 'OCTAGON_TEAMS'
  | 'NEXUS_10P'
  | 'MINI_DODECAGON_12P'
  | 'DIPLOMACY_CHESS';

export type EliminationPolicy =
  | 'EVAPORATION'
  | 'GREY_OBSTACLES'
  | 'CONQUEST'
  | 'ZOMBIE_BOT';

export interface IArenaFactionSpawn {
  readonly factionId: string;
  readonly factionIndex: number;
  readonly colorName: string;
  readonly hexColor: string;
  readonly spawnAreaDescription: string;
  readonly initialCoordinates: readonly {
    readonly pieceVariantId: string;
    readonly coordKey: string;
    readonly isRoyal?: boolean;
  }[];
}

export interface IArenaLayoutDefinition {
  readonly id: ArenaModeId;
  readonly name: string;
  readonly totalParticipants: number;
  readonly boardType: 'SQUARE_CROSS' | 'HEXAGON_RADIAL' | 'DODECAGON_RING' | 'TRIANGULAR';
  readonly factions: readonly IArenaFactionSpawn[];
  readonly allowedEliminationPolicies: readonly EliminationPolicy[];
}

export interface ISimultaneousCommit {
  readonly factionId: string;
  readonly secretHash: string;
  readonly timestamp: number;
}

export interface ISimultaneousMoveOrder {
  readonly factionId: string;
  readonly pieceId: string;
  readonly fromCoord: string;
  readonly toCoord: string;
}

export interface IArbitrationResult {
  readonly executedMoves: readonly ISimultaneousMoveOrder[];
  readonly bouncedMoves: readonly {
    readonly order: ISimultaneousMoveOrder;
    readonly bounceReason: 'HEAD_ON_COLLISION' | 'SWAP_COLLISION' | 'BLOCKED_BY_OBSTACLE';
  }[];
  readonly resolvedOccupancy: Readonly<Record<string, string>>;
}

