import { describe, it, expect } from 'vitest';
import {
  VariantCatalog,
  OfficialSpellEngine,
  ExpandedSpellEngine,
  SPELL_CATALOG,
  DuckPlacementModifier,
  AtomicExplosionModifier,
  AntichessForcedCapture,
  ThreeCheckTracker,
  KingOfTheHillEvaluator,
  RacingKingsValidator,
  ShatranjEngine,
  ShogiEngine,
  XiangqiEngine,
  MakrukEngine,
  AliceBoardTeleportModifier,
} from '../index';

describe('Spec 13: Expanded Variant Universe, Historical & Fairy Engines', () => {
  describe('RF-13-01: Master Unified Variant Catalog', () => {
    it('initializes and contains variants across all 4 specified families', () => {
      const allVariants = VariantCatalog.getAll();
      expect(allVariants.length).toBeGreaterThanOrEqual(30);

      const classic = VariantCatalog.getByFamily('CLASSIC_MODIFIERS');
      expect(classic.length).toBeGreaterThanOrEqual(16);
      expect(classic.map((v) => v.id)).toContain('CHESS960');
      expect(classic.map((v) => v.id)).toContain('THREE_CHECK');
      expect(classic.map((v) => v.id)).toContain('ATOMIC_CHESS');
      expect(classic.map((v) => v.id)).toContain('ANTICHESS');
      expect(classic.map((v) => v.id)).toContain('KING_OF_THE_HILL');
      expect(classic.map((v) => v.id)).toContain('RACING_KINGS');
      expect(classic.map((v) => v.id)).toContain('FOG_OF_WAR');

      const magical = VariantCatalog.getByFamily('MAGICAL_HYBRIDS');
      expect(magical.length).toBeGreaterThanOrEqual(7);
      expect(magical.map((v) => v.id)).toContain('SPELL_CHESS_OFFICIAL');
      expect(magical.map((v) => v.id)).toContain('SPELL_CHESS_EXPANDED');
      expect(magical.map((v) => v.id)).toContain('DUCK_CHESS');
      expect(magical.map((v) => v.id)).toContain('BUGHOUSE');

      const geometric = VariantCatalog.getByFamily('GEOMETRIC_FAIRY');
      expect(geometric.length).toBeGreaterThanOrEqual(4);
      expect(geometric.map((v) => v.id)).toContain('GLINSKI_HEXAGONAL');
      expect(geometric.map((v) => v.id)).toContain('CAPABLANCA_CHESS');

      const historical = VariantCatalog.getByFamily('HISTORICAL_REGIONAL');
      expect(historical.length).toBeGreaterThanOrEqual(5);
      expect(historical.map((v) => v.id)).toContain('SHATRANJ');
      expect(historical.map((v) => v.id)).toContain('SHOGI');
      expect(historical.map((v) => v.id)).toContain('XIANGQI');
      expect(historical.map((v) => v.id)).toContain('MAKRUK');
    });

    it('supports fast keyword searching across name, id and badge', () => {
      const results = VariantCatalog.search('Capablanca');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].id).toBe('CAPABLANCA_CHESS');
      expect(results[0].boardDimensions).toEqual({ width: 10, height: 8 });
    });
  });

  describe('RF-13-02 vs RF-13-03: Spell Chess Dual Separation', () => {
    it('RF-13-02: Spell Chess Official operates with charges and cooldowns without mana', () => {
      let state = OfficialSpellEngine.createInitialState();
      expect(state.whiteCharges.freezeCharges).toBe(2);
      expect(state.whiteCharges.jumpCharges).toBe(2);
      expect(state.whiteCharges.freezeCooldownTurns).toBe(0);

      // Cast Freeze at (3,3)
      const freezeRes = OfficialSpellEngine.castFreeze(state, 'WHITE', { file: 3, rank: 3 });
      expect(freezeRes.success).toBe(true);
      state = freezeRes.state;

      expect(state.whiteCharges.freezeCharges).toBe(1);
      expect(state.whiteCharges.freezeCooldownTurns).toBe(3);
      expect(OfficialSpellEngine.isSquareFrozen(state, '3,3')).toBe(true);
      expect(OfficialSpellEngine.isSquareFrozen(state, '2,2')).toBe(true); // 3x3 radius
      expect(OfficialSpellEngine.isSquareFrozen(state, '4,4')).toBe(true);
      expect(OfficialSpellEngine.isSquareFrozen(state, '0,0')).toBe(false);

      // Attempting to cast freeze again while in cooldown fails
      const retryRes = OfficialSpellEngine.castFreeze(state, 'WHITE', { file: 3, rank: 3 });
      expect(retryRes.success).toBe(false);
      expect(retryRes.reason).toContain('tempo de recarga');

      // Advance 3 turns to clear cooldown
      state = OfficialSpellEngine.advanceTurn(state, 'WHITE');
      expect(state.whiteCharges.freezeCooldownTurns).toBe(2);
      state = OfficialSpellEngine.advanceTurn(state, 'WHITE');
      expect(state.whiteCharges.freezeCooldownTurns).toBe(1);
      state = OfficialSpellEngine.advanceTurn(state, 'WHITE');
      expect(state.whiteCharges.freezeCooldownTurns).toBe(0);

      // Jump spell
      const jumpRes = OfficialSpellEngine.castJump(state, 'WHITE', 'white_knight_b1');
      expect(jumpRes.success).toBe(true);
      expect(OfficialSpellEngine.hasJumpBuff(jumpRes.state, 'white_knight_b1')).toBe(true);
    });

    it('RF-13-03: Spell Chess Expanded operates with 7 spells and 2-6 mana accumulation', () => {
      expect(SPELL_CATALOG.length).toBe(7);
      const spellTypes = SPELL_CATALOG.map((s) => s.type);
      expect(spellTypes).toEqual([
        'FREEZE',
        'JUMP',
        'INVISIBILITY',
        'PORTAL',
        'STEALTH_TRAP',
        'RESURRECTION',
        'MIRROR_SHIELD',
      ]);

      const initial = ExpandedSpellEngine.createInitialState();
      expect(initial.whiteMana).toBe(2);
      expect(initial.blackMana).toBe(2);
      expect(initial.maxMana).toBe(6);

      // Can cast jump with 1 mana
      const stateAfterJump = ExpandedSpellEngine.castJump(initial, 'WHITE', 'knight_b1');
      expect(stateAfterJump.whiteMana).toBe(1);
      expect(stateAfterJump.jumpPieces['knight_b1']).toBe(1);

      // Cannot cast Freeze (2 mana) with only 1 mana left
      const canCastFreeze = ExpandedSpellEngine.canCast(stateAfterJump, 'WHITE', 'FREEZE');
      expect(canCastFreeze.allowed).toBe(false);
      expect(canCastFreeze.reason).toContain('Mana insuficiente');
      expect(() => {
        ExpandedSpellEngine.castFreeze(stateAfterJump, 'WHITE', 'e4');
      }).toThrow(/Mana insuficiente/);
    });
  });

  describe('RF-13-04: Duck Chess Two-Phase Turn Progression', () => {
    it('requires piece move then duck placement; blocks path and square', () => {
      let state = DuckPlacementModifier.createInitialState();
      expect(state.currentPhase).toBe('PIECE_MOVE');

      // Phase 1: move piece
      state = DuckPlacementModifier.executePieceMove(state, {
        from: 'e2',
        to: 'e4',
        pieceId: 'wp_e2',
      });
      expect(state.currentPhase).toBe('PLACE_DUCK');

      // Attempting to move another piece before placing duck fails
      const invalidPieceMove = DuckPlacementModifier.canExecutePieceMove(state, 'd2', 'd4');
      expect(invalidPieceMove.allowed).toBe(false);
      expect(invalidPieceMove.reason).toContain('requer colocação do pato');

      // Phase 2: place duck at e5
      const occupied = new Set(['e4', 'e8']);
      state = DuckPlacementModifier.executePlaceDuck(state, 'e5', occupied);
      expect(state.duckCoordinate).toBe('e5');
      expect(state.activePlayer).toBe('BLACK');
      expect(state.currentPhase).toBe('PIECE_MOVE');

      // Black piece cannot move to duck coordinate e5
      const blockRes = DuckPlacementModifier.canExecutePieceMove(state, 'e7', 'e5');
      expect(blockRes.allowed).toBe(false);
      expect(blockRes.reason).toContain('não pode ser capturado');

      // Sliding piece cannot pass through duck
      const pathBlockRes = DuckPlacementModifier.canExecutePieceMove(state, 'e8', 'e2', ['e7', 'e6', 'e5']);
      expect(pathBlockRes.allowed).toBe(false);
      expect(pathBlockRes.reason).toContain('bloqueada pelo Pato');
    });
  });

  describe('RF-13-05: Atomic Chess Radial Explosion', () => {
    it('destroys attacker, victim, and non-pawn neighbors; pawns survive', () => {
      const attacker = { id: 'w_knight', variantId: 'KNIGHT', owner: 'WHITE' as const, file: 3, rank: 2 };
      const victim = { id: 'b_bishop', variantId: 'BISHOP', owner: 'BLACK' as const, file: 3, rank: 4 };

      const boardPieces = [
        attacker,
        victim,
        { id: 'b_pawn', variantId: 'PAWN', owner: 'BLACK' as const, file: 2, rank: 4 }, // adjacent pawn
        { id: 'b_rook', variantId: 'ROOK', owner: 'BLACK' as const, file: 4, rank: 4 },  // adjacent non-pawn
        { id: 'w_queen', variantId: 'QUEEN', owner: 'WHITE' as const, file: 3, rank: 5 }, // adjacent non-pawn
        { id: 'b_king', variantId: 'KING', owner: 'BLACK' as const, file: 4, rank: 5 },   // adjacent king
      ];

      const explosion = AtomicExplosionModifier.resolveExplosion(attacker, victim, boardPieces);

      expect(explosion.attackerDestroyedId).toBe('w_knight');
      expect(explosion.victimDestroyedId).toBe('b_bishop');
      expect(explosion.collateralDestroyedIds).toContain('b_rook');
      expect(explosion.collateralDestroyedIds).toContain('w_queen');
      expect(explosion.collateralDestroyedIds).not.toContain('b_pawn'); // Pawns immune!
      expect(explosion.collateralDestroyedIds).toContain('b_king');
      expect(explosion.isGameOver).toBe(true);
      expect(explosion.winner).toBe('WHITE'); // Black King exploded!
    });
  });

  describe('RF-13-06: Antichess Forced Captures', () => {
    it('forces capture moves when available; filters out quiet moves', () => {
      const moves = [
        { from: 'e2', to: 'e4', pieceId: 'p1', isCapture: false },
        { from: 'd2', to: 'd4', pieceId: 'p2', isCapture: false },
        { from: 'e4', to: 'd5', pieceId: 'p1', isCapture: true },
      ];

      const filtered = AntichessForcedCapture.filterLegalMoves(moves);
      expect(filtered.length).toBe(1);
      expect(filtered[0].to).toBe('d5');
      expect(filtered[0].isCapture).toBe(true);
    });

    it('grants victory on total extinction or stalemate', () => {
      const winOnExtinction = AntichessForcedCapture.evaluateAntichessGameOver(0, 0, 'WHITE');
      expect(winOnExtinction.isGameOver).toBe(true);
      expect(winOnExtinction.winner).toBe('WHITE');

      const winOnStalemate = AntichessForcedCapture.evaluateAntichessGameOver(2, 0, 'BLACK');
      expect(winOnStalemate.isGameOver).toBe(true);
      expect(winOnStalemate.winner).toBe('BLACK');
    });
  });

  describe('RF-13-07: Three-Check and Five-Check', () => {
    it('tracks check counts and awards instant win upon threshold', () => {
      let state = ThreeCheckTracker.createInitialState(3);
      expect(state.whiteChecksDelivered).toBe(0);

      state = ThreeCheckTracker.registerCheck(state, 'WHITE');
      expect(state.whiteChecksDelivered).toBe(1);
      expect(state.isGameOver).toBe(false);

      state = ThreeCheckTracker.registerCheck(state, 'WHITE');
      expect(state.whiteChecksDelivered).toBe(2);
      expect(state.isGameOver).toBe(false);

      state = ThreeCheckTracker.registerCheck(state, 'WHITE');
      expect(state.whiteChecksDelivered).toBe(3);
      expect(state.isGameOver).toBe(true);
      expect(state.winner).toBe('WHITE');
    });
  });

  describe('RF-13-08: King of the Hill', () => {
    it('evaluates central squares d4, e4, d5, e5 for immediate win', () => {
      const outside = KingOfTheHillEvaluator.evaluateKingPosition('2,2', '6,6');
      expect(outside.isGameOver).toBe(false);

      const whiteInCenter = KingOfTheHillEvaluator.evaluateKingPosition('3,3', '6,6');
      expect(whiteInCenter.isGameOver).toBe(true);
      expect(whiteInCenter.winner).toBe('WHITE');

      const blackInCenter = KingOfTheHillEvaluator.evaluateKingPosition('0,0', '4,4');
      expect(blackInCenter.isGameOver).toBe(true);
      expect(blackInCenter.winner).toBe('BLACK');
    });
  });

  describe('RF-13-09: Racing Kings', () => {
    it('disallows checks and respects 8th rank race with Black equalizing ply', () => {
      expect(RacingKingsValidator.isCheckAllowed()).toBe(false);

      let race = RacingKingsValidator.createInitialState();
      // White reaches rank 7 (8th rank)
      race = RacingKingsValidator.evaluateRaceTurn(race, 'WHITE', 7);
      expect(race.whiteReachedRank8).toBe(true);
      expect(race.isGameOver).toBe(false); // Black gets equalizing move

      // If Black fails to reach rank 7
      const whiteWins = RacingKingsValidator.evaluateRaceTurn(race, 'BLACK', 6);
      expect(whiteWins.isGameOver).toBe(true);
      expect(whiteWins.winner).toBe('WHITE');

      // If Black also reaches rank 7: Draw
      const drawResult = RacingKingsValidator.evaluateRaceTurn(race, 'BLACK', 7);
      expect(drawResult.isGameOver).toBe(true);
      expect(drawResult.winner).toBe('DRAW');
    });
  });

  describe('RF-13-11: Historical Engines (Shatranj, Shogi, Xiangqi, Makruk)', () => {
    it('Shatranj: Bare King victory and Fers/Alfil movement rules', () => {
      expect(ShatranjEngine.isValidAlfilMove(2, 0, 4, 2)).toBe(true); // 2 steps diagonal leap
      expect(ShatranjEngine.isValidAlfilMove(2, 0, 3, 1)).toBe(false);
      expect(ShatranjEngine.isValidFersMove(3, 0, 4, 1)).toBe(true);  // 1 step diagonal
      expect(ShatranjEngine.isValidFersMove(3, 0, 3, 1)).toBe(false);

      let shatranjState = ShatranjEngine.createInitialState();
      // White captures Black's last non-king piece
      shatranjState = ShatranjEngine.evaluateBareKing(shatranjState, 'WHITE', 2, 0);
      expect(shatranjState.blackHasBareKing).toBe(true);
      expect(shatranjState.bareKingClaimant).toBe('WHITE');
      expect(shatranjState.isGameOver).toBe(false); // Black gets 1 ply to counter-bare

      // Black cannot counter-bare
      const resolved = ShatranjEngine.evaluateBareKing(shatranjState, 'BLACK', 2, 0);
      expect(resolved.isGameOver).toBe(true);
      expect(resolved.winner).toBe('WHITE');
    });

    it('Shogi: Promotion zones, demotion on capture and drop validation', () => {
      expect(ShogiEngine.isInPromotionZone('WHITE', 7)).toBe(true);
      expect(ShogiEngine.isInPromotionZone('WHITE', 2)).toBe(false);
      expect(ShogiEngine.isInPromotionZone('BLACK', 1)).toBe(true);

      expect(ShogiEngine.getPromotedPiece('SILVER')).toBe('PROMOTED_SILVER');
      expect(ShogiEngine.getUnpromotedType('PROMOTED_SILVER')).toBe('SILVER');

      let reserve = ShogiEngine.createInitialState().whiteReserve;
      reserve = ShogiEngine.addCaptureToReserve(reserve, 'PROMOTED_SILVER');
      expect(reserve.SILVER).toBe(1); // Demoted back to silver in hand

      // Drop on rank 8 with pawn is forbidden
      const dropPawnRank8 = ShogiEngine.canDropPiece(reserve, 'PAWN', 8, false, 'WHITE');
      expect(dropPawnRank8.allowed).toBe(false);
    });

    it('Xiangqi: River, Palace and Cannon jump-capture', () => {
      expect(XiangqiEngine.isInsideRedPalace(4, 1)).toBe(true);
      expect(XiangqiEngine.isInsideRedPalace(2, 1)).toBe(false); // file 2 outside palace
      expect(XiangqiEngine.hasCrossedRiver(6, true)).toBe(true); // Red crossed river

      // Cannon move
      const quietCannon = XiangqiEngine.isValidCannonMove({ file: 1, rank: 2 }, { file: 1, rank: 7 }, 0, false);
      expect(quietCannon).toBe(true);

      const captureWithOneScreen = XiangqiEngine.isValidCannonMove({ file: 1, rank: 2 }, { file: 1, rank: 7 }, 1, true);
      expect(captureWithOneScreen).toBe(true); // Screen jump capture

      const captureWithZeroScreens = XiangqiEngine.isValidCannonMove({ file: 1, rank: 2 }, { file: 1, rank: 7 }, 0, true);
      expect(captureWithZeroScreens).toBe(false); // Cannot capture without screen

      // Flying Generals
      expect(XiangqiEngine.areGeneralsFacing({ file: 4, rank: 0 }, { file: 4, rank: 9 }, 0)).toBe(true);
      expect(XiangqiEngine.areGeneralsFacing({ file: 4, rank: 0 }, { file: 4, rank: 9 }, 1)).toBe(false);
    });

    it('Makruk: Bia promotion on rank 5 (White) / rank 2 (Black) and Khon movement', () => {
      expect(MakrukEngine.isPromotionRank(5, true)).toBe(true);
      expect(MakrukEngine.isPromotionRank(4, true)).toBe(false);
      expect(MakrukEngine.isPromotionRank(2, false)).toBe(true);

      expect(MakrukEngine.isValidKhonMove({ file: 3, rank: 2 }, { file: 3, rank: 3 }, true)).toBe(true);
      expect(MakrukEngine.isValidKhonMove({ file: 3, rank: 2 }, { file: 4, rank: 3 }, true)).toBe(true);
      expect(MakrukEngine.isValidKhonMove({ file: 3, rank: 2 }, { file: 3, rank: 1 }, true)).toBe(false); // Khon cannot move backwards straight
    });
  });

  describe('RF-13-12: Capablanca Chess 10x8 & Alice Twin-Board', () => {
    it('Capablanca 10x8 has Chancellor and Archbishop in catalog', () => {
      const capa = VariantCatalog.getById('CAPABLANCA_CHESS');
      expect(capa).toBeDefined();
      expect(capa?.boardDimensions).toEqual({ width: 10, height: 8 });
      expect(capa?.specialRules.chancellor).toBe(true);
      expect(capa?.specialRules.archbishop).toBe(true);
    });

    it('Alice Chess teleports piece between twin boards unless blocked', () => {
      expect(AliceBoardTeleportModifier.getTwinBoard('BOARD_A')).toBe('BOARD_B');
      expect(AliceBoardTeleportModifier.getTwinBoard('BOARD_B')).toBe('BOARD_A');

      const occupancyB = { '3,3': 'occupied_piece' };
      expect(AliceBoardTeleportModifier.canTeleport(occupancyB, '3,3')).toBe(false);
      expect(AliceBoardTeleportModifier.canTeleport(occupancyB, '4,4')).toBe(true);

      const teleport = AliceBoardTeleportModifier.resolveTeleport('BOARD_A', '4,4');
      expect(teleport.targetBoard).toBe('BOARD_B');
      expect(teleport.coordKey).toBe('4,4');
    });
  });
});
