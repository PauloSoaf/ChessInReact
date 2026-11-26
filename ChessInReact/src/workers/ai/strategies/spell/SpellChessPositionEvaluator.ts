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
    activeFrozenCoords: readonly string[] = [],
    activeJumpCoords: readonly string[] = [],
    ply: number = 0
  ): number {
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

    // 3. Jump Threat Evaluation
    let jumpThreatScore = 0;
    const opponentCanJump = opponentResources.jumpRemaining > 0 && opponentResources.jumpCooldown === 0;
    const friendlyCanJump = playerResources.jumpRemaining > 0 && playerResources.jumpCooldown === 0;

    // A. Opponent 1-obstacle Jump rays against friendly King
    const opponentJumpRays = friendlyKingCoord
      ? SpellChessThreatAnalyzer.detectOneObstacleJumpRays(
          domain,
          friendlyKingCoord,
          actingPlayer
        )
      : [];
    if (opponentJumpRays.length > 0) {
      if (opponentCanJump || opponentJumpRays.some((r) => activeJumpCoords.includes(r.obstacleCoord))) {
        // Catastrophic danger: Opponent can leap over the obstacle and capture our King!
        jumpThreatScore -= 18000 * opponentJumpRays.length;
      } else {
        // Warning: Opponent has ray aligned, but Jump is on cooldown
        jumpThreatScore -= 1500 * opponentJumpRays.length;
      }
    }

    // B. Friendly 1-obstacle Jump rays against opponent King
    const friendlyJumpRays = opponentKingCoord
      ? SpellChessThreatAnalyzer.detectOneObstacleJumpRays(
          domain,
          opponentKingCoord,
          opponentPlayer
        )
      : [];
    if (friendlyJumpRays.length > 0) {
      if (friendlyCanJump || friendlyJumpRays.some((r) => activeJumpCoords.includes(r.obstacleCoord))) {
        // Decisive offensive potential: Friendly piece can leap to victory!
        jumpThreatScore += 18000 * friendlyJumpRays.length;
      } else {
        jumpThreatScore += 1500 * friendlyJumpRays.length;
      }
    }

    // C. King safety against adjacent enemy hurdles (Spec 12 & Spec 15)
    if (friendlyKingCoord) {
      const [fkx, fky] = SpellChessThreatAnalyzer.parseCoord(friendlyKingCoord);
      for (const entity of Object.values(domain.boardEntities)) {
        if (
          entity &&
          entity.type === 'PIECE' &&
          !entity.isCaptured &&
          entity.ownerId === opponentPlayer
        ) {
          const [ex, ey] = SpellChessThreatAnalyzer.parseCoord(entity.position);
          const dist = Math.max(Math.abs(fkx - ex), Math.abs(fky - ey));
          if (dist <= 1) {
            jumpThreatScore -= 5000;
          } else if (dist === 2) {
            jumpThreatScore -= 1500;
          }
        }
      }
    }
    if (opponentKingCoord) {
      const [okx, oky] = SpellChessThreatAnalyzer.parseCoord(opponentKingCoord);
      for (const entity of Object.values(domain.boardEntities)) {
        if (
          entity &&
          entity.type === 'PIECE' &&
          !entity.isCaptured &&
          entity.ownerId === actingPlayer
        ) {
          const [ex, ey] = SpellChessThreatAnalyzer.parseCoord(entity.position);
          const dist = Math.max(Math.abs(okx - ex), Math.abs(oky - ey));
          if (dist <= 1) {
            jumpThreatScore += 5000;
          } else if (dist === 2) {
            jumpThreatScore += 1500;
          }
        }
      }
    }

    // D. Opening principles for Spell Chess: developing knights vs pushing d/e pawns
    const turnNumber = domain.turnNumber ?? 1;
    if (turnNumber <= 3) {
      for (const entity of Object.values(domain.boardEntities)) {
        if (!entity || entity.type !== 'PIECE' || entity.isCaptured) continue;
        const v = entity.variantId.toUpperCase();
        const isFriendly = entity.ownerId === actingPlayer;
        const [px] = SpellChessThreatAnalyzer.parseCoord(entity.position);
        if (v === 'KNIGHT' || v === 'N') {
          if (entity.hasMoved) {
            if (isFriendly) pieceActivityScore += 800;
            else pieceActivityScore -= 800;
          }
        } else if (v === 'PAWN' || v === 'P') {
          if (entity.hasMoved && (px === 3 || px === 4)) {
            if (isFriendly) pieceActivityScore -= 4000;
            else pieceActivityScore += 4000;
          }
        }
      }
    }

    // 4. Freeze Tactical State
    let freezeScore = 0;
    const friendlyKingOccId = friendlyKingCoord ? (domain.occupancy[friendlyKingCoord as import('../../../../core/coordinates/types').CoordinateKey] as import('../../../../core/coordinates/types').EntityId | undefined) : undefined;
    const friendlyKingEnt = friendlyKingOccId ? (domain.boardEntities[friendlyKingOccId] as import('../../../../core/entities/types').IPieceEntity | undefined) : undefined;
    const isFriendlyKingFrozen = friendlyKingCoord ? (activeFrozenCoords.includes(friendlyKingCoord) || Boolean(friendlyKingEnt?.metadata?.isFrozen)) : false;

    const opponentKingOccId = opponentKingCoord ? (domain.occupancy[opponentKingCoord as import('../../../../core/coordinates/types').CoordinateKey] as import('../../../../core/coordinates/types').EntityId | undefined) : undefined;
    const opponentKingEnt = opponentKingOccId ? (domain.boardEntities[opponentKingOccId] as import('../../../../core/entities/types').IPieceEntity | undefined) : undefined;
    const isOpponentKingFrozen = opponentKingCoord ? (activeFrozenCoords.includes(opponentKingCoord) || Boolean(opponentKingEnt?.metadata?.isFrozen)) : false;

    if (isOpponentKingFrozen) {
      freezeScore += 3500;
      // Decisive Freeze-Mate Detection: Opponent King is frozen AND under direct attack!
      if (opponentKingCoord && CheckValidator.isSquareAttacked(opponentKingCoord as import('../../../../core/coordinates/types').CoordinateKey, actingPlayer, domain, topology)) {
        freezeScore += 80_000 - ply * 10;
      }
    }
    if (isFriendlyKingFrozen) {
      freezeScore -= 3500;
      // Catastrophic Freeze-Mate Danger: Friendly King is frozen AND under direct attack!
      if (friendlyKingCoord && CheckValidator.isSquareAttacked(friendlyKingCoord as import('../../../../core/coordinates/types').CoordinateKey, opponentPlayer, domain, topology)) {
        freezeScore -= 80_000 + ply * 10;
      }
    }

    // Freeze-readiness tactical anticipation:
    const opponentCanFreeze = opponentResources.freezeRemaining > 0 && opponentResources.freezeCooldown === 0;
    const friendlyCanFreeze = playerResources.freezeRemaining > 0 && playerResources.freezeCooldown === 0;

    if (friendlyKingCoord && opponentCanFreeze) {
      if (CheckValidator.isSquareAttacked(friendlyKingCoord as import('../../../../core/coordinates/types').CoordinateKey, opponentPlayer, domain, topology)) {
        // Mortal Threat: Opponent has Freeze ready and can paralyze-mate our King next turn!
        freezeScore -= 45_000;
      }
    }
    if (opponentKingCoord && friendlyCanFreeze) {
      if (CheckValidator.isSquareAttacked(opponentKingCoord as import('../../../../core/coordinates/types').CoordinateKey, actingPlayer, domain, topology)) {
        // High Lethal Potential: We have Freeze ready and can paralyze-mate their King!
        freezeScore += 45_000;
      }
    }

    // Reward freezing opponent threatening major pieces (Queen/Rooks)
    for (const entity of Object.values(domain.boardEntities)) {
      if (!entity || entity.type !== 'PIECE' || entity.isCaptured) continue;
      const piece = entity as IPieceEntity;
      const isFrozen = piece.metadata?.isFrozen || activeFrozenCoords.includes(piece.position);
      if (isFrozen) {
        const v = piece.variantId.toUpperCase();
        const freezeVal = v === 'QUEEN' || v === 'Q' ? 1800 : v === 'ROOK' || v === 'R' ? 900 : 300;
        if (piece.ownerId === opponentPlayer) {
          freezeScore += freezeVal;
        } else if (piece.ownerId === actingPlayer) {
          freezeScore -= freezeVal;
        }
      }
    }

    // Check checks
    const friendlyInCheck = CheckValidator.isRoyalInCheck(actingPlayer, domain, topology);
    const opponentInCheck = CheckValidator.isRoyalInCheck(opponentPlayer, domain, topology);
    if (friendlyInCheck) freezeScore -= 2500;
    if (opponentInCheck) freezeScore += 2500;

    // 5. Resource Economy & Cooldowns
    let economyScore = 0;
    // Value of remaining charges
    economyScore += playerResources.freezeRemaining * 50;
    economyScore -= opponentResources.freezeRemaining * 50;

    economyScore += playerResources.jumpRemaining * 100;
    economyScore -= opponentResources.jumpRemaining * 100;

    // Cooldown penalties
    if (playerResources.freezeCooldown > 0) economyScore -= playerResources.freezeCooldown * 15;
    if (playerResources.jumpCooldown > 0) economyScore -= playerResources.jumpCooldown * 25;
    if (opponentResources.freezeCooldown > 0) economyScore += opponentResources.freezeCooldown * 15;
    if (opponentResources.jumpCooldown > 0) economyScore += opponentResources.jumpCooldown * 25;

    return (
      materialScore +
      pieceActivityScore +
      jumpThreatScore +
      freezeScore +
      economyScore
    );
  }
}
