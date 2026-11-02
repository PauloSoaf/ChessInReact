import { PlayerId } from '../../../core/coordinates/types';
import { IDomainState } from '../../../core/state/gameState';
import { ITopology } from '../../../core/topology/types';
import { AIDifficultyLevel, IBestMoveResult } from '../interfaces/IAIEngineContracts';
import { AIEngine } from '../AIEngine';

export interface IDisconnectedPlayerRecord {
  readonly playerId: PlayerId;
  readonly disconnectedAt: number;
  readonly gracePeriodMs: number;
  readonly assignedDifficulty: AIDifficultyLevel;
  isBotAssigned: boolean;
}

/**
 * Disconnected Player Bot Replacement Policy (Spec 05 § 15.1 US05-P03, § 16 RF-12).
 * Monitors multiplayer participant heartbeats, handles grace periods, and triggers
 * an autonomous bot to assume control of the abandoned army.
 */
export class BotReplacementPolicy {
  private disconnectedPlayers = new Map<PlayerId, IDisconnectedPlayerRecord>();
  private aiEngine: AIEngine;
  private readonly defaultGracePeriodMs: number;

  constructor(defaultGracePeriodMs = 15000, aiEngine?: AIEngine) {
    this.defaultGracePeriodMs = defaultGracePeriodMs;
    this.aiEngine = aiEngine ?? new AIEngine();
  }

  /**
   * Registers a player disconnection event.
   */
  public registerDisconnection(
    playerId: PlayerId,
    difficulty: AIDifficultyLevel = 2,
    customGracePeriodMs?: number
  ): void {
    this.disconnectedPlayers.set(playerId, {
      playerId,
      disconnectedAt: Date.now(),
      gracePeriodMs: customGracePeriodMs ?? this.defaultGracePeriodMs,
      assignedDifficulty: difficulty,
      isBotAssigned: false,
    });
  }

  /**
   * Registers a player reconnection event before grace period expires.
   */
  public registerReconnection(playerId: PlayerId): boolean {
    const record = this.disconnectedPlayers.get(playerId);
    if (!record) return false;

    // If bot was already permanently assigned, cannot reclaim automatically
    if (record.isBotAssigned) {
      return false;
    }

    this.disconnectedPlayers.delete(playerId);
    return true;
  }

  /**
   * Checks if a player has exceeded grace period and bot should take over.
   */
  public shouldBotTakeTurn(playerId: PlayerId, currentTime = Date.now()): boolean {
    const record = this.disconnectedPlayers.get(playerId);
    if (!record) return false;

    if (record.isBotAssigned) return true;

    if (currentTime - record.disconnectedAt >= record.gracePeriodMs) {
      record.isBotAssigned = true;
      return true;
    }

    return false;
  }

  /**
   * Computes replacement move for the disconnected player's turn.
   */
  public computeReplacementMove(
    state: IDomainState,
    topology: ITopology
  ): IBestMoveResult | null {
    const activePlayer = state.activePlayer;
    if (!this.shouldBotTakeTurn(activePlayer)) {
      return null;
    }

    const record = this.disconnectedPlayers.get(activePlayer)!;
    return this.aiEngine.calculateBestMove(state, topology, {
      difficulty: record.assignedDifficulty,
      timeBudgetMs: 500,
      depthLimit: 2,
    });
  }

  public getRecord(playerId: PlayerId): IDisconnectedPlayerRecord | undefined {
    return this.disconnectedPlayers.get(playerId);
  }

  public clear(): void {
    this.disconnectedPlayers.clear();
  }
}
