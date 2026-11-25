// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { GameHubHeroSection, IGameHubHeroSectionProps } from '../GameHubHeroSection';

if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

describe('Spec 06 § 5, RF-01, RF-06 - GameHubHeroSection Component', () => {
  const defaultProps: IGameHubHeroSectionProps = {
    hasActiveMatch: false,
    isGameOver: false,
    turnNumber: 1,
    activePlayer: 'P1',
    botDifficulty: 2,
    activeDiffName: 'Praticante (1200)',
    effectiveMode: 'idle',
    shouldRender3D: false,
    keyboardActivated: false,
    uiTheme: 'midnight',
    onResumeMatch: vi.fn(),
    onStartBotMatch: vi.fn(),
    onOpenThemeModal: vi.fn(),
    onClockModalOpen: vi.fn(),
    onActivate3D: vi.fn(),
  };

  it('renders editorial typography, highlights strip, and default bot CTA', () => {
    render(<GameHubHeroSection {...defaultProps} />);

    expect(screen.getByText(/Central de Partidas/)).toBeDefined();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Domínio Tático');
    expect(screen.getByText(/5 Níveis de Desafio/)).toBeDefined();
    expect(screen.getByText(/Revisão de Lances/)).toBeDefined();
    expect(screen.getByText(/3 Atmosferas Visuais/)).toBeDefined();

    const botBtn = screen.getByRole('button', { name: /Jogar contra Robô \(Praticante \(1200\)\)/i });
    expect(botBtn).toBeDefined();
    fireEvent.click(botBtn);
    expect(defaultProps.onStartBotMatch).toHaveBeenCalledWith(2);
  });

  it('renders resume session banner and handles match resumption when match is in progress', () => {
    const onResumeMatch = vi.fn();
    render(
      <GameHubHeroSection
        {...defaultProps}
        hasActiveMatch={true}
        isGameOver={false}
        turnNumber={14}
        activePlayer="P2"
        onResumeMatch={onResumeMatch}
      />
    );

    expect(screen.getByText(/Sessão ativa • Turno #14/)).toBeDefined();
    const resumeBtn = screen.getByRole('button', { name: /Retomar Partida \(Turno #14 • Pretas\)/i });
    expect(resumeBtn).toBeDefined();

    fireEvent.click(resumeBtn);
    expect(onResumeMatch).toHaveBeenCalledTimes(1);
  });

  it('renders game over view actions when match is concluded', () => {
    const onResumeMatch = vi.fn();
    const onStartBotMatch = vi.fn();

    render(
      <GameHubHeroSection
        {...defaultProps}
        hasActiveMatch={true}
        isGameOver={true}
        onResumeMatch={onResumeMatch}
        onStartBotMatch={onStartBotMatch}
      />
    );

    const newGameBtn = screen.getByRole('button', { name: /Iniciar Nova Partida vs IA/i });
    const viewFinalBtn = screen.getByRole('button', { name: /Ver Posição Final \(Fim de Jogo\)/i });

    expect(newGameBtn).toBeDefined();
    expect(viewFinalBtn).toBeDefined();

    fireEvent.click(newGameBtn);
    expect(onStartBotMatch).toHaveBeenCalledWith(2);

    fireEvent.click(viewFinalBtn);
    expect(onResumeMatch).toHaveBeenCalledTimes(1);
  });

  it('handles theme customization modal button click', () => {
    const onOpenThemeModal = vi.fn();
    render(<GameHubHeroSection {...defaultProps} onOpenThemeModal={onOpenThemeModal} />);

    const themeBtn = screen.getByRole('button', { name: /Temas & Peças/i });
    fireEvent.click(themeBtn);
    expect(onOpenThemeModal).toHaveBeenCalledTimes(1);
  });

  it('handles clock/staging modal button click', () => {
    const onClockModalOpen = vi.fn();
    render(<GameHubHeroSection {...defaultProps} onClockModalOpen={onClockModalOpen} />);

    const clockBtn = screen.getByRole('button', { name: /Relógio & Modos/i });
    fireEvent.click(clockBtn);
    expect(onClockModalOpen).toHaveBeenCalledTimes(1);
  });

  it('handles pointer and keyboard 3D activation in idle mode', () => {
    const onActivate3D = vi.fn();
    render(
      <GameHubHeroSection
        {...defaultProps}
        effectiveMode="idle"
        shouldRender3D={false}
        onActivate3D={onActivate3D}
      />
    );

    const triggerBtn = screen.getByTestId('showcase-fallback-trigger');
    expect(triggerBtn).toBeDefined();

    fireEvent.click(triggerBtn);
    expect(onActivate3D).toHaveBeenCalledWith('pointer');

    fireEvent.keyDown(triggerBtn, { key: 'Enter' });
    expect(onActivate3D).toHaveBeenCalledWith('keyboard');
  });

  it('renders static fallback container when 3D is explicitly off', () => {
    render(
      <GameHubHeroSection
        {...defaultProps}
        effectiveMode="off"
        shouldRender3D={false}
      />
    );

    expect(screen.getByTestId('showcase-static-fallback')).toBeDefined();
  });
});
