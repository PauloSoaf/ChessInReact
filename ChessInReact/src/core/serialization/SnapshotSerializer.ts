import { IDomainState } from '../state/gameState';

/**
 * Domain snapshot representation suitable for persistence, replays, and network sync.
 * Strips UI state, callbacks, and transient variables.
 */
export class SnapshotSerializer {
  public static readonly SNAPSHOT_VERSION = 1;

  public static serialize(state: IDomainState): string {
    const payload = {
      version: this.SNAPSHOT_VERSION,
      timestamp: Date.now(),
      state: {
        matchId: state.matchId,
        variantId: state.variantId,
        isGameOver: state.isGameOver,
        winnerId: state.winnerId,
        activePlayer: state.activePlayer,
        turnNumber: state.turnNumber,
        revision: state.revision,
        boardEntities: state.boardEntities,
        occupancy: state.occupancy,
        capturedInventory: state.capturedInventory,
        turnState: state.turnState,
      },
    };
    return JSON.stringify(payload);
  }

  public static deserialize(jsonString: string): IDomainState {
    const parsed = JSON.parse(jsonString);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid snapshot payload: expected JSON object.');
    }

    if (parsed.version !== this.SNAPSHOT_VERSION) {
      throw new Error(
        `Unsupported snapshot version: ${parsed.version}. Current version is ${this.SNAPSHOT_VERSION}.`
      );
    }

    const { state } = parsed;
    if (!state || typeof state !== 'object' || !state.boardEntities || !state.occupancy) {
      throw new Error('Malformed snapshot: missing domain state or required spatial records.');
    }

    return state as IDomainState;
  }
}
