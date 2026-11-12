/**
 * ChessInReact - Clockwise Turn Cycle Manager (Spec 14 § 1.2, § 7 RF-14-02)
 *
 * Manages turn rotation in multiplayer arenas:
 * - Rotates clockwise through active factions.
 * - Skips eliminated factions immediately.
 * - Increments round number after all remaining factions have moved.
 */

export interface ITurnCycleState {
  readonly factions: readonly string[]; // ['FACTION_1', 'FACTION_2', ...]
  readonly eliminatedFactions: ReadonlySet<string>;
  readonly currentFactionIndex: number;
  readonly roundNumber: number;
}

export class TurnCycleManager {
  public static createInitialState(factions: readonly string[]): ITurnCycleState {
    if (factions.length < 2) {
      throw new Error('Uma arena multiplayer requer pelo menos 2 participantes.');
    }
    return {
      factions,
      eliminatedFactions: new Set<string>(),
      currentFactionIndex: 0,
      roundNumber: 1,
    };
  }

  public static getActiveFaction(state: ITurnCycleState): string {
    return state.factions[state.currentFactionIndex];
  }

  public static getSurvivingFactions(state: ITurnCycleState): readonly string[] {
    return state.factions.filter((f) => !state.eliminatedFactions.has(f));
  }

  /**
   * Advances turn clockwise to the next non-eliminated faction.
   */
  public static advanceTurn(state: ITurnCycleState): ITurnCycleState {
    const total = state.factions.length;
    let nextIndex = (state.currentFactionIndex + 1) % total;
    let attempts = 0;

    // Search for next non-eliminated faction
    while (state.eliminatedFactions.has(state.factions[nextIndex]) && attempts < total) {
      nextIndex = (nextIndex + 1) % total;
      attempts++;
    }

    if (attempts >= total) {
      // All factions eliminated
      return state;
    }

    const completedRound = nextIndex <= state.currentFactionIndex;
    const nextRound = completedRound ? state.roundNumber + 1 : state.roundNumber;

    return {
      ...state,
      currentFactionIndex: nextIndex,
      roundNumber: nextRound,
    };
  }

  /**
   * Marks a faction as eliminated. If it is currently their turn, advances immediately.
   */
  public static eliminateFaction(state: ITurnCycleState, factionId: string): ITurnCycleState {
    const nextEliminated = new Set(state.eliminatedFactions);
    nextEliminated.add(factionId);

    const updatedState: ITurnCycleState = {
      ...state,
      eliminatedFactions: nextEliminated,
    };

    if (this.getActiveFaction(state) === factionId) {
      return this.advanceTurn(updatedState);
    }

    return updatedState;
  }
}

