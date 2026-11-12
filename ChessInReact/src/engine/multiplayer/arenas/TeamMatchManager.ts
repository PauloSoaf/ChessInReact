/**
 * ChessInReact - Team Match Manager (Spec 14 § 7 RF-14-06)
 *
 * Implements cooperative team modes (2v2, 3v3, 4v4, 6v6):
 * - Factions belong to a team (e.g. TEAM_A vs TEAM_B).
 * - A team is eliminated when ALL its member factions are eliminated.
 * - Shared victory is awarded to the last surviving team.
 */

export interface ITeamAffiliation {
  readonly teamId: string;
  readonly memberFactions: readonly string[];
}

export class TeamMatchManager {
  public static evaluateTeamVictory(
    teams: readonly ITeamAffiliation[],
    eliminatedFactions: ReadonlySet<string>
  ): { isGameOver: boolean; winningTeamId: string | null; survivingTeamsCount: number } {
    const survivingTeams: string[] = [];

    for (const team of teams) {
      const hasAliveMember = team.memberFactions.some((f) => !eliminatedFactions.has(f));
      if (hasAliveMember) {
        survivingTeams.push(team.teamId);
      }
    }

    if (survivingTeams.length === 1) {
      return {
        isGameOver: true,
        winningTeamId: survivingTeams[0],
        survivingTeamsCount: 1,
      };
    }

    if (survivingTeams.length === 0) {
      return {
        isGameOver: true,
        winningTeamId: null, // Draw
        survivingTeamsCount: 0,
      };
    }

    return {
      isGameOver: false,
      winningTeamId: null,
      survivingTeamsCount: survivingTeams.length,
    };
  }
}

