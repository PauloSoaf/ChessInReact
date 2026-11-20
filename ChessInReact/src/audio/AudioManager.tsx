/**
 * AudioManager.tsx
 *
 * Invisible presentation-layer React component connecting the GlobalEventBus
 * to the WebAudioSynthesizer.
 *
 * Architectural Invariant: Spec 01 Section 10.2 & Spec 12 RF-18 / RNF-13.
 * Completely decoupled from Zustand Core Domain State to prevent test pollution
 * in headless NodeJS environments.
 */

import React, { useEffect } from 'react';
import { GlobalEventBus } from '../core/events/EventBus';
import { useTheme } from '../ui/theme/ThemeContext';
import { globalAudioSynthesizer } from './WebAudioSynthesizer';

export const AudioManager: React.FC = () => {
  const { preferences } = useTheme();

  // Synchronize audio enable/mute preference with synthesizer
  useEffect(() => {
    globalAudioSynthesizer.setEnabled(preferences.soundEnabled);
  }, [preferences.soundEnabled]);

  // Subscribe to typed domain events from GlobalEventBus
  useEffect(() => {
    const unsubMove = GlobalEventBus.subscribe('PIECE_MOVED', () => {
      globalAudioSynthesizer.playMove();
    });

    const unsubCapture = GlobalEventBus.subscribe('PIECE_CAPTURED', () => {
      globalAudioSynthesizer.playCapture();
    });

    const unsubCheck = GlobalEventBus.subscribe('CHECK_TRIGGERED', () => {
      globalAudioSynthesizer.playCheck();
    });

    const unsubMate = GlobalEventBus.subscribe('MATE_TRIGGERED', () => {
      globalAudioSynthesizer.playCheckmate();
    });

    const unsubGameEnded = GlobalEventBus.subscribe('GAME_ENDED', (payload) => {
      if (payload.winnerId) {
        globalAudioSynthesizer.playCheckmate();
      }
    });

    const unsubExplosion = GlobalEventBus.subscribe('EXPLOSION', () => {
      globalAudioSynthesizer.playExplosion();
    });

    const unsubSpell = GlobalEventBus.subscribe('SPELL_CAST', (payload) => {
      globalAudioSynthesizer.playSpell(payload.spellType);
    });

    const unsubDuck = GlobalEventBus.subscribe('DUCK_PLACED', () => {
      globalAudioSynthesizer.playDuck();
    });

    const unsubDrop = GlobalEventBus.subscribe('PIECE_DROPPED', () => {
      globalAudioSynthesizer.playDrop();
    });

    const unsubPuzzle = GlobalEventBus.subscribe('PUZZLE_ATTEMPT', (payload) => {
      globalAudioSynthesizer.playPuzzleOutcome(payload.isCorrect);
    });

    return () => {
      unsubMove();
      unsubCapture();
      unsubCheck();
      unsubMate();
      unsubGameEnded();
      unsubExplosion();
      unsubSpell();
      unsubDuck();
      unsubDrop();
      unsubPuzzle();
    };
  }, []);

  return null; // Invisible component, purely behavioral
};
