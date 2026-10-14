import { PlayerId } from '../coordinates/types';
import { IDomainState } from '../state/gameState';
import { ICommand } from './types';

/**
 * CompositeCommand groups multiple atomic commands (e.g. Castling = King move + Rook move)
 * into a single transaction without intermediate invalid states.
 */
export class CompositeCommand implements ICommand {
  public readonly id: string;
  public readonly type = 'COMPOSITE_COMMAND';
  public readonly description: string;

  private previousActivePlayer: PlayerId | null = null;
  private previousTurnNumber: number | null = null;

  constructor(
    public readonly commands: readonly ICommand[],
    public readonly actingPlayer: PlayerId,
    description?: string,
    id?: string,
    public advanceTurn: boolean = true
  ) {
    this.id = id ?? `comp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.description =
      description ?? `Composite [${commands.map((c) => c.description).join('; ')}]`;
  }

  public execute(draft: IDomainState): void {
    if (this.advanceTurn && draft.activePlayer !== this.actingPlayer) {
      throw new Error(
        `Invalid move: It is player "${draft.activePlayer}"'s turn, but command was dispatched for "${this.actingPlayer}".`
      );
    }

    if (this.advanceTurn) {
      this.previousActivePlayer = draft.activePlayer;
      this.previousTurnNumber = draft.turnNumber;
    }

    const executed: ICommand[] = [];
    try {
      for (const cmd of this.commands) {
        // Temporarily suppress turn advancement in sub-commands so composite advances turn once
        const originalAdvanceTurn = (cmd as { advanceTurn?: boolean }).advanceTurn;
        if ('advanceTurn' in cmd) {
          (cmd as { advanceTurn: boolean }).advanceTurn = false;
        }
        try {
          cmd.execute(draft);
        } finally {
          if ('advanceTurn' in cmd) {
            (cmd as { advanceTurn: boolean }).advanceTurn = originalAdvanceTurn ?? true;
          }
        }
        executed.push(cmd);
      }

      if (this.advanceTurn) {
        (draft as { activePlayer: PlayerId }).activePlayer =
          draft.activePlayer === 'P1' ? 'P2' : 'P1';
        (draft as { turnNumber: number }).turnNumber += 1;
      }
    } catch (err) {
      // Rollback executed child commands in reverse order
      for (let i = executed.length - 1; i >= 0; i--) {
        const cmd = executed[i];
        const originalAdvanceTurn = (cmd as { advanceTurn?: boolean }).advanceTurn;
        if ('advanceTurn' in cmd) {
          (cmd as { advanceTurn: boolean }).advanceTurn = false;
        }
        try {
          cmd.undo(draft);
        } catch {
          // preserve original error
        } finally {
          if ('advanceTurn' in cmd) {
            (cmd as { advanceTurn: boolean }).advanceTurn = originalAdvanceTurn ?? true;
          }
        }
      }

      if (this.advanceTurn) {
        if (this.previousActivePlayer !== null) {
          (draft as { activePlayer: PlayerId }).activePlayer = this.previousActivePlayer;
        }
        if (this.previousTurnNumber !== null) {
          (draft as { turnNumber: number }).turnNumber = this.previousTurnNumber;
        }
      }
      throw err;
    }
  }

  public undo(draft: IDomainState): void {
    // Undo in reverse order
    for (let i = this.commands.length - 1; i >= 0; i--) {
      const cmd = this.commands[i];
      const originalAdvanceTurn = (cmd as { advanceTurn?: boolean }).advanceTurn;
      if ('advanceTurn' in cmd) {
        (cmd as { advanceTurn: boolean }).advanceTurn = false;
      }
      try {
        cmd.undo(draft);
      } finally {
        if ('advanceTurn' in cmd) {
          (cmd as { advanceTurn: boolean }).advanceTurn = originalAdvanceTurn ?? true;
        }
      }
    }

    if (this.advanceTurn) {
      if (this.previousActivePlayer !== null) {
        (draft as { activePlayer: PlayerId }).activePlayer = this.previousActivePlayer;
      }
      if (this.previousTurnNumber !== null) {
        (draft as { turnNumber: number }).turnNumber = this.previousTurnNumber;
      }
    }
  }
}
