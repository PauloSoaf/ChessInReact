// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ClassicModesSection } from '../ClassicModesSection';
import { DIFFICULTY_META } from '../difficultyTypes';
import { ThemeProvider } from '../../../theme/ThemeContext';

describe('ClassicModesSection Suite (Spec 06 RF-01, RF-02, RF-03)', () => {
  const defaultProps = {
    botEnabled: false,
    botDifficulty: 3,
    onSelectDifficulty: vi.fn(),
    onStartBotMatch: vi.fn(),
    onStartLocalMatch: vi.fn(),
    onResumeMatch: vi.fn(),
    hasActiveMatch: false,
    turnNumber: 1,
    onOpenStagingModal: vi.fn(),
  };

  it('renders Bot Match and Pass & Play cards with all 5 difficulty levels', () => {
    render(
      <ThemeProvider>
        <ClassicModesSection {...defaultProps} />
      </ThemeProvider>
    );

    expect(screen.getByText('Partida contra Robô (IA)')).toBeDefined();
    expect(screen.getByText('Duelo Local (Pass & Play)')).toBeDefined();

    for (const diff of DIFFICULTY_META) {
      expect(screen.getByText(`N${diff.level}`)).toBeDefined();
    }
  });

  it('triggers onSelectDifficulty when a difficulty option is clicked', () => {
    const onSelectDifficulty = vi.fn();
    render(
      <ThemeProvider>
        <ClassicModesSection {...defaultProps} onSelectDifficulty={onSelectDifficulty} />
      </ThemeProvider>
    );

    const n5Button = screen.getByText('N5');
    fireEvent.click(n5Button);

    expect(onSelectDifficulty).toHaveBeenCalledWith(5);
  });

  it('triggers onStartBotMatch when Start Match vs AI is clicked', () => {
    const onStartBotMatch = vi.fn();
    render(
      <ThemeProvider>
        <ClassicModesSection {...defaultProps} onStartBotMatch={onStartBotMatch} />
      </ThemeProvider>
    );

    const startBotBtn = screen.getByText(/Iniciar Nova Partida vs IA/i);
    fireEvent.click(startBotBtn);

    expect(onStartBotMatch).toHaveBeenCalledWith(3);
  });

  it('triggers onStartLocalMatch when Start Local Match is clicked', () => {
    const onStartLocalMatch = vi.fn();
    render(
      <ThemeProvider>
        <ClassicModesSection {...defaultProps} onStartLocalMatch={onStartLocalMatch} />
      </ThemeProvider>
    );

    const startLocalBtn = screen.getByText('Iniciar Duelo Local (2 Jogadores)');
    fireEvent.click(startLocalBtn);

    expect(onStartLocalMatch).toHaveBeenCalledTimes(1);
  });

  it('triggers onOpenStagingModal when Personalizar Relógio is clicked', () => {
    const onOpenStagingModal = vi.fn();
    const { container } = render(
      <ThemeProvider>
        <ClassicModesSection {...defaultProps} onOpenStagingModal={onOpenStagingModal} />
      </ThemeProvider>
    );

    const botClockBtn = container.querySelector('#hub-card-btn-clock-bot');
    expect(botClockBtn).not.toBeNull();
    fireEvent.click(botClockBtn!);
    expect(onOpenStagingModal).toHaveBeenCalledWith('STANDARD', 2);

    const localClockBtn = container.querySelector('#hub-btn-clock-local');
    expect(localClockBtn).not.toBeNull();
    fireEvent.click(localClockBtn!);
    expect(onOpenStagingModal).toHaveBeenCalledWith('STANDARD', 2);
    expect(onOpenStagingModal).toHaveBeenCalledTimes(2);
  });

  it('renders resume buttons when there is an active match in progress', () => {
    const onResumeMatch = vi.fn();
    render(
      <ThemeProvider>
        <ClassicModesSection
          {...defaultProps}
          hasActiveMatch={true}
          botEnabled={true}
          turnNumber={7}
          onResumeMatch={onResumeMatch}
        />
      </ThemeProvider>
    );

    const resumeBtn = screen.getByText('Continuar contra Bot (Turno #7)');
    expect(resumeBtn).toBeDefined();

    fireEvent.click(resumeBtn);
    expect(onResumeMatch).toHaveBeenCalledTimes(1);
  });
});
