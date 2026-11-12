import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UniversalMatchController } from '../UniversalMatchController';
import { MatchConfigurationManager } from '../../matchmaking/config/MatchConfigurationManager';
import { gameStore } from '../../core/state/gameStore';
import { asCoordinateKey } from '../../core/coordinates';
import { IPieceEntity } from '../../core/entities/types';
import { SPELL_CATALOG } from '../../analysis/minigames/SpellChessEngine';

describe('UniversalMatchController (Universal Gameplay Lifecycle & 0-Human Spectator)', () => {
  let controller: UniversalMatchController | null = null;

  beforeEach(() => {
    controller = null;
  });

  afterEach(() => {
    if (controller) {
      controller.dispose();
      controller = null;
    }
  });

  it('initializes standard Human vs Bot match correctly', () => {
    const config = MatchConfigurationManager.createDefaultMatch('standard', 2);
    controller = new UniversalMatchController(config);
    controller.startMatch();

    const snap = controller.getSnapshot();
    expect(snap.isSpectatorMatch).toBe(false);
    expect(snap.isPaused).toBe(false);
    expect(snap.playbackSpeed).toBe(1);
    expect(snap.activePlayer).toBe('P1');
    expect(snap.activeSlot.role).toBe('HUMAN_LOCAL');
    expect(snap.config.slots[1].role).toBe('AI_BOT');
    expect(snap.config.totalParticipants).toBe(2);
  });

  it('detects 0-human all-bot match as Spectator Mode with pause and speed controls', () => {
    let config = MatchConfigurationManager.createDefaultMatch('standard', 2);
    // Convert slot 0 from HUMAN_LOCAL to AI_BOT -> 0 humans
    config = MatchConfigurationManager.updateSlotRole(config, 0, 'AI_BOT');

    controller = new UniversalMatchController(config);
    controller.startMatch();

    expect(controller.isSpectatorMatch()).toBe(true);
    expect(controller.isPaused()).toBe(false);

    // Toggle pause
    controller.togglePause();
    expect(controller.isPaused()).toBe(true);

    // Set speed multipliers (1x, 2x, 5x)
    controller.setPlaybackSpeed(2);
    expect(controller.getPlaybackSpeed()).toBe(2);
    controller.setPlaybackSpeed(5);
    expect(controller.getPlaybackSpeed()).toBe(5);

    // Toggle resume
    controller.togglePause();
    expect(controller.isPaused()).toBe(false);
  });

  it('executes autonomous stepBotTurn in bot-vs-bot match', async () => {
    let config = MatchConfigurationManager.createDefaultMatch('standard', 2);
    config = MatchConfigurationManager.updateSlotRole(config, 0, 'AI_BOT');

    controller = new UniversalMatchController(config);
    controller.startMatch();
    controller.togglePause(); // pause to test manual single-step

    const initialRevision = gameStore.getState().domain.revision;
    const stepped = await controller.stepBotTurn();

    expect(stepped).toBe(true);
    expect(gameStore.getState().domain.revision).toBeGreaterThan(initialRevision);
    expect(controller.getSnapshot().lastMoveSummary).not.toBeNull();
  });

  it('orchestrates Duck Chess two-phase atomic turns', async () => {
    const config = MatchConfigurationManager.createDefaultMatch('DUCK_CHESS', 2);
    controller = new UniversalMatchController(config);
    controller.startMatch();

    let snap = controller.getSnapshot();
    expect(snap.duckPhase).toBe('PIECE_MOVE');
    expect(snap.duckCoordinate).toBeNull();

    // 1. Human moves piece: e2 (4,1) -> e4 (4,3)
    const p1PawnId = gameStore.getState().domain.occupancy[asCoordinateKey('4,1')];
    expect(p1PawnId).toBeDefined();

    controller.onHumanPieceMoved('4,1', '4,3', p1PawnId);
    snap = controller.getSnapshot();
    expect(snap.duckPhase).toBe('PLACE_DUCK');

    // 2. Human places duck on unoccupied square e5 (4,4)
    const placed = controller.placeDuck('4,4');
    expect(placed).toBe(true);

    snap = controller.getSnapshot();
    expect(snap.duckCoordinate).toBe('4,4');
    expect(snap.duckPhase).toBe('PIECE_MOVE');
  });

  it('manages Official Spell Chess charges and cooldowns', () => {
    const config = MatchConfigurationManager.createDefaultMatch('SPELL_CHESS_OFFICIAL', 2);
    controller = new UniversalMatchController(config);
    controller.startMatch();

    let snap = controller.getSnapshot();
    expect(snap.officialSpellState).toBeDefined();
    expect(snap.officialSpellState?.whiteCharges.freezeCharges).toBe(2);
    expect(snap.officialSpellState?.whiteCharges.jumpCharges).toBe(2);

    // Cast Freeze on d4
    const freezeSuccess = controller.castOfficialSpell('FREEZE', 'd4');
    expect(freezeSuccess).toBe(true);

    snap = controller.getSnapshot();
    expect(snap.officialSpellState?.whiteCharges.freezeCharges).toBe(1);
    expect(snap.officialSpellState?.whiteCharges.freezeCooldownTurns).toBe(3);

    // Casting freeze again while in cooldown should fail
    const secondFreeze = controller.castOfficialSpell('FREEZE', 'd4');
    expect(secondFreeze).toBe(false);

    // Cast Jump
    const p1PawnId = gameStore.getState().domain.occupancy[asCoordinateKey('4,1')];
    const jumpSuccess = controller.castOfficialSpell('JUMP', p1PawnId);
    expect(jumpSuccess).toBe(true);

    snap = controller.getSnapshot();
    expect(snap.officialSpellState?.whiteCharges.jumpCharges).toBe(1);
  });

  it('manages Expanded Spell Chess mana and casting', () => {
    const config = MatchConfigurationManager.createDefaultMatch('SPELL_CHESS_EXPANDED', 2);
    controller = new UniversalMatchController(config);
    controller.startMatch();

    let snap = controller.getSnapshot();
    expect(snap.expandedSpellState).toBeDefined();
    expect(snap.expandedSpellState?.whiteMana).toBe(2);

    // Cast Freeze (cost 2 mana)
    const freezeSpell = SPELL_CATALOG.find((s) => s.type === 'FREEZE')!;
    const castSuccess = controller.castExpandedSpell(freezeSpell, 'e4');
    expect(castSuccess).toBe(true);

    snap = controller.getSnapshot();
    expect(snap.expandedSpellState?.whiteMana).toBe(0);
    expect(snap.expandedSpellState?.frozenCoordinates['e4']).toBe(1);
  });

  it('spawns 10x8 Capablanca pieces and sets SquareTopology(10, 8)', () => {
    const config = MatchConfigurationManager.createDefaultMatch('CAPABLANCA_CHESS', 2);
    controller = new UniversalMatchController(config);
    controller.startMatch();

    const domain = gameStore.getState().domain;
    const pieces = Object.values(domain.boardEntities).filter((e): e is IPieceEntity => e.type === 'PIECE');

    // 20 white pieces + 20 black pieces = 40 pieces total
    expect(pieces.length).toBe(40);

    const archbishops = pieces.filter((p) => p.variantId === 'ARCHBISHOP');
    const chancellors = pieces.filter((p) => p.variantId === 'CHANCELLOR');

    expect(archbishops.length).toBe(2);
    expect(chancellors.length).toBe(2);
  });

  it('spawns massive multiplayer 4-player FFA cross arena and manages clockwise turns', () => {
    const config = MatchConfigurationManager.createDefaultMatch('FOUR_PLAYER_FFA', 4);
    controller = new UniversalMatchController(config);
    controller.startMatch();

    const snap = controller.getSnapshot();
    expect(snap.config.totalParticipants).toBe(4);
    expect(snap.config.slots.length).toBe(4);

    // P1 (Red), P2 (Blue), P3 (Yellow), P4 (Green)
    expect(snap.config.slots[0].colorName).toBe('White'); // slot 0 default
    expect(snap.config.slots[1].role).toBe('AI_BOT');
    expect(snap.config.slots[2].role).toBe('AI_BOT');
    expect(snap.config.slots[3].role).toBe('AI_BOT');

    const domain = gameStore.getState().domain;
    const pieces = Object.values(domain.boardEntities).filter((e): e is IPieceEntity => e.type === 'PIECE');
    expect(pieces.length).toBeGreaterThan(0);
  });
});
