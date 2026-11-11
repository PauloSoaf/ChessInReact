import { describe, it, expect, beforeEach } from 'vitest';
import { AcademyStudyEngine } from '../study/AcademyStudyEngine';

describe('Spec 12 & Spec 06 - AcademyStudyEngine Suite', () => {
  beforeEach(() => {
    AcademyStudyEngine.resetProgress();
  });

  it('provides structured curriculum covering fundamentals, tactics, checkmates, and endgames', () => {
    const curriculum = AcademyStudyEngine.CURRICULUM;
    expect(curriculum.length).toBeGreaterThanOrEqual(4);

    const categories = curriculum.map((c) => c.category);
    expect(categories).toContain('FUNDAMENTALS');
    expect(categories).toContain('TACTICS');
    expect(categories).toContain('CHECKMATES');
    expect(categories).toContain('ENDGAMES');

    for (const topic of curriculum) {
      expect(topic.title).toBeDefined();
      expect(topic.keyPrinciples.length).toBeGreaterThan(0);
      expect(topic.exerciseIds.length).toBeGreaterThan(0);
    }
  });

  it('provides curated interactive exercises with hints and solution explanations', () => {
    const exercises = AcademyStudyEngine.EXERCISES;
    expect(exercises.length).toBeGreaterThanOrEqual(5);

    for (const ex of exercises) {
      expect(ex.id).toBeDefined();
      expect(ex.prompt).toBeDefined();
      expect(ex.hint).toBeDefined();
      expect(ex.solutionExplanation).toBeDefined();
      expect(ex.solutionSequence.length).toBeGreaterThan(0);
    }
  });

  it('verifies correct moves and updates completion stats', () => {
    const statsBefore = AcademyStudyEngine.getAcademyStats();
    expect(statsBefore.completedCount).toBe(0);

    // Verify correct move on center occupation exercise (e4)
    const outcome = AcademyStudyEngine.verifyMove('ex_center_01', 0, 'e4');
    expect(outcome.isCorrect).toBe(true);
    expect(outcome.isComplete).toBe(true);
    expect(outcome.feedback).toContain('Excelente');

    const statsAfter = AcademyStudyEngine.getAcademyStats();
    expect(statsAfter.completedCount).toBe(1);
    expect(statsAfter.completionPercentage).toBeGreaterThan(0);
  });

  it('provides constructive feedback and hint on incorrect moves', () => {
    const outcome = AcademyStudyEngine.verifyMove('ex_center_01', 0, 'h4');
    expect(outcome.isCorrect).toBe(false);
    expect(outcome.isComplete).toBe(false);
    expect(outcome.feedback).toContain('Lance incorreto');
    expect(outcome.feedback).toContain('Dica:');
  });

  it('handles non-existent exercise ID gracefully', () => {
    const outcome = AcademyStudyEngine.verifyMove('ex_unknown_999', 0, 'e4');
    expect(outcome.isCorrect).toBe(false);
    expect(outcome.feedback).toContain('não encontrado');
  });
});

