/**
 * ChessInReact - Universal Match Hook (Spec 13, 14, 15, 16)
 *
 * Provides reactive access to UniversalMatchController under React:
 * - Idempotent mount/remount under StrictMode.
 * - Reactive state updates for spectators, multiplayer ribbons, and variant mechanics.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  UniversalMatchController,
  IUniversalMatchSnapshot,
} from '../../controllers/UniversalMatchController';
import {
  IMatchConfiguration,
  ParticipantRole,
} from '../../matchmaking/config/IMatchConfiguration';
import { ISpellCard } from '../../analysis/minigames/SpellChessEngine';

export function useUniversalMatch(initialConfig?: IMatchConfiguration) {
  const controllerRef = useRef<UniversalMatchController | null>(null);

  if (!controllerRef.current) {
    controllerRef.current = new UniversalMatchController(initialConfig);
  }

  const [snapshot, setSnapshot] = useState<IUniversalMatchSnapshot>(() =>
    controllerRef.current!.getSnapshot()
  );

  useEffect(() => {
    const controller = controllerRef.current!;
    const unsub = controller.subscribe((newSnap) => {
      setSnapshot(newSnap);
    });

    return () => {
      unsub();
    };
  }, []);

  const startUniversalMatch = useCallback((config: IMatchConfiguration) => {
    if (controllerRef.current) {
      controllerRef.current.startMatch(config);
    }
  }, []);

  const togglePause = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.togglePause();
    }
  }, []);

  const setSpeed = useCallback((speed: 1 | 2 | 5) => {
    if (controllerRef.current) {
      controllerRef.current.setPlaybackSpeed(speed);
    }
  }, []);

  const stepForward = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.stepBotTurn();
    }
  }, []);

  const placeDuck = useCallback((targetCoord: string) => {
    if (controllerRef.current) {
      return controllerRef.current.placeDuck(targetCoord);
    }
    return false;
  }, []);

  const dropPiece = useCallback((pieceVariant: string, targetCoord: string) => {
    if (controllerRef.current) {
      return controllerRef.current.dropPiece(pieceVariant, targetCoord);
    }
    return false;
  }, []);

  const onHumanPieceMoved = useCallback((from: string, to: string, pieceId: string, promotionVariant?: string) => {
    if (controllerRef.current) {
      controllerRef.current.onHumanPieceMoved(from, to, pieceId, promotionVariant);
    }
  }, []);

  const getFormattedMoveItems = useCallback(() => {
    return controllerRef.current ? controllerRef.current.getFormattedMoveItems() : [];
  }, []);

  const castOfficialSpell = useCallback(
    (spellType: 'FREEZE' | 'JUMP', target: { file: number; rank: number } | string) => {
      if (controllerRef.current) {
        return controllerRef.current.castOfficialSpell(spellType, target);
      }
      return false;
    },
    []
  );

  const castExpandedSpell = useCallback((spell: ISpellCard, targetCoord: string, sourceCoord?: string) => {
    if (controllerRef.current) {
      return controllerRef.current.castExpandedSpell(spell, targetCoord, sourceCoord);
    }
    return false;
  }, []);

  const updateSlotRole = useCallback(
    (slotIndex: number, role: ParticipantRole, botDifficulty?: 1 | 2 | 3 | 4 | 5) => {
      if (controllerRef.current) {
        controllerRef.current.updateSlotRole(slotIndex, role, botDifficulty);
      }
    },
    []
  );

  const updateBotDifficulty = useCallback((slotIndex: number, difficulty: 1 | 2 | 3 | 4 | 5) => {
    if (controllerRef.current) {
      controllerRef.current.updateBotDifficulty(slotIndex, difficulty);
    }
  }, []);

  const resetUniversalMatch = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.resetCurrentMatch();
    }
  }, []);

  const undo = useCallback(() => {
    if (controllerRef.current) {
      return controllerRef.current.undo();
    }
    return false;
  }, []);

  const redo = useCallback(() => {
    if (controllerRef.current) {
      return controllerRef.current.redo();
    }
    return false;
  }, []);

  const canUndo = useCallback(() => {
    if (controllerRef.current) {
      return controllerRef.current.canUndo();
    }
    return false;
  }, []);

  const canRedo = useCallback(() => {
    if (controllerRef.current) {
      return controllerRef.current.canRedo();
    }
    return false;
  }, []);

  return {
    controller: controllerRef.current,
    snapshot,
    startUniversalMatch,
    togglePause,
    setSpeed,
    stepForward,
    placeDuck,
    dropPiece,
    onHumanPieceMoved,
    castOfficialSpell,
    castExpandedSpell,
    updateSlotRole,
    updateBotDifficulty,
    resetUniversalMatch,
    undo,
    redo,
    canUndo,
    canRedo,
    getFormattedMoveItems,
  };
}

