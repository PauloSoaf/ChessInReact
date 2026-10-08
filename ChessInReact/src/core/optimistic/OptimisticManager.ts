import { ICommand } from '../commands/types';
import { IDomainState } from '../state/gameState';

export interface OptimisticRecord {
  readonly id: string;
  readonly command: ICommand;
  readonly baseRevision: number;
  readonly timestamp: number;
}

/**
 * OptimisticManager coordinates client-side prediction and server rollback reconciliation.
 * Conforms to Section W and RF-07/RF-08.
 */
export class OptimisticManager {
  private pendingCommands: Map<string, OptimisticRecord> = new Map();

  /**
   * Applies command optimistically onto the local domain draft and records pending intention.
   */
  public applyOptimistic(command: ICommand, draft: IDomainState): string {
    const optimisticId = `opt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    this.pendingCommands.set(optimisticId, {
      id: optimisticId,
      command,
      baseRevision: draft.revision,
      timestamp: Date.now(),
    });

    command.execute(draft);
    return optimisticId;
  }

  /**
   * Server acknowledged command successfully; remove from pending queue.
   */
  public acknowledge(optimisticId: string): void {
    this.pendingCommands.delete(optimisticId);
  }

  /**
   * Server rejected a command or sent authoritative state.
   * Restores authoritative snapshot and replays remaining valid pending commands.
   */
  public rollbackAndReconcile(
    rejectedOptimisticId: string,
    authoritativeState: IDomainState
  ): IDomainState {
    this.pendingCommands.delete(rejectedOptimisticId);

    // Deep clone authoritative state
    const reconciledState: IDomainState = JSON.parse(JSON.stringify(authoritativeState));

    // Replay remaining pending commands on top of authoritative base
    for (const record of this.pendingCommands.values()) {
      try {
        record.command.execute(reconciledState);
      } catch (err) {
        console.warn(`[OptimisticManager] Failed to replay optimistic command ${record.id}:`, err);
        this.pendingCommands.delete(record.id);
      }
    }

    return reconciledState;
  }

  /**
   * Clears all pending optimistic commands and accepts authoritative state directly.
   */
  public resetToAuthoritative(authoritativeState: IDomainState): IDomainState {
    this.pendingCommands.clear();
    return JSON.parse(JSON.stringify(authoritativeState));
  }

  public getPendingCount(): number {
    return this.pendingCommands.size;
  }

  public getPendingCommandIds(): readonly string[] {
    return Array.from(this.pendingCommands.keys());
  }
}
