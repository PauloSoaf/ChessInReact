import { useEffect, useRef, useState, useCallback } from 'react';
import { useGameStore } from './useGameStore';
import { BotMatchController, IBotMatchControllerOptions } from '../../controllers/BotMatchController';
import { AIDifficultyLevel } from '../../workers/ai/interfaces/IAIEngineContracts';
import { SquareTopology } from '../../core/topology/SquareTopology';

export function useBotMatch(options?: IBotMatchControllerOptions) {
  const controllerRef = useRef<BotMatchController | null>(null);

  if (!controllerRef.current) {
    controllerRef.current = new BotMatchController(options);
  }

  const controller = controllerRef.current;
  const [isBotEnabled, setIsBotEnabled] = useState(controller.isBotEnabled());
  const [difficulty, setDifficultyState] = useState<AIDifficultyLevel>(controller.getDifficulty());
  const [isThinking, setIsThinking] = useState(controller.getIsThinking());
  const [lastEval, setLastEval] = useState(controller.getLastEvaluationScore());

  const activePlayer = useGameStore((state) => state.domain.activePlayer);
  const turnNumber = useGameStore((state) => state.domain.turnNumber);
  const isGameOver = useGameStore((state) => state.domain.isGameOver);
  const matchId = useGameStore((state) => state.domain.matchId);

  // Subscribe to thinking state changes
  useEffect(() => {
    const unsub = controller.subscribe((thinking) => {
      setIsThinking(thinking);
      setLastEval(controller.getLastEvaluationScore());
    });
    return unsub;
  }, [controller]);

  // Trigger bot deliberation when active player, turn, or enabled state changes
  useEffect(() => {
    if (isBotEnabled && !isGameOver && activePlayer === controller.getBotPlayer()) {
      controller.checkAndTriggerBotTurn();
    }
  }, [controller, isBotEnabled, isGameOver, activePlayer, turnNumber, matchId]);

  const toggleBot = useCallback((enabled: boolean) => {
    controller.setEnabled(enabled);
    setIsBotEnabled(enabled);
  }, [controller]);

  const setDifficulty = useCallback((diff: AIDifficultyLevel) => {
    controller.setDifficulty(diff);
    setDifficultyState(diff);
  }, [controller]);

  const cancelSearch = useCallback(() => {
    controller.cancel();
  }, [controller]);

  const updateTopologySize = useCallback((size: number) => {
    controller.setTopology(new SquareTopology({ width: size, height: size }));
  }, [controller]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      controller.dispose();
    };
  }, [controller]);

  return {
    controller,
    isBotEnabled,
    difficulty,
    isThinking,
    lastEval,
    toggleBot,
    setDifficulty,
    cancelSearch,
    updateTopologySize,
  };
}
