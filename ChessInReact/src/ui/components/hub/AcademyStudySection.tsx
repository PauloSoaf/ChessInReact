import React from 'react';
import { Card } from '../primitives/Card';
import {
  AcademyStudyEngine,
  StudyCategory,
} from '../../../analysis/study/AcademyStudyEngine';
import { IconBookOpen, IconCheck } from '../../icons/AppIcons';

export interface IAcademyStudySectionProps {
  readonly onOpenTournamentModal?: () => void;
}

export const AcademyStudySection: React.FC<IAcademyStudySectionProps> = ({
  onOpenTournamentModal,
}) => {
  const [academyCategory, setAcademyCategory] = React.useState<StudyCategory | 'ALL'>('ALL');
  const [revealedHints, setRevealedHints] = React.useState<Record<string, boolean>>({});
  const [revealedSolutions, setRevealedSolutions] = React.useState<Record<string, boolean>>({});
  const [exerciseAnswers, setExerciseAnswers] = React.useState<Record<string, string>>({});
  const [exerciseFeedback, setExerciseFeedback] = React.useState<
    Record<string, { isCorrect: boolean; message: string }>
  >({});
  const [academyStats, setAcademyStats] = React.useState(() =>
    AcademyStudyEngine.getAcademyStats()
  );

  return (
    <div id="hub-academy-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Academy Progress Banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '1rem 1.25rem',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--bg-sunken)',
          border: '1px solid var(--border-prominent)',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span
            style={{
              fontSize: '0.72rem',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--color-accent)',
            }}
          >
            Progresso do Treinamento
          </span>
          <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {academyStats.completedExercises} de {academyStats.totalExercises} exercícios concluídos ({academyStats.completionPercentage}%)
          </span>
        </div>

        {onOpenTournamentModal && (
          <button
            type="button"
            id="btn-open-tournament-arena"
            data-testid="btn-open-tournament-arena"
            onClick={onOpenTournamentModal}
            style={{
              padding: '0.45rem 0.9rem',
              fontSize: '0.78rem',
              fontWeight: 700,
              fontFamily: 'var(--font-sans)',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: '#f59e0b',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)',
            }}
          >
            Torneios (Suíço &amp; Arena Berserk)
          </button>
        )}

        {/* Category Filter Pills */}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {(['ALL', 'FUNDAMENTALS', 'TACTICS', 'CHECKMATES', 'ENDGAMES'] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setAcademyCategory(cat)}
              style={{
                padding: '0.3rem 0.65rem',
                fontSize: '0.72rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                borderRadius: 'var(--radius-full)',
                cursor: 'pointer',
                backgroundColor:
                  academyCategory === cat ? 'var(--color-accent)' : 'var(--bg-card)',
                color: academyCategory === cat ? '#ffffff' : 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
                transition: 'all var(--transition-fast)',
              }}
            >
              {cat === 'ALL'
                ? 'Todos'
                : cat === 'FUNDAMENTALS'
                ? 'Fundamentos'
                : cat === 'TACTICS'
                ? 'Tática'
                : cat === 'CHECKMATES'
                ? 'Mates'
                : 'Finais'}
            </button>
          ))}
        </div>
      </div>

      {/* Exercises Grid */}
      <div
        id="academy-exercises-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))',
          gap: '1.15rem',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        {AcademyStudyEngine.EXERCISES.filter(
          (ex) => academyCategory === 'ALL' || ex.category === academyCategory
        ).map((ex) => {
          const isHintOpen = Boolean(revealedHints[ex.id]);
          const currentFeedback = exerciseFeedback[ex.id];
          const isCompleted = AcademyStudyEngine.getCompletedExerciseIds().includes(ex.id);

          return (
            <Card
              key={ex.id}
              id={`exercise-${ex.id}`}
              variant="elevated"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '0.85rem',
                padding: '1.15rem',
                border: isCompleted
                  ? '1px solid var(--color-success)'
                  : '1px solid var(--border-prominent)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      padding: '0.15rem 0.45rem',
                      borderRadius: 'var(--radius-xs)',
                      backgroundColor: 'var(--bg-sunken)',
                      color: 'var(--color-accent)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {ex.category} • {ex.difficulty}
                  </span>

                  {isCompleted && (
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        color: 'var(--color-success)',
                      }}
                    >
                      ✓ Concluído
                    </span>
                  )}
                </div>

                <h4
                  style={{
                    margin: 0,
                    fontSize: '1rem',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                  }}
                >
                  {ex.title}
                </h4>

                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  {ex.prompt}
                </p>

                {isHintOpen && (
                  <div
                    style={{
                      padding: '0.55rem 0.75rem',
                      borderRadius: 'var(--radius-xs)',
                      backgroundColor: 'var(--bg-sunken)',
                      border: '1px solid var(--border-subtle)',
                      fontSize: '0.76rem',
                      color: 'var(--text-secondary)',
                      fontStyle: 'italic',
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <IconBookOpen size={13} color="var(--color-accent)" />
                      <span>Dica: {ex.hint}</span>
                    </span>
                  </div>
                )}

                {currentFeedback && (
                  <div
                    role="status"
                    style={{
                      padding: '0.55rem 0.75rem',
                      borderRadius: 'var(--radius-xs)',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      backgroundColor: currentFeedback.isCorrect
                        ? 'var(--color-success-bg, rgba(16, 185, 129, 0.15))'
                        : 'var(--color-warning-bg, rgba(234, 179, 8, 0.15))',
                      color: currentFeedback.isCorrect
                        ? 'var(--color-success)'
                        : 'var(--color-warning)',
                      border: `1px solid ${
                        currentFeedback.isCorrect
                          ? 'var(--color-success)'
                          : 'var(--color-warning)'
                      }`,
                    }}
                  >
                    {currentFeedback.message}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    id={`input-${ex.id}`}
                    type="text"
                    placeholder="Lance em SAN (ex: e4, Nf3, Ra8#)"
                    value={exerciseAnswers[ex.id] || ''}
                    onChange={(e) =>
                      setExerciseAnswers((prev) => ({ ...prev, [ex.id]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const ans = exerciseAnswers[ex.id] || '';
                        if (ans.trim()) {
                          const outcome = AcademyStudyEngine.verifyMove(ex.id, 0, ans);
                          setExerciseFeedback((prev) => ({
                            ...prev,
                            [ex.id]: { isCorrect: outcome.isCorrect, message: outcome.feedback },
                          }));
                          if (outcome.isCorrect) {
                            setAcademyStats(AcademyStudyEngine.getAcademyStats());
                          }
                        }
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: '0.35rem 0.6rem',
                      fontSize: '0.78rem',
                      fontFamily: 'var(--font-mono)',
                      borderRadius: 'var(--radius-xs)',
                      border: '1px solid var(--border-prominent)',
                      backgroundColor: 'var(--bg-sunken)',
                      color: 'var(--text-primary)',
                      outline: 'none',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const ans = exerciseAnswers[ex.id] || '';
                      if (ans.trim()) {
                        const outcome = AcademyStudyEngine.verifyMove(ex.id, 0, ans);
                        setExerciseFeedback((prev) => ({
                          ...prev,
                          [ex.id]: { isCorrect: outcome.isCorrect, message: outcome.feedback },
                        }));
                        if (outcome.isCorrect) {
                          setAcademyStats(AcademyStudyEngine.getAcademyStats());
                        }
                      }
                    }}
                    style={{
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.76rem',
                      fontFamily: 'var(--font-sans)',
                      fontWeight: 700,
                      borderRadius: 'var(--radius-xs)',
                      backgroundColor: 'var(--color-accent)',
                      color: '#ffffff',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    Verificar
                  </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() =>
                      setRevealedHints((prev) => ({ ...prev, [ex.id]: !prev[ex.id] }))
                    }
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      padding: 0,
                    }}
                  >
                    {isHintOpen ? 'Ocultar Dica' : 'Ver Dica'}
                  </button>

                  <button
                    type="button"
                    id={`btn-solution-${ex.id}`}
                    onClick={() => {
                      setRevealedSolutions((prev) => ({ ...prev, [ex.id]: !prev[ex.id] }));
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-accent)',
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                      padding: 0,
                      textDecoration: 'underline',
                    }}
                  >
                    {revealedSolutions[ex.id] ? 'Ocultar Resposta' : 'Ver Resposta (Estudo)'}
                  </button>
                </div>

                {revealedSolutions[ex.id] && (
                  <div
                    id={`solution-callout-${ex.id}`}
                    style={{
                      backgroundColor: 'var(--bg-sunken)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.55rem 0.75rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.25rem',
                    }}
                  >
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-accent)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <IconCheck size={14} color="var(--color-accent)" />
                      <span>Solução Didática: {ex.solutionSequence.join(' ➔ ')}</span>
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                      {ex.solutionExplanation}
                    </span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      * A visualização da resposta serve para aprendizado e não computa pontuação de progresso.
                    </span>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

