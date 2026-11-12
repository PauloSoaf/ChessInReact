/**
 * ChessInReact - Multiplayer Elimination Manager (Spec 14 § 5, RF-14-04)
 *
 * Implements the 4 distinct policies when a player is checkmated or leaves:
 * - EVAPORATION: pieces removed instantly.
 * - GREY_OBSTACLES: pieces stay as immobile neutral blocks.
 * - CONQUEST: checkmating conqueror assumes control of the pieces.
 * - ZOMBIE_BOT: AI bot instantly takes over slot.
 */

import { EliminationPolicy } from './interfaces/IArenaContracts';

export interface IArenaPiece {
  readonly id: string;
  readonly ownerFactionId: string;
  readonly coordKey: string;
  readonly isImmobileObstacle?: boolean;
}

export interface IEliminationResult {
  readonly survivingPieces: readonly IArenaPiece[];
  readonly reassignedFactionIds: Readonly<Record<string, string>>; // pieceId -> newOwnerFactionId
  readonly zombieBotAssigned: boolean;
}

export class EliminationManager {
  public static processElimination(
    policy: EliminationPolicy,
    eliminatedFactionId: string,
    currentPieces: readonly IArenaPiece[],
    conquerorFactionId?: string
  ): IEliminationResult {
    switch (policy) {
      case 'EVAPORATION': {
        const survivingPieces = currentPieces.filter(
          (p) => p.ownerFactionId !== eliminatedFactionId
        );
        return {
          survivingPieces,
          reassignedFactionIds: {},
          zombieBotAssigned: false,
        };
      }

      case 'GREY_OBSTACLES': {
        const survivingPieces = currentPieces.map((p) => {
          if (p.ownerFactionId === eliminatedFactionId) {
            return {
              ...p,
              ownerFactionId: 'NEUTRAL_GREY',
              isImmobileObstacle: true,
            };
          }
          return p;
        });
        return {
          survivingPieces,
          reassignedFactionIds: {},
          zombieBotAssigned: false,
        };
      }

      case 'CONQUEST': {
        const targetFaction = conquerorFactionId ?? eliminatedFactionId;
        const reassigned: Record<string, string> = {};
        const survivingPieces = currentPieces.map((p) => {
          if (p.ownerFactionId === eliminatedFactionId) {
            reassigned[p.id] = targetFaction;
            return {
              ...p,
              ownerFactionId: targetFaction,
            };
          }
          return p;
        });
        return {
          survivingPieces,
          reassignedFactionIds: reassigned,
          zombieBotAssigned: false,
        };
      }

      case 'ZOMBIE_BOT': {
        return {
          survivingPieces: currentPieces,
          reassignedFactionIds: {},
          zombieBotAssigned: true,
        };
      }
    }
  }
}

