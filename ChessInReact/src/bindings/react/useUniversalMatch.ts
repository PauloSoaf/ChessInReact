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
import { IMatchConfiguration } from '../../matchmaking/config/IMatchConfiguration';
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

  const onHumanPieceMoved = useCallback((from: string, to: string, pieceId: string) => {
    if (controllerRef.current) {
      controllerRef.current.onHumanPieceMoved(from, to, pieceId);
    }
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

  const castExpandedSpell = useCallback((spell: ISpellCard, targetCoord: string) => {
    if (controllerRef.current) {
      return controllerRef.current.castExpandedSpell(spell, targetCoord);
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
    onHumanPieceMoved,
    castOfficialSpell,
    castExpandedSpell,
  };
}

