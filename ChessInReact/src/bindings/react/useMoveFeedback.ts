import { useState, useCallback, useRef, useEffect } from 'react';

export type InvalidMoveReason = 'CHECK_CONSTRAINT' | 'ILLEGAL_MOVE' | 'GAME_TERMINATION' | 'GAME_EVENT';

export interface IInvalidMoveFeedback {
  readonly reason: InvalidMoveReason;
  readonly sourceCoord?: string;
  readonly targetCoord?: string;
  readonly kingCoord?: string;
  readonly message: string;
  readonly timestamp: number;
}

export interface ITriggerFeedbackOptions {
  readonly sourceCoord?: string;
  readonly targetCoord?: string;
  readonly kingCoord?: string;
  readonly message?: string;
}

/**
 * Hook for managing real-time tactile and visual feedback when invalid chess moves
 * or check-constraint violations occur (Spec 04 US04-P06, SPEC07-CHECK-CONSTRAINT-FEEDBACK-01).
 * Supports automatic timeout dismissal and instant clearance upon valid actions.
 */
export function useMoveFeedback() {
  const [feedback, setFeedback] = useState<IInvalidMoveFeedback | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearFeedback = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setFeedback(null);
  }, []);

  const triggerFeedback = useCallback(
    (reason: InvalidMoveReason, options: ITriggerFeedbackOptions = {}) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      const defaultMessage =
        reason === 'CHECK_CONSTRAINT'
          ? 'Movimento inválido: seu rei está em xeque. Resolva o xeque movendo o rei, capturando a ameaça ou bloqueando a linha.'
          : reason === 'GAME_TERMINATION'
          ? 'Partida finalizada.'
          : reason === 'GAME_EVENT'
          ? 'Notificação da partida.'
          : 'Movimento não permitido pelas regras desta peça.';

      setFeedback({
        reason,
        sourceCoord: options.sourceCoord,
        targetCoord: options.targetCoord,
        kingCoord: options.kingCoord,
        message: options.message || defaultMessage,
        timestamp: Date.now(),
      });

      // Automatically clear after 4000ms
      timerRef.current = setTimeout(() => {
        setFeedback(null);
        timerRef.current = null;
      }, 4000);
    },
    []
  );

  // Clear pending timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return {
    feedback,
    triggerFeedback,
    clearFeedback,
  };
}

