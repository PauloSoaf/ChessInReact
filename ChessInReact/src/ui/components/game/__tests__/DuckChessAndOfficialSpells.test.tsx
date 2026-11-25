// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DuckChessBanner } from '../DuckChessBanner';
import { OfficialSpellBar } from '../OfficialSpellBar';
import { IOfficialSpellState } from '../../../../engine/variants/spells/OfficialSpellEngine';

describe('Spec 13 RF-13-01 & RF-13-02 - DuckChessBanner & OfficialSpellBar Components', () => {
  describe('DuckChessBanner', () => {
    it('renders Phase 1 (Move Piece) with instruction and null duck coordinate', () => {
      render(
        <DuckChessBanner
          duckCoordinate={null}
          duckPhase="PIECE_MOVE"
          activePlayerLabel="Brancas"
        />
      );

      expect(screen.getByTestId('duck-chess-banner')).toBeDefined();
      expect(screen.getByText('Duck Chess • Brancas')).toBeDefined();
      expect(screen.getByText(/Fase 1: Execute seu movimento legal de peça\./)).toBeDefined();
      expect(screen.getByText('Fora do Tabuleiro')).toBeDefined();
    });

    it('renders Phase 2 (Place Duck) with prominent style and placed coordinate', () => {
      render(
        <DuckChessBanner
          duckCoordinate="e4"
          duckPhase="PLACE_DUCK"
          activePlayerLabel="Pretas"
        />
      );

      const banner = screen.getByTestId('duck-chess-banner');
      expect(banner).toBeDefined();
      expect(screen.getByText('Duck Chess • Pretas')).toBeDefined();
      expect(
        screen.getByText(/Fase 2: Clique em qualquer casa vazia para posicionar o pato/)
      ).toBeDefined();
      expect(screen.getByText('E4')).toBeDefined();
    });
  });

  describe('OfficialSpellBar', () => {
    const mockState: IOfficialSpellState = {
      whiteCharges: {
        freezeCharges: 2,
        freezeCooldownTurns: 0,
        jumpCharges: 2,
        jumpCooldownTurns: 0,
      },
      blackCharges: {
        freezeCharges: 1,
        freezeCooldownTurns: 2,
        jumpCharges: 0,
        jumpCooldownTurns: 0,
      },
      activeFrozenCoordinates: {},
      activeJumpPieceIds: {},
    };

    it('renders crystal charges and buttons for Freeze and Jump', () => {
      render(
        <OfficialSpellBar
          state={mockState}
          activePlayer="P1"
        />
      );

      expect(screen.getByTestId('official-spell-bar')).toBeDefined();
      expect(screen.getByTestId('btn-cast-freeze')).toBeDefined();
      expect(screen.getByTestId('btn-cast-jump')).toBeDefined();
    });

    it('triggers onCastSpell when clicking spell buttons', () => {
      const onCastSpell = vi.fn();
      render(
        <OfficialSpellBar
          state={mockState}
          activePlayer="P1"
          onCastSpell={onCastSpell}
        />
      );

      const freezeBtn = screen.getByTestId('btn-cast-freeze');
      fireEvent.click(freezeBtn);
      expect(onCastSpell).toHaveBeenCalledWith('FREEZE');

      const jumpBtn = screen.getByTestId('btn-cast-jump');
      fireEvent.click(jumpBtn);
      expect(onCastSpell).toHaveBeenCalledWith('JUMP');
    });

    it('responds to keyboard hotkeys 1, 2 and Escape', () => {
      const onCastSpell = vi.fn();
      const onCancelSpell = vi.fn();

      render(
        <OfficialSpellBar
          state={mockState}
          activePlayer="P1"
          onCastSpell={onCastSpell}
          onCancelSpell={onCancelSpell}
          selectedSpellType="FREEZE"
        />
      );

      fireEvent.keyDown(window, { key: '1' });
      expect(onCastSpell).toHaveBeenCalledWith('FREEZE');

      fireEvent.keyDown(window, { key: '2' });
      expect(onCastSpell).toHaveBeenCalledWith('JUMP');

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onCancelSpell).toHaveBeenCalled();
    });

    it('displays cooldown turns for opponent or inactive spell', () => {
      render(
        <OfficialSpellBar
          state={mockState}
          activePlayer="P2"
        />
      );

      // Black player has freeze on cooldown (2 turns)
      expect(screen.getByText(/2\s+rodadas/)).toBeDefined();
      // Black player has 0 jump charges: jump button is disabled
      const jumpBtn = screen.getByTestId('btn-cast-jump') as HTMLButtonElement;
      expect(jumpBtn.disabled).toBe(true);
      expect(jumpBtn.title).toContain('Sem cargas restantes');
    });
  });
});
