/**
 * ChessInReact - Spell Chess Composite Move Generator (Spec 15 § 4 Estratégia 7, RF-15-06)
 *
 * Generates composite Spell Chess turn actions:
 *   SpellChessTurnAction = candidate spell + legal move in the affected state.
 *
 * Crucial Invariants:
 * 1. Spells are applied to an isolated cloned state BEFORE calculating legal moves.
 * 2. Jump allows sliding pieces to leap over the designated obstacle square.
 * 3. Freeze immobilizes all pieces in 3x3, but must not freeze all friendly pieces.
 * 4. Moves capturing the opponent King are prioritized first.
 */

import { IDomainState } from '../../../../core/state/gameState';
import { PlayerId, CoordinateKey, asEntityId } from '../../../../core/coordinates/types';
import { IPieceEntity } from '../../../../core/entities/types';
import { ITopology } from '../../../../core/topology/types';
import { RulesEngine } from '../../../../engine/rules/RulesEngine';
import { SpellAction, SpellChessTurnAction, SpellResources } from './SpellChessTurnAction';
import { SpellChessThreatAnalyzer } from './SpellChessThreatAnalyzer';

export class SpellChessMoveGenerator {
  /**
   * Generates all tactical candidate composite turn actions for the acting player.
   */
  public static generateTurnActions(
    domain: IDomainState,
    actingPlayer: PlayerId,
    topology: ITopology,
    resources: SpellResources,
    activeFrozenCoords: readonly string[] = [],
    activeJumpCoords: readonly string[] = [],
    fallbackLegalMoves?: readonly {
      readonly from: string;
      readonly to: string;
      readonly pieceId: string;
      readonly isCapture?: boolean;
      readonly promotion?: string;
    }[]
  ): SpellChessTurnAction[] {
    const opponentPlayer: PlayerId = actingPlayer === 'P1' ? 'P2' : 'P1';
    const friendlyKingCoord = SpellChessThreatAnalyzer.findKingCoord(domain, actingPlayer);
    const opponentKingCoord = SpellChessThreatAnalyzer.findKingCoord(domain, opponentPlayer);

    // 1. Identify Candidate Spells
    const candidateSpells: SpellAction[] = [{ type: 'NONE' }];

    // A. Candidate JUMP targets (obstacles to leap over)
    if (resources.jumpRemaining > 0 && resources.jumpCooldown === 0) {
      const candidateJumpSquares = new Set<string>();

      // 1. Sliders with 1 obstacle to opponent King (Offensive Jump Assassination!)
      if (opponentKingCoord) {
        const kingRays = SpellChessThreatAnalyzer.detectOneObstacleJumpRays(
          domain,
          opponentKingCoord,
          opponentPlayer
        );
        for (const ray of kingRays) {
          candidateJumpSquares.add(ray.obstacleCoord);
        }
      }

      // 2. Sliders with 1 obstacle to opponent major pieces (Queen, Rook, Bishop)
      for (const entity of Object.values(domain.boardEntities)) {
        if (
          entity &&
          entity.type === 'PIECE' &&
          !entity.isCaptured &&
          entity.ownerId === opponentPlayer
        ) {
          const v = entity.variantId.toUpperCase();
          if (v === 'QUEEN' || v === 'ROOK' || v === 'BISHOP' || v === 'Q' || v === 'R' || v === 'B') {
            const rays = SpellChessThreatAnalyzer.detectOneObstacleJumpRays(
              domain,
              entity.position,
              opponentPlayer
            );
            for (const ray of rays) {
              candidateJumpSquares.add(ray.obstacleCoord);
            }
          }
        }
      }

      // 3. Blocked friendly pawns on home rank
      for (const entity of Object.values(domain.boardEntities)) {
        if (
          entity &&
          entity.type === 'PIECE' &&
          !entity.isCaptured &&
          entity.ownerId === actingPlayer
        ) {
          const v = entity.variantId.toUpperCase();
          if (v === 'PAWN' || v === 'P') {
            const [px, py] = SpellChessThreatAnalyzer.parseCoord(entity.position);
            const homeRank = actingPlayer === 'P1' ? 1 : 6;
            const stepY = actingPlayer === 'P1' ? 1 : -1;
            if (py === homeRank) {
              const blockerCoord = SpellChessThreatAnalyzer.toCoord(px, py + stepY);
              if (domain.occupancy[blockerCoord as CoordinateKey]) {
                candidateJumpSquares.add(blockerCoord);
              }
            }
          }
        }
      }

      // 4. Defensive Jump if friendly King is threatened
      if (friendlyKingCoord) {
        const defRays = SpellChessThreatAnalyzer.detectOneObstacleJumpRays(
          domain,
          friendlyKingCoord,
          actingPlayer
        );
        for (const ray of defRays) {
          // If we can leap an obstacle to intercept or counter-attack
          candidateJumpSquares.add(ray.obstacleCoord);
        }
      }

      for (const sq of candidateJumpSquares) {
        // Must be an occupied square and not already possessing active Jump
        if (domain.occupancy[sq as CoordinateKey] && !activeJumpCoords.includes(sq)) {
          candidateSpells.push({ type: 'JUMP', targetSquare: sq });
        }
      }
    }

    // B. Candidate FREEZE targets (3x3 area centers)
    if (resources.freezeRemaining > 0 && resources.freezeCooldown === 0) {
      const candidateFreezeCenters = new Set<string>();

      // 1. Direct threats to friendly King
      if (friendlyKingCoord) {
        const directAttackers = SpellChessThreatAnalyzer.detectDirectAttacks(
          domain,
          friendlyKingCoord,
          opponentPlayer,
          topology
        );
        for (const att of directAttackers) {
          candidateFreezeCenters.add(att.attackingCoord);
        }

        // Sliders with 1 obstacle to King
        const rays = SpellChessThreatAnalyzer.detectOneObstacleJumpRays(
          domain,
          friendlyKingCoord,
          actingPlayer
        );
        for (const ray of rays) {
          candidateFreezeCenters.add(ray.attackingCoord);
        }
      }

      // 2. Opponent King (Offensive Freeze)
      if (opponentKingCoord) {
        candidateFreezeCenters.add(opponentKingCoord);
      }

      // 3. High-value clusters (opponent Queen/Rooks)
      const turnNumber = domain.turnNumber ?? 1;
      const opponentBackRank = opponentPlayer === 'P1' ? 0 : 7;
      for (const entity of Object.values(domain.boardEntities)) {
        if (
          entity &&
          entity.type === 'PIECE' &&
          !entity.isCaptured &&
          entity.ownerId === opponentPlayer
        ) {
          const v = entity.variantId.toUpperCase();
          if (v === 'QUEEN' || v === 'ROOK' || v === 'Q' || v === 'R') {
            const [, ey] = SpellChessThreatAnalyzer.parseCoord(entity.position);
            const isUndevelopedBackRank = !entity.hasMoved && ey === opponentBackRank;
            if (turnNumber <= 3 && isUndevelopedBackRank) {
              continue;
            }
            candidateFreezeCenters.add(entity.position);
          }
        }
      }

      for (const center of candidateFreezeCenters) {
        // Disallow freezing directly on an already active frozen center
        if (activeFrozenCoords.includes(center)) continue;

        // Verify that this freeze would not freeze ALL friendly pieces
        const [cx, cy] = SpellChessThreatAnalyzer.parseCoord(center);
        let wouldFreezeAllFriendly = true;
        for (const entity of Object.values(domain.boardEntities)) {
          if (
            entity &&
            entity.type === 'PIECE' &&
            !entity.isCaptured &&
            entity.ownerId === actingPlayer
          ) {
            const [px, py] = SpellChessThreatAnalyzer.parseCoord(entity.position);
            const inFreeze = Math.abs(px - cx) <= 1 && Math.abs(py - cy) <= 1;
            if (!inFreeze) {
              wouldFreezeAllFriendly = false;
              break;
            }
          }
        }
        if (!wouldFreezeAllFriendly) {
          candidateSpells.push({ type: 'FREEZE', targetSquare: center });
        }
      }
    }

    // 2. Generate composite actions for each candidate spell
    const actions: SpellChessTurnAction[] = [];

    for (const spell of candidateSpells) {
      const clonedState = this.cloneAndApplySpell(domain, spell, actingPlayer);
      let legalMoves = RulesEngine.getLegalMoves(clonedState, topology);

      if (fallbackLegalMoves && fallbackLegalMoves.length > 0) {
        if (spell.type === 'NONE') {
          legalMoves = fallbackLegalMoves.map((m) => ({
            from: m.from as CoordinateKey,
            to: m.to as CoordinateKey,
            pieceId: m.pieceId as ReturnType<typeof asEntityId>,
            isCapture: m.isCapture,
            promotion: m.promotion,
          })) as unknown as typeof legalMoves;
        } else if (spell.type === 'FREEZE') {
          const [cx, cy] = SpellChessThreatAnalyzer.parseCoord(spell.targetSquare);
          const isFrozen = (coord: string) => {
            const [x, y] = SpellChessThreatAnalyzer.parseCoord(coord);
            return Math.abs(x - cx) <= 1 && Math.abs(y - cy) <= 1;
          };
          legalMoves = fallbackLegalMoves
            .filter((m) => !isFrozen(m.from) && !isFrozen(m.to))
            .map((m) => ({
              from: m.from as CoordinateKey,
              to: m.to as CoordinateKey,
              pieceId: m.pieceId as ReturnType<typeof asEntityId>,
              isCapture: m.isCapture,
              promotion: m.promotion,
            })) as unknown as typeof legalMoves;
        } else if (spell.type === 'JUMP') {
          const fallbackSet = new Set(fallbackLegalMoves.map((m) => `${m.from}->${m.to}`));
          const target = spell.targetSquare;
          legalMoves = legalMoves.filter((m) => {
            if (fallbackSet.has(`${m.from}->${m.to}`)) return true;
            return SpellChessThreatAnalyzer.rayPassesThroughSquare(m.from, m.to, target);
          });
        }
      }

      for (const move of legalMoves) {
        actions.push({
          spell,
          move: {
            pieceId: move.pieceId,
            from: move.from,
            to: move.to,
            promotion: move.isPromotion ? 'QUEEN' : undefined,
            isCapture: move.isCapture,
          },
        });
      }
    }

    // 3. Move Ordering
    return this.orderTurnActions(actions, domain, opponentKingCoord);
  }

  /**
   * Clones domain state and applies the candidate spell's physical effects.
   */
  public static cloneAndApplySpell(
    domain: IDomainState,
    spell: SpellAction,
    actingPlayer?: PlayerId
  ): IDomainState {
    const clonedEntities: Record<string, IPieceEntity> = {};
    for (const [k, v] of Object.entries(domain.boardEntities)) {
      if (v) {
        clonedEntities[k] = { ...v, metadata: { ...(v.metadata ?? {}) } } as IPieceEntity;
      }
    }
    const clonedOccupancy = { ...domain.occupancy };

    if (spell.type === 'FREEZE') {
      const [cx, cy] = SpellChessThreatAnalyzer.parseCoord(spell.targetSquare);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const sq = SpellChessThreatAnalyzer.toCoord(cx + dx, cy + dy);
          const occupantId = clonedOccupancy[sq as CoordinateKey];
          if (occupantId) {
            const piece = clonedEntities[occupantId] as IPieceEntity | undefined;
            if (piece && piece.type === 'PIECE') {
              clonedEntities[occupantId] = {
                ...piece,
                metadata: {
                  ...(piece.metadata ?? {}),
                  isFrozen: true,
                },
              };
            }
          }
        }
      }
    } else if (spell.type === 'JUMP') {
      const occupantId = clonedOccupancy[spell.targetSquare as CoordinateKey];
      if (occupantId) {
        const piece = clonedEntities[occupantId] as IPieceEntity | undefined;
        if (piece && piece.type === 'PIECE') {
          clonedEntities[occupantId] = {
            ...piece,
            metadata: {
              ...(piece.metadata ?? {}),
              hasJump: true,
              canBeJumpedOver: true,
            },
          };
        }
      }
    }

    return {
      ...domain,
      activePlayer: actingPlayer ?? domain.activePlayer,
      boardEntities: clonedEntities,
      occupancy: clonedOccupancy,
    };
  }

  /**
   * Sorts turn actions with high-priority tactical ordering.
   */
  private static orderTurnActions(
    actions: SpellChessTurnAction[],
    domain: IDomainState,
    opponentKingCoord: string | null
  ): SpellChessTurnAction[] {
    return actions.sort((a, b) => {
      // 1. King Captures FIRST!
      const aCapturesKing = a.move.to === opponentKingCoord;
      const bCapturesKing = b.move.to === opponentKingCoord;
      if (aCapturesKing && !bCapturesKing) return -1;
      if (!aCapturesKing && bCapturesKing) return 1;

      // 2. Spells that result in King capture
      if (a.spell.type !== 'NONE' && aCapturesKing) return -1;
      if (b.spell.type !== 'NONE' && bCapturesKing) return 1;

      // 3. Captures by victim value (MVV-LVA)
      const aTarget = a.move.to as CoordinateKey;
      const bTarget = b.move.to as CoordinateKey;
      const aVictimId = domain.occupancy[aTarget];
      const bVictimId = domain.occupancy[bTarget];
      const aVictim = aVictimId ? (domain.boardEntities[aVictimId] as IPieceEntity) : undefined;
      const bVictim = bVictimId ? (domain.boardEntities[bVictimId] as IPieceEntity) : undefined;

      const victimScore = (v?: IPieceEntity): number => {
        if (!v || v.type !== 'PIECE') return 0;
        const u = v.variantId.toUpperCase();
        if (u === 'QUEEN' || u === 'Q') return 900;
        if (u === 'ROOK' || u === 'R') return 500;
        if (u === 'BISHOP' || u === 'B' || u === 'KNIGHT' || u === 'N') return 300;
        return 100;
      };

      const aVal = victimScore(aVictim);
      const bVal = victimScore(bVictim);
      if (aVal !== bVal) return bVal - aVal;

      // 4. Prefer NONE over spells if move quality is equal (conserve spells)
      if (a.spell.type === 'NONE' && b.spell.type !== 'NONE') return -1;
      if (a.spell.type !== 'NONE' && b.spell.type === 'NONE') return 1;

      return 0;
    });
  }
}
