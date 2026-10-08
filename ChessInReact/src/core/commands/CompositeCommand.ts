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

  constructor(
    public readonly commands: readonly ICommand[],
    public readonly actingPlayer: PlayerId,
    description?: string,
    id?: string
  ) {
    this.id = id ?? `comp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.description =
      description ?? `Composite [${commands.map((c) => c.description).join('; ')}]`;
  }

  public execute(draft: IDomainState): void {
    const executed: ICommand[] = [];
    try {
      for (const cmd of this.commands) {
        cmd.execute(draft);
        executed.push(cmd);
      }
    } catch (err) {
      // Rollback executed child commands in reverse order
      for (let i = executed.length - 1; i >= 0; i--) {
        try {
          executed[i].undo(draft);
        } catch {
          // preserve original error
        }
      }
      throw err;
    }
  }

  public undo(draft: IDomainState): void {
    // Undo in reverse order
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i].undo(draft);
    }
  }
}
