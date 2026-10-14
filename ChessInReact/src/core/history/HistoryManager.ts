import { ICommand } from '../commands/types';
import { IDomainState } from '../state/gameState';

export interface IHistoryManagerOptions {
  readonly maxHistoryLength?: number;
}

/**
 * HistoryManager manages undo and redo stacks for deterministic command reversals.
 * Enforces RF-06 (max 100 snapshots/commands limit for local mode).
 */
export class HistoryManager {
  private undoStack: ICommand[] = [];
  private redoStack: ICommand[] = [];
  private readonly maxHistoryLength: number;

  constructor(options?: IHistoryManagerOptions) {
    this.maxHistoryLength = options?.maxHistoryLength ?? 100;
  }

  /**
   * Executes a command on the provided domain draft, records it in the undo stack,
   * and invalidates the redo stack (new action branch).
   */
  public execute(command: ICommand, draft: IDomainState): void {
    command.execute(draft);

    this.undoStack.push(command);
    if (this.undoStack.length > this.maxHistoryLength) {
      this.undoStack.shift(); // Evict oldest command
    }

    // Branching invalidates any previous redo branch
    this.redoStack = [];
  }

  /**
   * Reverts the most recent command on the domain draft.
   * Returns true if a command was undone, false if undo stack was empty.
   * Transactional (PATCH-09): If command.undo throws, command remains on undoStack
   * and redoStack is not modified.
   */
  public undo(draft: IDomainState): boolean {
    if (this.undoStack.length === 0) {
      return false;
    }

    const command = this.undoStack[this.undoStack.length - 1];
    command.undo(draft);

    // Only commit stack mutation upon successful command execution
    this.undoStack.pop();
    this.redoStack.push(command);
    return true;
  }

  /**
   * Reapplies the most recently undone command on the domain draft.
   * Returns true if a command was redone, false if redo stack was empty.
   * Transactional (PATCH-09): If command.execute throws, command remains on redoStack
   * and undoStack is not modified.
   */
  public redo(draft: IDomainState): boolean {
    if (this.redoStack.length === 0) {
      return false;
    }

    const command = this.redoStack[this.redoStack.length - 1];
    command.execute(draft);

    // Only commit stack mutation upon successful command execution
    this.redoStack.pop();
    this.undoStack.push(command);
    return true;
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public getUndoCount(): number {
    return this.undoStack.length;
  }

  public getRedoCount(): number {
    return this.redoStack.length;
  }

  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  public getUndoStackDescriptions(): readonly string[] {
    return this.undoStack.map((c) => c.description);
  }
}
