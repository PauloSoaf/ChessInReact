import { useEffect, useRef, useState, useCallback } from 'react';
import { useGameStore } from './useGameStore';
import { gameStore } from '../../core/state/gameStore';
import { BotMatchController, IBotMatchControllerOptions } from '../../controllers/BotMatchController';
import { AIDifficultyLevel } from '../../workers/ai/interfaces/IAIEngineContracts';
import { SquareTopology } from '../../core/topology/SquareTopology';

/**
 * React hook binding for autonomous bot matches (Spec 05 § 1, § 15.1 US05-P01).
 * Fully idempotent under React.StrictMode:
 * - Never instantiates WebWorkers during the render phase.
 * - Safely disposes and recreates controllers on mount/unmount/remount cycles.
 * - Prevents stale or disposed controller reuse.
 */
export function useBotMatch(options?: IBotMatchControllerOptions) {
  const controllerRef = useRef<BotMatchController | null>(null);

  const [isBotEnabled, setIsBotEnabled] = useState(options?.enabled ?? false);
  const [difficulty, setDifficultyState] = useState<AIDifficultyLevel>(options?.difficulty ?? 2);
  const [isThinking, setIsThinking] = useState(false);
  const [lastEval, setLastEval] = useState(0);

  const activePlayer = useGameStore((state) => state.domain.activePlayer);
  const turnNumber = useGameStore((state) => state.domain.turnNumber);
  const isGameOver = useGameStore((state) => state.domain.isGameOver);
  const matchId = useGameStore((state) => state.domain.matchId);

  // Lifecycle effect: Attach controller and listeners on commit, dispose on unmount
  useEffect(() => {
    const controller = new BotMatchController({
      ...options,
      enabled: isBotEnabled,
      difficulty,
    });
    controllerRef.current = controller;

    const unsub = controller.subscribe((thinking) => {
      setIsThinking(thinking);
      setLastEval(controller.getLastEvaluationScore());
    });

    // Check if it's already bot's turn upon mount/remount
    const currentDomain = gameStore.getState().domain;
    if (
      isBotEnabled &&
      !currentDomain.isGameOver &&
      currentDomain.activePlayer === controller.getBotPlayer()
    ) {
      controller.checkAndTriggerBotTurn();
    }

    return () => {
      unsub();
      controller.dispose();
      controllerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run on mount/unmount - idempotent under StrictMode

  // Sync configuration updates to active controller
  useEffect(() => {
    if (controllerRef.current) {
      controllerRef.current.setEnabled(isBotEnabled);
      controllerRef.current.setDifficulty(difficulty);
    }
  }, [isBotEnabled, difficulty]);

  // Trigger bot deliberation when turn changes
  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller || !isBotEnabled || isGameOver) return;

    if (activePlayer === controller.getBotPlayer()) {
      controller.checkAndTriggerBotTurn();
    }
  }, [activePlayer, turnNumber, matchId, isBotEnabled, isGameOver]);

  const toggleBot = useCallback((enabled: boolean) => {
    setIsBotEnabled(enabled);
    if (controllerRef.current) {
      controllerRef.current.setEnabled(enabled);
      if (enabled) {
        const domain = gameStore.getState().domain;
        if (!domain.isGameOver && domain.activePlayer === controllerRef.current.getBotPlayer()) {
          controllerRef.current.checkAndTriggerBotTurn();
        }
      }
    }
  }, []);

  const setDifficulty = useCallback((diff: AIDifficultyLevel) => {
    setDifficultyState(diff);
    if (controllerRef.current) {
      controllerRef.current.setDifficulty(diff);
    }
  }, []);

  const cancelSearch = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.cancel();
    }
  }, []);

  const forceBotMove = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.forceImmediateBotMove();
    }
  }, []);

  const updateTopologySize = useCallback((size: number) => {
    if (controllerRef.current) {
      controllerRef.current.setTopology(new SquareTopology({ width: size, height: size }));
    }
  }, []);

  return {
    controller: controllerRef.current,
    isBotEnabled,
    difficulty,
    isThinking,
    lastEval,
    toggleBot,
    setDifficulty,
    cancelSearch,
    forceBotMove,
    updateTopologySize,
  };
}
