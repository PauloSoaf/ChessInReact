// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SpellChessEngine, SPELL_CATALOG, MAX_MANA_CAP, INITIAL_MANA } from '../SpellChessEngine';
import { SpellCardHand } from '../SpellCardHand';

describe('Spec 12 - SpellChessEngine (S12-RF07, S12-RNF-16)', () => {
  it('creates clean initial state with 2 mana and 6 max mana according to Spec 12 § 5.1', () => {
    const state = SpellChessEngine.createInitialState();
    expect(state.whiteMana).toBe(INITIAL_MANA);
    expect(state.blackMana).toBe(INITIAL_MANA);
    expect(state.maxMana).toBe(MAX_MANA_CAP);
    expect(Object.keys(state.frozenCoordinates)).toHaveLength(0);
    expect(state.activePortals).toHaveLength(0);
    expect(Object.keys(state.stealthTraps)).toHaveLength(0);
    expect(state.invisiblePieces).toHaveLength(0);
    expect(SPELL_CATALOG).toHaveLength(7);
  });

  it('increments mana by +1 per turn up to MAX_MANA_CAP (6)', () => {
    let state = SpellChessEngine.createInitialState();
    
    // Turn 1 (White)
    state = SpellChessEngine.advanceTurn(state, 'WHITE');
    expect(state.whiteMana).toBe(3);
    expect(state.blackMana).toBe(2);

    // Turn 2 (Black)
    state = SpellChessEngine.advanceTurn(state, 'BLACK');
    expect(state.whiteMana).toBe(3);
    expect(state.blackMana).toBe(3);

    // Accumulate to cap
    for (let i = 0; i < 10; i++) {
      state = SpellChessEngine.advanceTurn(state, 'WHITE');
      state = SpellChessEngine.advanceTurn(state, 'BLACK');
    }
    expect(state.whiteMana).toBe(MAX_MANA_CAP);
    expect(state.blackMana).toBe(MAX_MANA_CAP);
  });

  it('validates mana costs and rejects casting when mana is insufficient', () => {
    const state = SpellChessEngine.createInitialState(); // 2 mana
    expect(SpellChessEngine.canCast(state, 'WHITE', 'JUMP').allowed).toBe(true); // cost 1
    expect(SpellChessEngine.canCast(state, 'WHITE', 'FREEZE').allowed).toBe(true); // cost 2
    expect(SpellChessEngine.canCast(state, 'WHITE', 'PORTAL').allowed).toBe(false); // cost 4
    expect(SpellChessEngine.canCast(state, 'WHITE', 'PORTAL').reason).toContain('Mana insuficiente');
  });

  it('executes Freeze spell, deducting mana and freezing coordinates for 1 turn', () => {
    const initial = SpellChessEngine.createInitialState();
    const state = SpellChessEngine.castFreeze(initial, 'WHITE', ['e4', 'e5', 'd4', 'd5']);

    expect(state.whiteMana).toBe(0); // 2 - 2
    expect(SpellChessEngine.isCoordinateFrozen(state, 'e4')).toBe(true);
    expect(SpellChessEngine.isCoordinateFrozen(state, 'a1')).toBe(false);

    // Advancing turns decrements frozen cooldowns
    const stateNextTurn = SpellChessEngine.advanceTurn(state, 'BLACK');
    expect(SpellChessEngine.isCoordinateFrozen(stateNextTurn, 'e4')).toBe(false);
  });

  it('executes Jump spell, enabling obstacle leaping for selected piece', () => {
    const initial = SpellChessEngine.createInitialState();
    const state = SpellChessEngine.castJump(initial, 'WHITE', 'w_pawn_e2');

    expect(state.whiteMana).toBe(1); // 2 - 1
    expect(SpellChessEngine.hasJumpAbility(state, 'w_pawn_e2')).toBe(true);
    expect(SpellChessEngine.hasJumpAbility(state, 'w_rook_a1')).toBe(false);

    // Decrements after turn
    const stateNext = SpellChessEngine.advanceTurn(state, 'BLACK');
    expect(SpellChessEngine.hasJumpAbility(stateNext, 'w_pawn_e2')).toBe(false);
  });

  it('executes Invisibility spell for 2 turns', () => {
    let state = SpellChessEngine.createInitialState();
    state = SpellChessEngine.advanceTurn(state, 'WHITE'); // whiteMana = 3
    state = SpellChessEngine.castInvisibility(state, 'WHITE', 'w_knight_b1');

    expect(state.whiteMana).toBe(0); // 3 - 3
    expect(SpellChessEngine.isPieceInvisible(state, 'w_knight_b1')).toBe(true);
  });

  it('executes Portal spell and transports pieces bidirectionally', () => {
    let state = SpellChessEngine.createInitialState();
    state = SpellChessEngine.advanceTurn(state, 'WHITE');
    state = SpellChessEngine.advanceTurn(state, 'WHITE'); // whiteMana = 4

    state = SpellChessEngine.castPortal(state, 'WHITE', 'c3', 'f6');
    expect(state.whiteMana).toBe(0);
    expect(state.activePortals).toHaveLength(1);

    // Step on c3 -> outputs f6
    expect(SpellChessEngine.resolvePortalDestination(state, 'c3')).toBe('f6');
    // Step on f6 -> outputs c3
    expect(SpellChessEngine.resolvePortalDestination(state, 'f6')).toBe('c3');
    // Step on unrelated coord -> null
    expect(SpellChessEngine.resolvePortalDestination(state, 'e4')).toBeNull();
  });

  it('rejects portal creation between identical coordinates', () => {
    let state = SpellChessEngine.createInitialState();
    state = SpellChessEngine.advanceTurn(state, 'WHITE');
    state = SpellChessEngine.advanceTurn(state, 'WHITE'); // 4 mana

    expect(() => SpellChessEngine.castPortal(state, 'WHITE', 'e4', 'e4')).toThrow(
      'Portais vinculados devem ocupar coordenadas distintas.'
    );
  });

  it('plants Stealth Trap and detonates only upon enemy stepping', () => {
    const initial = SpellChessEngine.createInitialState();
    const state = SpellChessEngine.castStealthTrap(initial, 'WHITE', 'e5');

    expect(state.whiteMana).toBe(0);
    expect(state.stealthTraps['e5']).toBe('WHITE');

    // Friendly piece steps on e5 -> no detonation
    const friendlyStep = SpellChessEngine.resolveTrapTrigger(state, 'e5', 'WHITE');
    expect(friendlyStep.detonated).toBe(false);
    expect(friendlyStep.updatedState.stealthTraps['e5']).toBe('WHITE');

    // Opponent piece steps on e5 -> detonates and consumes trap
    const enemyStep = SpellChessEngine.resolveTrapTrigger(state, 'e5', 'BLACK');
    expect(enemyStep.detonated).toBe(true);
    expect(enemyStep.updatedState.stealthTraps['e5']).toBeUndefined();
  });

  it('executes Mirror Shield on piece and retains protection for 3 turns', () => {
    let state = SpellChessEngine.createInitialState();
    state = SpellChessEngine.advanceTurn(state, 'WHITE'); // 3 mana
    state = SpellChessEngine.castMirrorShield(state, 'WHITE', 'w_king_e1');

    expect(state.whiteMana).toBe(0);
    expect(SpellChessEngine.isPieceShielded(state, 'w_king_e1')).toBe(true);

    // 1 turn passed
    state = SpellChessEngine.advanceTurn(state, 'BLACK');
    expect(SpellChessEngine.isPieceShielded(state, 'w_king_e1')).toBe(true);

    // 2 turns passed
    state = SpellChessEngine.advanceTurn(state, 'WHITE');
    expect(SpellChessEngine.isPieceShielded(state, 'w_king_e1')).toBe(true);

    // 3 turns passed -> expired
    state = SpellChessEngine.advanceTurn(state, 'BLACK');
    expect(SpellChessEngine.isPieceShielded(state, 'w_king_e1')).toBe(false);
  });
});

describe('Spec 12 - SpellCardHand Component (UI/UX)', () => {
  it('renders mana counter, crystal orbs and handles spell selection', () => {
    const state = SpellChessEngine.createInitialState(); // 2 mana
    const handleSelect = vi.fn();

    render(
      <SpellCardHand
        state={state}
        activePlayer="WHITE"
        onSelectSpell={handleSelect}
        selectedSpellType="FREEZE"
      />
    );

    expect(screen.getByRole('region', { name: /Mão de Feitiços/i })).toBeDefined();
    expect(screen.getByText('2 / 6')).toBeDefined();

    // FREEZE is affordable (cost 2)
    const freezeButton = screen.getByLabelText(/Congelamento.*Custo: 2 Mana/i);
    expect(freezeButton).toBeDefined();
    expect((freezeButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(freezeButton);
    expect(handleSelect).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'FREEZE' })
    );

    // PORTAL is unaffordable (cost 4) -> button must be disabled
    const portalButton = screen.getByLabelText(/Portal Dimensional.*Custo: 4 Mana/i);
    expect(portalButton).toBeDefined();
    expect((portalButton as HTMLButtonElement).disabled).toBe(true);
  });
});
