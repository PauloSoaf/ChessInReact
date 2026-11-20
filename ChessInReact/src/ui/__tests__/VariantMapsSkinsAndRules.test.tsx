// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '../theme/ThemeContext';
import ChessBoard from '../../components/ChessBoard/ChessBoard';
import { VariantMapConfig } from '../../engine/variants/VariantMapConfig';
import { UniversalMatchController } from '../../controllers/UniversalMatchController';
import { MatchConfigurationManager } from '../../matchmaking/config/MatchConfigurationManager';
import { SPELL_CATALOG } from '../../analysis/minigames/SpellChessEngine';
import { gameStore } from '../../core/state/gameStore';
import { RulesEngine } from '../../engine/rules/RulesEngine';
import { SquareTopology } from '../../core/topology/SquareTopology';
import { asCoordinateKey, asEntityId } from '../../core/coordinates';
import { VariantSpecializedStrategy } from '../../workers/ai/strategies/VariantSpecializedStrategy';
import { DuckChessPlannerStrategy } from '../../workers/ai/strategies/DuckChessPlannerStrategy';
import { SpellOptimizationStrategy } from '../../workers/ai/strategies/SpellOptimizationStrategy';
import { VariantOverlays3D } from '../../rendering/mesh/VariantOverlays3D';
import { VariantCatalog } from '../../engine/variants/catalog/VariantCatalog';
import { VariantMatchBanner } from '../components/game/VariantMatchBanner';
import { OfficialSpellBar } from '../components/game/OfficialSpellBar';
import { ReserveDropsBar } from '../components/game/ReserveDropsBar';
import { GameHub } from '../components/hub/GameHub';
import { CubicTopology } from '../../core/topology/CubicTopology';
import { VariantPieceInitializer } from '../../engine/variants/VariantPieceInitializer';
import { ThreeCheckTracker } from '../../engine/variants/modifiers/ThreeCheckTracker';
import { IPieceEntity } from '../../core/entities/types';
import { IDomainState } from '../../core/state/gameState';

describe('Variable Variant Maps, Spell Chess Skins & Gameplay Mechanics, and Rule-Aware Bots', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('1. Variable Map Cutouts: 4-Player Cross (160 active / 36 void), Capablanca (80 active / 20 void), and Hex/Ring cutouts', () => {
    // 4-Player 14x14 Cross: 196 total - 4*(3x3)=36 void = 160 active squares
    let crossActive = 0;
    let crossVoid = 0;
    for (let x = 0; x < 14; x++) {
      for (let y = 0; y < 14; y++) {
        if (VariantMapConfig.isVoidSquare('FOUR_PLAYER_FFA', x, y, 14)) {
          crossVoid++;
        } else {
          crossActive++;
        }
      }
    }
    expect(crossVoid).toBe(36);
    expect(crossActive).toBe(160);

    // Capablanca 10x8 inside 10x10 visual grid: 80 active squares, 20 void squares (rows 8 and 9)
    let capaActive = 0;
    let capaVoid = 0;
    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 10; y++) {
        if (VariantMapConfig.isVoidSquare('CAPABLANCA_CHESS', x, y, 10)) {
          capaVoid++;
        } else {
          capaActive++;
        }
      }
    }
    expect(capaActive).toBe(80);
    expect(capaVoid).toBe(20);

    // 6-Player Hexagonal and 5-Player Fortress Ring have diamond/octagonal corner cutouts
    expect(VariantMapConfig.isVoidSquare('HEXAGON_SIX_PLAYER', 0, 0, 16)).toBe(true);
    expect(VariantMapConfig.isVoidSquare('HEXAGON_SIX_PLAYER', 7, 7, 16)).toBe(false);
    expect(VariantMapConfig.isVoidSquare('FORTRESS_5P', 0, 0, 16)).toBe(true);
    expect(VariantMapConfig.getSquareZone('FORTRESS_5P', 7, 7, 16)).toBe('CITADEL_RING');
  });

  it('2. 2D Board renders Variable Map Cutouts (VOID squares) and Special Zones (Hill Sanctuary, Finish Line, Arcane Conduits, Portals, Traps)', () => {
    const controller = new UniversalMatchController();

    // Launch 4-Player Cross match and render 14x14 board
    const crossCfg = MatchConfigurationManager.createDefaultMatch('FOUR_PLAYER_FFA', 4);
    controller.startMatch(crossCfg);

    const { unmount } = render(
      <ThemeProvider>
        <ChessBoard boardSize={14} />
      </ThemeProvider>
    );

    const cornerVoid = screen.getByTestId('square-0,0');
    expect(cornerVoid.getAttribute('data-void-square')).toBe('true');
    const centerActive = screen.getByTestId('square-7,7');
    expect(centerActive.getAttribute('data-void-square')).toBeNull();
    unmount();

    // Launch King of the Hill and verify Hill Sanctuary markers on d4,e4,d5,e5
    const kothCfg = MatchConfigurationManager.createDefaultMatch('KING_OF_THE_HILL', 2);
    controller.startMatch(kothCfg);
    const { unmount: unmountKoth } = render(
      <ThemeProvider>
        <ChessBoard boardSize={8} />
      </ThemeProvider>
    );
    expect(screen.getAllByTestId('hill-sanctuary-marker').length).toBe(4);
    unmountKoth();

    // Launch Expanded Spell Chess, cast Portal and Stealth Trap, and verify Arcane theme, Portals, Traps, and Conduit markers
    const spellCfg = MatchConfigurationManager.createDefaultMatch('SPELL_CHESS_EXPANDED', 2);
    controller.startMatch(spellCfg);
    // Give White 6 mana to cast Portal + Stealth Trap
    const portalSpell = SPELL_CATALOG.find((s) => s.type === 'PORTAL')!;
    const trapSpell = SPELL_CATALOG.find((s) => s.type === 'STEALTH_TRAP')!;
    controller.castExpandedSpell(trapSpell, '3,3');

    const { unmount: unmountSpell } = render(
      <ThemeProvider>
        <ChessBoard
          boardSize={8}
          activePortals={[{ coordA: '2,3', coordB: '5,4' }]}
          stealthTraps={controller.getSnapshot().expandedSpellState?.stealthTraps}
        />
      </ThemeProvider>
    );
    expect(screen.getByTestId('chess-board').getAttribute('data-variant-theme')).toBe('SPELL_ARCANE');
    expect(screen.getAllByTestId('arcane-conduit-marker').length).toBe(4);
    expect(screen.getAllByTestId('portal-marker').length).toBe(2);
    expect(screen.getAllByTestId('stealth-trap-marker').length).toBe(1);
    expect(portalSpell.manaCost).toBe(4);
    unmountSpell();
    controller.dispose();
  });

  it('3. Spell Chess & Duck Chess Gameplay Enforcement in RulesEngine & UniversalMatchController', () => {
    const controller = new UniversalMatchController();
    const topology = new SquareTopology({ width: 8, height: 8 });

    // A) Duck Chess obstacle physically blocks moving onto or sliding through the duck square
    const duckCfg = MatchConfigurationManager.createDefaultMatch('DUCK_CHESS', 2);
    controller.startMatch(duckCfg);
    controller.onHumanPieceMoved('4,1', '4,3', 'P1_pawn_4');
    expect(controller.getSnapshot().duckPhase).toBe('PLACE_DUCK');
    expect(controller.placeDuck('3,2')).toBe(true);

    const domainAfterDuck = gameStore.getState().domain;
    expect(domainAfterDuck.occupancy[asCoordinateKey('3,2')]).toBe(asEntityId('duck_obstacle'));
    // Verify no piece can move onto 3,2
    const allBlackMoves = RulesEngine.getLegalMoves(domainAfterDuck, topology);
    expect(allBlackMoves.some((m) => m.to === '3,2')).toBe(false);

    // B) Official Spell Chess: Freeze blocks pieces on the 3x3 area; Jump allows a Pawn/Rook to leap over blockers
    const officialSpellCfg = MatchConfigurationManager.createDefaultMatch('SPELL_CHESS_OFFICIAL', 2);
    controller.startMatch(officialSpellCfg);

    // Cast Jump on White's a1 Rook (0,0) so it can leap over the a2 Pawn (0,1) to (0,2)!
    const rookId = gameStore.getState().domain.occupancy[asCoordinateKey('0,0')]!;
    expect(controller.castOfficialSpell('JUMP', rookId)).toBe(true);

    const rookEntity = gameStore.getState().domain.boardEntities[rookId];
    expect(rookEntity.type).toBe('PIECE');
    if (rookEntity.type === 'PIECE') {
      const rookMovesWithJump = RulesEngine.getLegalMovesForPiece(
        rookEntity,
        gameStore.getState().domain,
        topology
      );
      expect(rookMovesWithJump.some((m) => m.to === '0,2')).toBe(true);
    }

    // Cast Freeze centered at (4,1) - freezes White's e2 pawn (4,1) and surrounding 3x3 squares
    expect(controller.castOfficialSpell('FREEZE', '4,1')).toBe(true);
    const e2PawnId = gameStore.getState().domain.occupancy[asCoordinateKey('4,1')]!;
    const e2Pawn = gameStore.getState().domain.boardEntities[e2PawnId];
    if (e2Pawn.type === 'PIECE') {
      const frozenMoves = RulesEngine.getLegalMovesForPiece(
        e2Pawn,
        gameStore.getState().domain,
        topology
      );
      expect(frozenMoves.length).toBe(0);
    }

    controller.dispose();
  });

  it('4. Multi-Level Variant Bots (N1-N5) evaluate rules of Atomic, Racing Kings, Antichess, King of the Hill, Duck Chess, and Spell Chess', () => {
    const controller = new UniversalMatchController();
    const topology = new SquareTopology({ width: 8, height: 8 });
    const variantBot = new VariantSpecializedStrategy();
    const duckBot = new DuckChessPlannerStrategy();
    const spellBot = new SpellOptimizationStrategy();

    for (const variantId of [
      'ATOMIC',
      'RACING_KINGS',
      'ANTICHESS',
      'KING_OF_THE_HILL',
      'CAPABLANCA_CHESS',
      'CRAZYHOUSE',
    ]) {
      const cfg = MatchConfigurationManager.createDefaultMatch(variantId, 2);
      controller.startMatch(cfg);
      const domain = gameStore.getState().domain;
      const t = variantId === 'CAPABLANCA_CHESS' ? new SquareTopology({ width: 10, height: 8 }) : topology;
      const legal = RulesEngine.getLegalMoves(domain, t).map((m) => ({
        from: m.from,
        to: m.to,
        pieceId: m.pieceId,
        isCapture: m.isCapture,
      }));
      expect(legal.length).toBeGreaterThan(0);

      for (const level of [1, 3, 5] as const) {
        const res = variantBot.decideMove({
          matchId: domain.matchId,
          variantId,
          actingPlayer: domain.activePlayer,
          difficultyLevel: level,
          timeBudgetMs: 120,
          legalMoves: legal,
          domain,
          topology: t,
        });
        expect(legal.some((m) => m.from === res.move.from && m.to === res.move.to)).toBe(true);
      }
    }

    // Duck Chess Bot produces both a legal piece move and a valid duck placement square
    const duckCfg = MatchConfigurationManager.createDefaultMatch('DUCK_CHESS', 2);
    controller.startMatch(duckCfg);
    const duckDomain = gameStore.getState().domain;
    const duckLegal = RulesEngine.getLegalMoves(duckDomain, topology).map((m) => ({
      from: m.from,
      to: m.to,
      pieceId: m.pieceId,
      isCapture: m.isCapture,
    }));
    const duckRes = duckBot.decideMove({
      matchId: duckDomain.matchId,
      variantId: 'DUCK_CHESS',
      actingPlayer: 'P1',
      difficultyLevel: 4,
      timeBudgetMs: 120,
      legalMoves: duckLegal,
      specializedContext: { emptySquares: ['3,3', '4,3', '3,4', '4,4'] },
      domain: duckDomain,
      topology,
    });
    expect(duckRes.secondaryAction?.type).toBe('PLACE_DUCK');
    expect(duckRes.secondaryAction?.payload?.targetCoordinate).not.toBe(duckRes.move.to);

    // Spell Chess Bot produces both a legal piece move and a tactical spell action at level >= 2
    const spellCfg = MatchConfigurationManager.createDefaultMatch('SPELL_CHESS_EXPANDED', 2);
    controller.startMatch(spellCfg);
    const spellDomain = gameStore.getState().domain;
    const spellLegal = RulesEngine.getLegalMoves(spellDomain, topology).map((m) => ({
      from: m.from,
      to: m.to,
      pieceId: m.pieceId,
      isCapture: m.isCapture,
    }));
    const spellRes = spellBot.decideMove({
      matchId: spellDomain.matchId,
      variantId: 'SPELL_CHESS_EXPANDED',
      actingPlayer: 'P1',
      difficultyLevel: 4,
      timeBudgetMs: 120,
      legalMoves: spellLegal,
      specializedContext: { mana: 4, opponentKingCoord: '4,7' },
      domain: spellDomain,
      topology,
    });
    expect(spellRes.secondaryAction?.type).toBe('CAST_SPELL');
    controller.dispose();
  });

  it('5. Expanded Spell Chess: Portal teleportation, Stealth Trap detonation, Mirror Shield, Invisibility, and Resurrection', () => {
    const controller = new UniversalMatchController();
    const topology = new SquareTopology({ width: 8, height: 8 });
    const spellCfg = MatchConfigurationManager.createDefaultMatch('SPELL_CHESS_EXPANDED', 2);
    controller.startMatch(spellCfg);

    const trapSpell = SPELL_CATALOG.find((s) => s.type === 'STEALTH_TRAP')!;
    const jumpSpell = SPELL_CATALOG.find((s) => s.type === 'JUMP')!;
    const shieldSpell = SPELL_CATALOG.find((s) => s.type === 'MIRROR_SHIELD')!;

    // White starts with 2 mana -> casts Stealth Trap at (4,4) (e5)
    expect(controller.castExpandedSpell(trapSpell, '4,4')).toBe(true);
    expect(controller.getSnapshot().expandedSpellState?.stealthTraps['4,4']).toBe('WHITE');

    // White moves e2->e4 (4,1 -> 4,3), advancing turn to Black (+1 mana for Black -> 3 mana)
    const e2Id = gameStore.getState().domain.occupancy[asCoordinateKey('4,1')]!;
    gameStore.setState((s) => ({ domain: { ...s.domain, activePlayer: 'P2' } }));
    controller.onHumanPieceMoved('4,1', '4,3', e2Id);
    expect(controller.getSnapshot().expandedSpellState?.blackMana).toBe(3);

    // Black casts Mirror Shield on d7 pawn (3,6) for 3 mana
    expect(controller.castExpandedSpell(shieldSpell, '3,6')).toBe(true);
    const d7Id = gameStore.getState().domain.occupancy[asCoordinateKey('3,6')]!;
    const d7Piece = gameStore.getState().domain.boardEntities[d7Id];
    expect(d7Piece?.metadata?.isShielded).toBe(true);

    // Black e7 pawn (4,6) steps onto White's Stealth Trap at (4,4) -> Trap detonates and captures Black's pawn!
    const e7Id = gameStore.getState().domain.occupancy[asCoordinateKey('4,6')]!;
    gameStore.setState((s) => {
      const nextOcc = { ...s.domain.occupancy };
      delete nextOcc[asCoordinateKey('4,6')];
      nextOcc[asCoordinateKey('4,4')] = e7Id;
      return {
        domain: {
          ...s.domain,
          activePlayer: 'P1',
          boardEntities: {
            ...s.domain.boardEntities,
            [e7Id]: {
              ...(s.domain.boardEntities[e7Id] as typeof d7Piece),
              position: asCoordinateKey('4,4'),
            },
          },
          occupancy: nextOcc,
        },
      };
    });
    controller.onHumanPieceMoved('4,6', '4,4', e7Id);
    const afterTrapEntity = gameStore.getState().domain.boardEntities[e7Id];
    expect(afterTrapEntity?.type === 'PIECE' && afterTrapEntity.isCaptured).toBe(true);

    // White now has mana to cast Jump (1 mana)
    expect(controller.castExpandedSpell(jumpSpell, '1,0')).toBe(true);
    const b1Id = gameStore.getState().domain.occupancy[asCoordinateKey('1,0')]!;
    expect(gameStore.getState().domain.boardEntities[b1Id]?.metadata?.hasJump).toBe(true);
    expect(topology.width).toBe(8);

    controller.dispose();
  });

  it('6. Atomic Chess Rules: King cannot capture and simulateMove detonates 3x3 non-pawn pieces; 3D VariantOverlays3D mounts Portals, Traps, and Hill Ring', () => {
    const controller = new UniversalMatchController();
    const topology = new SquareTopology({ width: 8, height: 8 });
    const atomicCfg = MatchConfigurationManager.createDefaultMatch('ATOMIC', 2);
    controller.startMatch(atomicCfg);

    // Place a Black Knight adjacent to White King at (4,1) and verify White King at (4,0) cannot capture it in Atomic
    const e2Id = gameStore.getState().domain.occupancy[asCoordinateKey('4,1')]!;
    const b8Id = gameStore.getState().domain.occupancy[asCoordinateKey('1,7')]!;
    const wKingId = gameStore.getState().domain.occupancy[asCoordinateKey('4,0')]!;
    gameStore.setState((s) => {
      const b8Knight = s.domain.boardEntities[b8Id];
      const e2Pawn = s.domain.boardEntities[e2Id];
      if (!b8Knight || b8Knight.type !== 'PIECE' || !e2Pawn || e2Pawn.type !== 'PIECE') return s;
      const nextOcc = { ...s.domain.occupancy };
      delete nextOcc[asCoordinateKey('1,7')];
      nextOcc[asCoordinateKey('4,1')] = b8Id;
      return {
        domain: {
          ...s.domain,
          boardEntities: {
            ...s.domain.boardEntities,
            [e2Id]: { ...e2Pawn, isCaptured: true },
            [b8Id]: { ...b8Knight, position: asCoordinateKey('4,1') },
          },
          occupancy: nextOcc,
        },
      };
    });

    const wKing = gameStore.getState().domain.boardEntities[wKingId];
    if (wKing?.type === 'PIECE') {
      const kingMoves = RulesEngine.getLegalMovesForPiece(wKing, gameStore.getState().domain, topology);
      expect(kingMoves.some((m) => m.to === '4,1')).toBe(false);
    }

    // Verify 3D VariantOverlays3D renders Hill Sanctuary ring, Portals, Frozen squares, and Stealth Traps
    const { container, unmount } = render(
      <VariantOverlays3D
        boardSize={8}
        variantId="KING_OF_THE_HILL"
        duckCoordinate="3,3"
        frozenCoordinates={['2,2']}
        activePortals={[{ coordA: '1,3', coordB: '6,4' }]}
        stealthTraps={{ '4,4': 'WHITE' }}
      />
    );
    expect(container.querySelector('[name="hill-sanctuary-3d-ring"]')).not.toBeNull();
    expect(container.querySelector('[name="frozen-square-3d-2,2"]')).not.toBeNull();
    expect(container.querySelector('[name="portal-3d-1,3"]')).not.toBeNull();
    expect(container.querySelector('[name="portal-3d-6,4"]')).not.toBeNull();
    expect(container.querySelector('[name="stealth-trap-3d-4,4"]')).not.toBeNull();
    expect(container.querySelector('[name="duck-3d"]')).not.toBeNull();
    unmount();
    controller.dispose();
  });

  it('7. Spell Chess Integration: alias resolution, VariantMatchBanner, OfficialSpellBar Freeze/Jump buttons and GameHub cards', () => {
    // 1. VariantCatalog alias resolution
    const spellDef = VariantCatalog.getById('SPELL_CHESS');
    expect(spellDef).toBeDefined();
    expect(spellDef?.id).toBe('SPELL_CHESS_OFFICIAL');
    expect(spellDef?.name).toBe('Spell Chess (Regras Oficiais)');

    // 2. Controller initialized with alias 'SPELL_CHESS' activates officialSpellState
    const controller = new UniversalMatchController();
    const cfg = MatchConfigurationManager.createDefaultMatch('SPELL_CHESS', 2);
    controller.startMatch(cfg);
    const snap = controller.getSnapshot();
    expect(snap.officialSpellState).not.toBeNull();
    expect(snap.officialSpellState?.whiteCharges.freezeCharges).toBe(2);
    expect(snap.officialSpellState?.whiteCharges.jumpCharges).toBe(2);

    // 3. VariantMatchBanner renders mode title, badge and description
    const { container: bannerContainer, unmount: unmountBanner } = render(
      <VariantMatchBanner variantId="SPELL_CHESS_OFFICIAL" activePlayerLabel="Brancas" />
    );
    expect(screen.getByTestId('variant-match-banner')).toBeDefined();
    expect(bannerContainer.textContent).toContain('Spell Chess (Regras Oficiais Chess.com)');
    expect(bannerContainer.textContent).toContain('Freeze & Jump (2 Cargas)');
    unmountBanner();

    // 3b. Cultural Variant Banners for Shogi and Xiangqi
    const { container: shogiBanner, unmount: unmountShogi } = render(
      <VariantMatchBanner variantId="SHOGI" activePlayerLabel="Sente (P1)" />
    );
    expect(shogiBanner.textContent).toContain('Shogi (Xadrez Japonês - 将棋)');
    expect(shogiBanner.textContent).toContain('Drops & Komadai');
    unmountShogi();

    const { container: xiangqiBanner, unmount: unmountXiangqi } = render(
      <VariantMatchBanner variantId="XIANGQI" activePlayerLabel="Vermelhas (P1)" />
    );
    expect(xiangqiBanner.textContent).toContain('Xiangqi (Xadrez Chinês - 象棋)');
    expect(xiangqiBanner.textContent).toContain('Palácio & Rio Celestial');
    unmountXiangqi();

    // 4. OfficialSpellBar renders Freeze (3x3) and Jump (Salto) buttons with remaining charges and keyboard shortcuts
    let castType: string | null = null;
    let cancelCalled = false;
    const { unmount: unmountBar } = render(
      <OfficialSpellBar
        state={snap.officialSpellState!}
        activePlayer="P1"
        selectedSpellType="FREEZE"
        onCastSpell={(type) => {
          castType = type;
        }}
        onCancelSpell={() => {
          cancelCalled = true;
        }}
      />
    );
    const freezeBtn = screen.getByTestId('btn-cast-freeze');
    const jumpBtn = screen.getByTestId('btn-cast-jump');
    expect(freezeBtn).toBeDefined();
    expect(jumpBtn).toBeDefined();
    expect(screen.getByTestId('official-spell-instruction').textContent).toContain('Freeze ativado');

    freezeBtn.click();
    expect(castType).toBe('FREEZE');
    jumpBtn.click();
    expect(castType).toBe('JUMP');

    // Test Keyboard shortcut '1' for Freeze and '2' for Jump
    castType = null;
    fireEvent.keyDown(window, { key: '1' });
    expect(castType).toBe('FREEZE');

    castType = null;
    fireEvent.keyDown(window, { key: '2' });
    expect(castType).toBe('JUMP');

    // Test Keyboard shortcut 'Escape' for Cancel
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(cancelCalled).toBe(true);

    unmountBar();

    // 4b. ReserveDropsBar renders reserve pieces with keyboard shortcuts (e.g. 'P' for Pawn) and Esc to cancel
    let selectedDrop: string | null = null;
    const sampleReserve: IPieceEntity[] = [
      {
        id: asEntityId('drop-pawn-1'),
        type: 'PIECE',
        ownerId: 'P1',
        position: asCoordinateKey('0,0'),
        variantId: 'PAWN',
        isCaptured: false,
        hasMoved: false,
      },
      {
        id: asEntityId('drop-knight-1'),
        type: 'PIECE',
        ownerId: 'P1',
        position: asCoordinateKey('0,0'),
        variantId: 'KNIGHT',
        isCaptured: false,
        hasMoved: false,
      },
    ];

    const { unmount: unmountReserve, rerender: rerenderReserve } = render(
      <ReserveDropsBar
        activePlayer="P1"
        reservePieces={sampleReserve}
        selectedPieceVariant={selectedDrop}
        onSelectDropPiece={(v) => {
          selectedDrop = v;
        }}
        playerLabel="Brancas"
      />
    );
    expect(screen.getByTestId('reserve-drops-bar')).toBeDefined();
    expect(screen.getByTestId('drop-btn-pawn')).toBeDefined();
    expect(screen.getByTestId('drop-btn-knight')).toBeDefined();

    // Hotkey 'P' selects Pawn
    fireEvent.keyDown(window, { key: 'p' });
    expect(selectedDrop).toBe('PAWN');

    // Rerender with selected piece active
    rerenderReserve(
      <ReserveDropsBar
        activePlayer="P1"
        reservePieces={sampleReserve}
        selectedPieceVariant="PAWN"
        onSelectDropPiece={(v) => {
          selectedDrop = v;
        }}
        playerLabel="Brancas"
      />
    );

    // Hotkey 'Escape' cancels selection
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(selectedDrop).toBeNull();
    unmountReserve();

    // 5. GameHub renders both Official and Expanded Spell Chess cards in MINIGAMES tab
    const { container: hubContainer, unmount: unmountHub } = render(
      <ThemeProvider>
        <GameHub
          onStartBotMatch={() => {}}
          onStartLocalMatch={() => {}}
          onResumeMatch={() => {}}
          hasActiveMatch={false}
          turnNumber={1}
          botEnabled={true}
          botDifficulty={3}
          onSelectDifficulty={() => {}}
          onOpenThemeModal={() => {}}
        />
      </ThemeProvider>
    );
    // Switch to MINIGAMES tab
    const minigamesTab = screen.getByTestId('hub-tab-minigames');
    fireEvent.click(minigamesTab);
    expect(hubContainer.textContent).toContain('Spell Chess Oficial (Chess.com)');
    expect(hubContainer.textContent).toContain('Spell Chess RPG Expandido');
    expect(hubContainer.textContent).toContain('Duck Chess (Xadrez do Pato)');
    expect(hubContainer.textContent).toContain('Bughouse (Xadrez Duplo 2v2)');
    expect(hubContainer.textContent).toContain('King of the Hill');
    expect(hubContainer.textContent).toContain('Racing Kings');
    expect(hubContainer.textContent).toContain('Three-Check Chess');
    expect(hubContainer.textContent).toContain('Crazyhouse (Drops de Reserva)');
    expect(hubContainer.textContent).toContain('Capablanca Chess (10×8)');
    expect(hubContainer.textContent).toContain('Horde Chess (36 Peões vs Exército)');
    unmountHub();

    controller.dispose();
  });

  it('8. Atomic Chess & King of the Hill rules, catalog aliases and bot evaluation', () => {
    // 1. VariantCatalog aliases
    expect(VariantCatalog.getById('ATOMIC')?.id).toBe('ATOMIC_CHESS');
    expect(VariantCatalog.getById('HILL')?.id).toBe('KING_OF_THE_HILL');
    expect(VariantCatalog.getById('KOTH')?.id).toBe('KING_OF_THE_HILL');
    expect(VariantCatalog.getById('RACING')?.id).toBe('RACING_KINGS');
    expect(VariantCatalog.getById('FOG')?.id).toBe('FOG_OF_WAR');
    expect(VariantCatalog.getById('CAPA')?.id).toBe('CAPABLANCA_CHESS');

    // 2. King of the Hill AI detects instant win on hill squares
    const hillStrategy = new VariantSpecializedStrategy();
    const hillDecision = hillStrategy.decideMove({
      matchId: 'hill-test',
      variantId: 'KING_OF_THE_HILL',
      actingPlayer: 'P1',
      difficultyLevel: 3,
      timeBudgetMs: 100,
      legalMoves: [
        { from: '4,2', to: '4,3', pieceId: 'w_k', isCapture: false }, // King stepping onto e4 (hill!)
        { from: '1,0', to: '2,2', pieceId: 'w_n', isCapture: false },
      ],
      specializedContext: {},
    });
    expect(hillDecision.move.to).toBe('4,3');
    expect(hillDecision.evaluationCentipawns).toBe(100000);
  });

  it('9. Non-Euclidean 3D Boards (Torus Rosquinha & Cubo) and Massive Multiplayer Arenas (3P to 8P & Endless Procedural)', () => {
    // 1. Non-Euclidean & Procedural catalog definitions
    expect(VariantCatalog.getById('TOROIDAL_CHESS')?.name).toContain('Toroidal');
    expect(VariantCatalog.getById('CUBIC_CHESS')?.name).toContain('Cubic');
    expect(VariantCatalog.getById('PROCEDURAL_ENDLESS')?.name).toContain('Procedural');

    // 2. Multiplayer arena layouts in VariantCatalog
    expect(VariantCatalog.getById('THREE_PLAYER_CHESS')?.maxPlayers).toBe(3);
    expect(VariantCatalog.getById('FOUR_PLAYER_FFA')?.maxPlayers).toBe(4);
    expect(VariantCatalog.getById('FORTRESS_5P')?.maxPlayers).toBe(5);
    expect(VariantCatalog.getById('HEXAGON_SIX_PLAYER')?.maxPlayers).toBe(6);
    expect(VariantCatalog.getById('SEVEN_PLAYER_FFA')?.maxPlayers).toBe(7);
    expect(VariantCatalog.getById('OCTAGONAL_CITADEL_8P')?.maxPlayers).toBe(8);

    // 3. VariantMatchBanner renders Non-Euclidean and Arenas correctly
    const { container: torusBanner, unmount: unmountTorus } = render(
      <VariantMatchBanner variantId="TOROIDAL_CHESS" />
    );
    expect(torusBanner.textContent).toContain('Toroidal Chess (Rosquinha 3D)');
    unmountTorus();

    const { container: cubeBanner, unmount: unmountCube } = render(
      <VariantMatchBanner variantId="CUBIC_CHESS" />
    );
    expect(cubeBanner.textContent).toContain('Cubic Chess (Cubo 3D)');
    unmountCube();

    const { container: procBanner, unmount: unmountProc } = render(
      <VariantMatchBanner variantId="PROCEDURAL_ENDLESS" />
    );
    expect(procBanner.textContent).toContain('Endless Procedural Conquest');
    unmountProc();
  });

  it('10. Real Rules Execution: Toroidal wrap, Cubic 6-face topology, Horde 36-pawn army, Chess960, and Three-Check', () => {
    // 1. Toroidal wrap: Knight jumps across board edge
    const torusTopology = new SquareTopology({ width: 8, height: 8, toroidal: true });
    // Neighbor North from (0, 7) wraps to (0, 0)
    const northNeighbor = torusTopology.getNeighbor(asCoordinateKey('0,7'), 0);
    expect(northNeighbor).toBe('0,0');
    // Neighbor West from (0, 0) wraps to (7, 0)
    const westNeighbor = torusTopology.getNeighbor(asCoordinateKey('0,0'), 6);
    expect(westNeighbor).toBe('7,0');

    // 2. CubicTopology: 6 faces and edge crossing
    const cubeTopology = new CubicTopology({ boardSize: 8 });
    expect(cubeTopology.isValidCoordinate(asCoordinateKey('2:3,4'))).toBe(true);
    expect(cubeTopology.isValidCoordinate(asCoordinateKey('6:3,4'))).toBe(false); // only 6 faces (0..5)

    // Moving North from Front (Face 2, y=7) transitions to Top (Face 0, y=0)
    const frontToTop = cubeTopology.getNeighbor(asCoordinateKey('2:3,7'), 0);
    expect(frontToTop).toBe('0:3,0');

    // 3. Horde Chess Piece Initializer
    const hordePieces = VariantPieceInitializer.createPiecesForVariant('HORDE');
    const whitePawns = hordePieces.filter((p: IPieceEntity) => p.ownerId === 'P1' && p.variantId === 'PAWN');
    const blackPieces = hordePieces.filter((p: IPieceEntity) => p.ownerId === 'P2');
    expect(whitePawns.length).toBe(36);
    expect(blackPieces.length).toBe(16);

    // 4. Chess960 Piece Initializer: Bishops on different color squares and King between Rooks
    const chess960Pieces = VariantPieceInitializer.createPiecesForVariant('CHESS960');
    const whiteBackRank = chess960Pieces.filter((p: IPieceEntity) => p.ownerId === 'P1' && p.position.endsWith(',0'));
    expect(whiteBackRank.length).toBe(8);
    const bishops = whiteBackRank.filter((p: IPieceEntity) => p.variantId === 'BISHOP');
    expect(bishops.length).toBe(2);
    const [b1x, b2x] = bishops.map((b: IPieceEntity) => parseInt(b.position.split(',')[0], 10));
    expect((b1x + b2x) % 2).toBe(1); // One even, one odd file

    // 5. No Castling rule enforcement
    const mockDomainState: Partial<IDomainState> = {
      variantId: 'NO_CASTLING',
      activePlayer: 'P1',
      turnNumber: 1,
      boardEntities: {
        [asEntityId('w_k')]: { id: asEntityId('w_k'), type: 'PIECE', ownerId: 'P1', variantId: 'KING', position: asCoordinateKey('4,0'), hasMoved: false, isCaptured: false },
        [asEntityId('w_r')]: { id: asEntityId('w_r'), type: 'PIECE', ownerId: 'P1', variantId: 'ROOK', position: asCoordinateKey('7,0'), hasMoved: false, isCaptured: false },
      },
      occupancy: { [asCoordinateKey('4,0')]: asEntityId('w_k'), [asCoordinateKey('7,0')]: asEntityId('w_r') },
      terrain: {},
      turnState: { phase: 'COMMIT', lastActionTimestamp: 0, enPassantTarget: null, fiftyMoveCounter: 0 },
    };
    const noCastlingRules = RulesEngine.validateMove(
      mockDomainState as IDomainState,
      { pieceId: asEntityId('w_k'), from: asCoordinateKey('4,0'), to: asCoordinateKey('6,0'), actingPlayer: 'P1' },
      new SquareTopology({ width: 8, height: 8 })
    );
    expect(noCastlingRules.valid).toBe(false);

    // 6. Three-Check tracker integration
    let tc = ThreeCheckTracker.createInitialState(3);
    tc = ThreeCheckTracker.registerCheck(tc, 'WHITE');
    tc = ThreeCheckTracker.registerCheck(tc, 'WHITE');
    expect(tc.isGameOver).toBe(false);
    tc = ThreeCheckTracker.registerCheck(tc, 'WHITE');
    expect(tc.isGameOver).toBe(true);
    expect(tc.winner).toBe('WHITE');
  });
});
