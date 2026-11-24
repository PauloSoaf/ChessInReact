// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MinigamesCatalogSection } from '../MinigamesCatalogSection';

describe('Spec 12/Spec 13 - MinigamesCatalogSection Component', () => {
  const defaultProps = {
    onLaunchMinigame: vi.fn(),
    onStartBotMatch: vi.fn(),
    botDifficulty: 2,
    onOpenStagingModal: vi.fn(),
  };

  it('renders all catalog minigames with titles and badges', () => {
    render(<MinigamesCatalogSection {...defaultProps} />);

    expect(screen.getByText('Puzzle Rush & Sobrevivência')).toBeDefined();
    expect(screen.getByText('Spell Chess Oficial (Chess.com)')).toBeDefined();
    expect(screen.getByText('Duck Chess (Xadrez do Pato)')).toBeDefined();
    expect(screen.getByText('Bughouse (Xadrez Duplo 2v2)')).toBeDefined();
    expect(screen.getByText('Atomic Chess (Xadrez Atômico)')).toBeDefined();
    expect(screen.getByText('Horde Chess (36 Peões vs Exército)')).toBeDefined();
    expect(screen.getByText('Capablanca Chess (10×8)')).toBeDefined();
  });

  it('triggers onLaunchMinigame when clicking Puzzle Rush', () => {
    const onLaunchMinigame = vi.fn();
    render(<MinigamesCatalogSection {...defaultProps} onLaunchMinigame={onLaunchMinigame} />);

    const btn = screen.getByText('Jogar Puzzle Rush');
    fireEvent.click(btn);

    expect(onLaunchMinigame).toHaveBeenCalledWith('puzzle_rush');
  });

  it('triggers onOpenStagingModal when clicking Duck Chess', () => {
    const onOpenStaging = vi.fn();
    render(<MinigamesCatalogSection {...defaultProps} onOpenStagingModal={onOpenStaging} />);

    const btn = screen.getByText('Configurar / Jogar Duck Chess');
    fireEvent.click(btn);

    expect(onOpenStaging).toHaveBeenCalledWith('DUCK_CHESS', 2);
  });
});

