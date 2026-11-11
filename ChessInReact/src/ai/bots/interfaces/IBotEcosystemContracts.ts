/**
 * ChessInReact - Bot Ecosystem & Adaptive Learning Contracts (Spec 11 § 13)
 */

export type BotArchetype = 
  | 'CHAOTIC' 
  | 'AGGRESSIVE' 
  | 'PASSIVE' 
  | 'SOLID' 
  | 'TACTICAL' 
  | 'ADAPTIVE_EVOLUTIONARY';

export interface IBotDialogueLines {
  readonly gameStart: readonly string[];
  readonly onCapturePlayerQueen: readonly string[];
  readonly onOwnBlunder: readonly string[];
  readonly onCheckmateDelivered: readonly string[];
  readonly onDefeated: readonly string[];
}

export interface IBotProfile {
  readonly id: string; // Ex: 'bot_000', 'bot_300', 'bot_2200'
  readonly name: string;
  readonly ratingElo: number;
  readonly isAdaptive: boolean;
  readonly tier: 1 | 2 | 3 | 4;
  readonly avatarUrl: string;
  readonly bioDescription: string;
  readonly archetype: BotArchetype;
  readonly blunderRate: number; // 0.0 a 1.0
  readonly maxDepth: number;
  readonly maxThinkTimeMs: number;
  readonly openingBookFileName: string;
  readonly dialogueLines: IBotDialogueLines;
}

export interface IBlunderMemoryRecord {
  readonly botId: string;
  readonly zobristHash: string; // 64-bit hex hash
  readonly penalizedMove: string; // Ex: 'e2e4'
  readonly penaltyScore: number;
  readonly lossTimestamp: number;
  readonly occurrenceCount: number;
}

export interface IAdaptiveBookMutationRecord {
  readonly botId: string;
  readonly fenPositionKey: string;
  readonly moveString: string;
  readonly weightMultiplier: number; // 0.0 a 2.0
  readonly updatedAt: number;
}

export interface IPlayerHabitProfileRecord {
  readonly userId: string;
  readonly totalGamesAgainstBots: number;
  readonly queenEarlyDevelopmentRate: number;
  readonly castlingPreference: 'KINGSIDE' | 'QUEENSIDE' | 'NONE';
  readonly endgameConversionAccuracy: number;
  readonly timePanicErrorRate: number;
  readonly lastUpdated: number;
}

export interface IBotLearningExportPayload {
  readonly exportVersion: number;
  readonly exportedAtTimestamp: number;
  readonly botId: string;
  readonly blunders: readonly IBlunderMemoryRecord[];
  readonly bookMutations: readonly IAdaptiveBookMutationRecord[];
}

