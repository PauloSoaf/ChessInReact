import { useState, useEffect, useRef } from 'react';
import {
  SpectatorRelayPubSub,
  ISpectatorEvent,
} from '../../matchmaking/engine/SpectatorRelayPubSub';

export interface IUseSpectatorStreamResult {
  readonly isConnected: boolean;
  readonly currentFen: string | null;
  readonly currentPly: number;
  readonly spectatorCount: number;
  readonly recentEvents: readonly ISpectatorEvent[];
  readonly lastError: string | null;
}

// Global default singleton relay for client-side state bridging
let globalRelayInstance: SpectatorRelayPubSub | null = null;

export function getSharedSpectatorRelay(): SpectatorRelayPubSub {
  if (!globalRelayInstance) {
    globalRelayInstance = new SpectatorRelayPubSub();
  }
  return globalRelayInstance;
}

/**
 * React hook to subscribe to a match's live spectator stream (Spec 08 § 8, RF-11, US08-P06).
 * Consumes events via SpectatorRelayPubSub without opening a heavy Colyseus room connection.
 */
export function useSpectatorStream(
  matchId: string | null,
  customRelay?: SpectatorRelayPubSub
): IUseSpectatorStreamResult {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [currentFen, setCurrentFen] = useState<string | null>(null);
  const [currentPly, setCurrentPly] = useState<number>(0);
  const [spectatorCount, setSpectatorCount] = useState<number>(0);
  const [recentEvents, setRecentEvents] = useState<readonly ISpectatorEvent[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);

  const relay = customRelay ?? getSharedSpectatorRelay();
  const relayRef = useRef(relay);
  relayRef.current = relay;

  useEffect(() => {
    if (!matchId) {
      setIsConnected(false);
      setCurrentFen(null);
      setCurrentPly(0);
      setSpectatorCount(0);
      setRecentEvents([]);
      setLastError(null);
      return;
    }

    try {
      const activeRelay = relayRef.current;
      const { unsubscribe, initialCatchup } = activeRelay.subscribe(
        matchId,
        (event: ISpectatorEvent) => {
          setCurrentFen(event.fen);
          setCurrentPly(event.ply);
          setRecentEvents((prev) => [...prev.slice(-49), event]);
          setSpectatorCount(activeRelay.getSpectatorCount(matchId));
        }
      );

      setIsConnected(true);
      setSpectatorCount(activeRelay.getSpectatorCount(matchId));

      if (initialCatchup.length > 0) {
        setRecentEvents(initialCatchup);
        const latest = initialCatchup[initialCatchup.length - 1];
        if (latest) {
          setCurrentFen(latest.fen);
          setCurrentPly(latest.ply);
        }
      }

      return () => {
        unsubscribe();
        setIsConnected(false);
      };
    } catch (err) {
      setLastError(err instanceof Error ? err.message : 'Falha ao conectar no stream');
      setIsConnected(false);
    }
  }, [matchId]);

  return {
    isConnected,
    currentFen,
    currentPly,
    spectatorCount,
    recentEvents,
    lastError,
  };
}

