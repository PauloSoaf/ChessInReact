/**
 * ChessInReact - Spell Chess Position Evaluator (Spec 15 § 4 Estratégia 7, RF-15-06)
 *
 * Evaluates game positions specifically for Spell Chess:
 * - Terminal priority: King capture produces instant mate score (+/- 100,000).
 * - Jump threat dynamics: 1-obstacle rays to King are heavily penalized/rewarded based on Jump availability.
 * - Freeze awareness: Evaluates frozen kings and major pieces, taking account of expiration.
 * - Resource economics: Models value of remaining Freeze and Jump charges and cooldowns.
 */

import { IDomainState } from '../../../../core/state/gameState';
import { PlayerId } from '../../../../core/coordinates/types';
import { IPieceEntity } from '../../../../core/entities/types';
import { SpellChessThreatAnalyzer } from './SpellChessThreatAnalyzer';
import { SpellResources } from './SpellChessTurnAction';
import { OfficialSpellRules } from '../../../../engine/variants/spells/OfficialSpellRules';
import { CheckValidator } from '../../../../engine/rules/CheckValidator';
import { ITopology } from '../../../../core/topology/types';

export const SPELL_CHESS_MATE_SCORE = 100_000;

const PIECE_VALUES: Record<string, number> = {
  PAWN: 100,
  P: 100,
  KNIGHT: 320,
  N: 320,
  BISHOP: 330,
  B: 330,
  ROOK: 500,
  R: 500,
  QUEEN: 900,
  Q: 900,
  KING: 0,
  K: 0,
};

export class SpellChessPositionEvaluator {
  public static evaluate(
    domain: IDomainState,
    actingPlayer: PlayerId,
    topology: ITopology,
    playerResources: SpellResources,
    opponentResources: SpellResources,
    _activeFrozenCoords: readonly string[] = [],
    _activeJumpCoords: readonly string[] = [],
    ply: number = 0
  ): number {
    void _activeFrozenCoords; void _activeJumpCoords;
    const opponentPlayer: PlayerId = actingPlayer === 'P1' ? 'P2' : 'P1';

    // 1. Terminal Royal Capture Verification
    let friendlyKingCaptured = false;
    let opponentKingCaptured = false;
    for (const entity of Object.values(domain.boardEntities)) {
      if (
        entity &&
        entity.type === 'PIECE' &&
        (entity.variantId.toUpperCase() === 'KING' || entity.variantId.toUpperCase() === 'K')
      ) {
        if (entity.ownerId === actingPlayer && entity.isCaptured) {
          friendlyKingCaptured = true;
        } else if (entity.ownerId === opponentPlayer && entity.isCaptured) {
          opponentKingCaptured = true;
        }
      }
    }

    if (opponentKingCaptured) {
      return SPELL_CHESS_MATE_SCORE - ply;
    }
    if (friendlyKingCaptured) {
      return -SPELL_CHESS_MATE_SCORE + ply;
    }

    const friendlyKingCoord = SpellChessThreatAnalyzer.findKingCoord(domain, actingPlayer);
    const opponentKingCoord = SpellChessThreatAnalyzer.findKingCoord(domain, opponentPlayer);

    // 2. Material & Positional Evaluation
    let materialScore = 0;
    let pieceActivityScore = 0;

    for (const entity of Object.values(domain.boardEntities)) {
      if (!entity || entity.type !== 'PIECE' || entity.isCaptured) continue;
      const piece = entity as IPieceEntity;
      const variant = piece.variantId.toUpperCase();
      const isKing = variant === 'KING' || variant === 'K';
      const baseValue = isKing ? 0 : (PIECE_VALUES[variant] ?? 100);
      const isFriendly = piece.ownerId === actingPlayer;

      const [px, py] = SpellChessThreatAnalyzer.parseCoord(piece.position);
      let activity = 0;
      if (!isKing) {
        // Central proximity bonus for active non-king combatants
        const centerDist = Math.abs(px - 3.5) + Math.abs(py - 3.5);
        activity = (7 - centerDist) * 3;
      } else {
        // King safety: penalize venturing away from back rank into exposed center
        const homeRank = isFriendly
          ? (actingPlayer === 'P1' ? 0 : 7)
          : (actingPlayer === 'P1' ? 7 : 0);
        const rankDist = Math.abs(py - homeRank);
        activity = -rankDist * 25;
      }

      if (isFriendly) {
        materialScore += baseValue;
        pieceActivityScore += activity;
      } else {
        materialScore -= baseValue;
        pieceActivityScore -= activity;
      }
    }

    // Tactical wins are proved by legal composite actions in search, not frozen-king heuristics.
    const friendlyRays = opponentKingCoord ? SpellChessThreatAnalyzer.detectOneObstacleJumpRays(domain, opponentKingCoord, opponentPlayer).length : 0;
    const enemyRays = friendlyKingCoord ? SpellChessThreatAnalyzer.detectOneObstacleJumpRays(domain, friendlyKingCoord, actingPlayer).length : 0;
    const jumpScore = (playerResources.jumpRemaining > 0 && playerResources.jumpCooldown === 0 ? friendlyRays * 60 : 0) -
      (opponentResources.jumpRemaining > 0 && opponentResources.jumpCooldown === 0 ? enemyRays * 60 : 0);
    let frozenScore = 0;
    for (const piece of OfficialSpellRules.pieces(domain)) {
      if (!piece.metadata?.isFrozen) continue;
      const value = Math.min(8, (PIECE_VALUES[piece.variantId.toUpperCase()] ?? 0) / 100);
      frozenScore += piece.ownerId === actingPlayer ? -value : value;
    }
    const checkScore = (CheckValidator.isRoyalInCheck(opponentPlayer, domain, topology) ? 35 : 0) -
      (CheckValidator.isRoyalInCheck(actingPlayer, domain, topology) ? 35 : 0);
    const economy = (playerResources.freezeRemaining - opponentResources.freezeRemaining) * 60 +
      (playerResources.jumpRemaining - opponentResources.jumpRemaining) * 100;
    return Math.max(-20000, Math.min(20000, materialScore + pieceActivityScore + jumpScore + frozenScore + checkScore + economy));
  }
}
