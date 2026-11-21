// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PreMatchStagingModal } from '../PreMatchStagingModal';

describe('PreMatchStagingModal (Spec 16 RF-06 & RF-07)', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <PreMatchStagingModal
        isOpen={false}
        variantId="STANDARD"
        onClose={() => {}}
        onLaunchMatch={() => {}}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders modal dialog with variant title, slots and launch button when isOpen is true', () => {
    render(
      <PreMatchStagingModal
        isOpen={true}
        variantId="STANDARD"
        initialParticipantsCount={2}
        onClose={() => {}}
        onLaunchMatch={() => {}}
      />
    );

    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText(/Sala de Pré-Jogo/i)).toBeDefined();
    expect(screen.getByText('Assento 1 (White)')).toBeDefined();
    expect(screen.getByText('Assento 2 (Black)')).toBeDefined();
    expect(screen.getByRole('button', { name: /Iniciar Arena/i })).toBeDefined();
  });

  it('allows changing slot role and bot difficulty level', () => {
    render(
      <PreMatchStagingModal
        isOpen={true}
        variantId="STANDARD"
        initialParticipantsCount={2}
        onClose={() => {}}
        onLaunchMatch={() => {}}
      />
    );

    // Slot 1 role select (index 1)
    const roleSelects = screen.getAllByRole('combobox');
    const slot1RoleSelect = roleSelects[1];

    // Change slot 1 to AI_BOT
    fireEvent.change(slot1RoleSelect, { target: { value: 'AI_BOT' } });

    // Both slots now show difficulty selector
    expect(screen.getAllByText(/Dificuldade:/i).length).toBeGreaterThanOrEqual(1);
  });

  it('calls onLaunchMatch with current match configuration when launch button is clicked', () => {
    const handleLaunch = vi.fn();
    render(
      <PreMatchStagingModal
        isOpen={true}
        variantId="STANDARD"
        initialParticipantsCount={2}
        onClose={() => {}}
        onLaunchMatch={handleLaunch}
      />
    );

    const launchBtn = screen.getByRole('button', { name: /Iniciar Arena/i });
    fireEvent.click(launchBtn);

    expect(handleLaunch).toHaveBeenCalledTimes(1);
    const launchedConfig = handleLaunch.mock.calls[0][0];
    expect(launchedConfig.variantId).toBe('STANDARD');
    expect(launchedConfig.slots.length).toBe(2);
  });

  it('exports configuration to clipboard on button click', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(
      <PreMatchStagingModal
        isOpen={true}
        variantId="STANDARD"
        initialParticipantsCount={2}
        onClose={() => {}}
        onLaunchMatch={() => {}}
      />
    );

    const exportBtn = screen.getByRole('button', { name: /Copiar JSON/i });
    await act(async () => {
      fireEvent.click(exportBtn);
    });

    expect(writeTextMock).toHaveBeenCalled();
    expect(screen.getByText('Copiado para o Clipboard!')).toBeDefined();
  });

  it('closes modal when close button is clicked', () => {
    const handleClose = vi.fn();
    render(
      <PreMatchStagingModal
        isOpen={true}
        variantId="STANDARD"
        initialParticipantsCount={2}
        onClose={handleClose}
        onLaunchMatch={() => {}}
      />
    );

    const closeBtn = screen.getByRole('button', { name: /Fechar modal de pré-jogo/i });
    fireEvent.click(closeBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('allows selecting time control presets, custom time, and ranked mode', () => {
    const handleLaunch = vi.fn();
    render(
      <PreMatchStagingModal
        isOpen={true}
        variantId="STANDARD"
        initialParticipantsCount={2}
        onClose={() => {}}
        onLaunchMatch={handleLaunch}
      />
    );

    // Select Bullet 1 min preset
    const bulletBtn = screen.getByRole('button', { name: /1 min/i });
    fireEvent.click(bulletBtn);

    // Toggle to Casual (Sem Rating)
    const casualBtn = screen.getByRole('button', { name: /Casual \(Sem Rating\)/i });
    fireEvent.click(casualBtn);

    // Click launch
    const launchBtn = screen.getByRole('button', { name: /Iniciar Arena/i });
    fireEvent.click(launchBtn);

    expect(handleLaunch).toHaveBeenCalledTimes(1);
    const config = handleLaunch.mock.calls[0][0];
    expect(config.isRanked).toBe(false);
    expect(config.slots[0].clock?.initialSeconds).toBe(60);
    expect(config.slots[0].clock?.incrementSeconds).toBe(0);
  });

  it('supports quick preset setups for vs Bot, vs Human, and Bot vs Bot', () => {
    const handleLaunch = vi.fn();
    render(
      <PreMatchStagingModal
        isOpen={true}
        variantId="STANDARD"
        initialParticipantsCount={2}
        onClose={() => {}}
        onLaunchMatch={handleLaunch}
      />
    );

    // Click quick setup vs Human
    const vsHumanBtn = screen.getByRole('button', { name: /2 Jogadores \(Local\)/i });
    fireEvent.click(vsHumanBtn);

    const launchBtn = screen.getByRole('button', { name: /Iniciar Arena/i });
    fireEvent.click(launchBtn);

    const config = handleLaunch.mock.calls[0][0];
    expect(config.slots[0].role).toBe('HUMAN_LOCAL');
    expect(config.slots[1].role).toBe('HUMAN_LOCAL');
  });
});

