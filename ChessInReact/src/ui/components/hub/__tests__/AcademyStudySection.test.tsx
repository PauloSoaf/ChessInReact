// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AcademyStudySection } from '../AcademyStudySection';
import { AcademyStudyEngine } from '../../../../analysis/study/AcademyStudyEngine';

describe('AcademyStudySection Component (Spec 12 & Spec 06 Modularization)', () => {
  it('renders progress banner, category filters, and exercise cards', () => {
    render(<AcademyStudySection />);

    expect(screen.getByText('Progresso do Treinamento')).toBeDefined();
    expect(screen.getByText('Fundamentos')).toBeDefined();
    expect(screen.getByText('Tática')).toBeDefined();
    expect(screen.getByText('Mates')).toBeDefined();
    expect(screen.getByText('Finais')).toBeDefined();

    // Verify first exercise prompt is visible
    expect(screen.getByText(AcademyStudyEngine.EXERCISES[0].title)).toBeDefined();
  });

  it('triggers onOpenTournamentModal callback when tournament button is clicked', () => {
    const handleTournament = vi.fn();
    render(<AcademyStudySection onOpenTournamentModal={handleTournament} />);

    const tournamentBtn = screen.getByTestId('btn-open-tournament-arena');
    fireEvent.click(tournamentBtn);

    expect(handleTournament).toHaveBeenCalledTimes(1);
  });

  it('filters exercises by category', () => {
    render(<AcademyStudySection />);

    const tacticsBtn = screen.getByText('Tática');
    fireEvent.click(tacticsBtn);

    // Should display tactical exercises
    const tacticalEx = AcademyStudyEngine.EXERCISES.find((e) => e.category === 'TACTICS');
    if (tacticalEx) {
      expect(screen.getByText(tacticalEx.title)).toBeDefined();
    }
  });

  it('toggles hint and verifies correct answer', () => {
    render(<AcademyStudySection />);

    const firstEx = AcademyStudyEngine.EXERCISES[0];
    const hintBtn = screen.getAllByText('Ver Dica')[0];
    fireEvent.click(hintBtn);

    expect(screen.getByText(new RegExp(firstEx.hint))).toBeDefined();

    // Input answer and verify
    const input = screen.getAllByPlaceholderText('Lance em SAN (ex: e4, Nf3, Ra8#)')[0];
    fireEvent.change(input, { target: { value: firstEx.solutionSequence[0] } });

    const verifyBtn = screen.getAllByText('Verificar')[0];
    fireEvent.click(verifyBtn);

    // Feedback should show success message
    const statusBoxes = screen.getAllByRole('status');
    expect(statusBoxes.length).toBeGreaterThan(0);
  });

  it('reveals didactic solution explanation when requested', () => {
    render(<AcademyStudySection />);

    const firstEx = AcademyStudyEngine.EXERCISES[0];
    const solutionBtn = screen.getAllByText('Ver Resposta (Estudo)')[0];
    fireEvent.click(solutionBtn);

    const solutionCallout = document.getElementById(`solution-callout-${firstEx.id}`);
    expect(solutionCallout).not.toBeNull();
    expect(solutionCallout?.textContent).toContain('Solução Didática:');
  });
});
