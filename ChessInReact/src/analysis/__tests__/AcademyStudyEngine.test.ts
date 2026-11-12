import { describe, it, expect, beforeEach } from 'vitest';
import { AcademyStudyEngine } from '../study/AcademyStudyEngine';

describe('Spec 12 & Spec 06 - AcademyStudyEngine Suite & Step Progression (Audit Patch 5)', () => {
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

  it('provides curated interactive exercises with valid steps and solution explanations', () => {
    const exercises = AcademyStudyEngine.EXERCISES;
    expect(exercises.length).toBeGreaterThanOrEqual(5);

    for (const ex of exercises) {
      expect(ex.id).toBeDefined();
      expect(ex.prompt).toBeDefined();
      expect(ex.hint).toBeDefined();
      expect(ex.solutionExplanation).toBeDefined();
      expect(ex.steps.length).toBeGreaterThan(0);
      expect(ex.solutionSequence.length).toBeGreaterThan(0);
    }
  });

  it('verifies correct moves and updates completion stats only when fully solved', () => {
    const statsBefore = AcademyStudyEngine.getAcademyStats();
    expect(statsBefore.completedExercises).toBe(0);

    // Verify correct move on center occupation exercise (e4)
    const outcome = AcademyStudyEngine.verifyMove('ex_center_01', 0, 'e4');
    expect(outcome.isCorrect).toBe(true);
    expect(outcome.isComplete).toBe(true);
    expect(outcome.feedback).toContain('Excelente');

    const statsAfter = AcademyStudyEngine.getAcademyStats();
    expect(statsAfter.completedExercises).toBe(1);
    expect(statsAfter.completionPercentage).toBeGreaterThan(0);
  });

  it('enforces multi-step sequence progression: step 0 does not complete exercise, step 1 finishes', () => {
    const statsBefore = AcademyStudyEngine.getAcademyStats();
    expect(statsBefore.completedExercises).toBe(0);

    // Step 0: Player plays first tactical move (Bxf7+)
    const step0 = AcademyStudyEngine.verifyMove('ex_multistep_01', 0, 'Bxf7+');
    expect(step0.isCorrect).toBe(true);
    expect(step0.isComplete).toBe(false); // Multi-step! Not completed yet!
    expect(step0.nextStepIndex).toBe(1);

    // Exercise must NOT be marked completed yet in global stats
    expect(AcademyStudyEngine.getCompletedExerciseIds()).not.toContain('ex_multistep_01');

    // Trying to play step 0 again while on step 1 gives informative feedback
    const repeatStep0 = AcademyStudyEngine.verifyMove('ex_multistep_01', 1, 'Bxf7+');
    expect(repeatStep0.isCorrect).toBe(false);
    expect(repeatStep0.feedback).toContain('já foi executada');

    // Trying to jump to a future move prematurely on step 0
    const outOfOrder = AcademyStudyEngine.verifyMove('ex_multistep_01', 0, 'Qxd8');
    expect(outOfOrder.isCorrect).toBe(false);
    expect(outOfOrder.feedback).toContain('fora de ordem');

    // Step 1: Player plays second tactical move (Qxd8)
    const step1 = AcademyStudyEngine.verifyMove('ex_multistep_01', 1, 'Qxd8');
    expect(step1.isCorrect).toBe(true);
    expect(step1.isComplete).toBe(true); // Now completed!
    expect(step1.nextStepIndex).toBe(2);

    // Now exercise is authoritatively recorded as completed!
    expect(AcademyStudyEngine.getCompletedExerciseIds()).toContain('ex_multistep_01');
    const statsAfter = AcademyStudyEngine.getAcademyStats();
    expect(statsAfter.completedExercises).toBe(1);
  });

  it('provides constructive feedback on incorrect moves', () => {
    const outcome = AcademyStudyEngine.verifyMove('ex_center_01', 0, 'h4');
    expect(outcome.isCorrect).toBe(false);
    expect(outcome.isComplete).toBe(false);
    expect(outcome.feedback).toContain('Lance incorreto');
  });

  it('handles non-existent exercise ID gracefully', () => {
    const outcome = AcademyStudyEngine.verifyMove('ex_unknown_999', 0, 'e4');
    expect(outcome.isCorrect).toBe(false);
    expect(outcome.feedback).toContain('não encontrado');
  });
});
