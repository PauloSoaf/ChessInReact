/**
 * Starts local persistence before anything may create a new board: identity, then recovery of
 * the active match, then saving every committed event as it happens.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { UniversalMatchController } from '../../controllers/UniversalMatchController';
import { GuestIdentity, getOrCreateGuestIdentity } from '../../core/identity/GuestIdentityService';
import { IndexedDBMatchStore } from '../../core/persistence/local/IndexedDBMatchStore';
import { IMatchStore, IStoredMatch } from '../../core/persistence/local/IMatchStore';
import {
  ACTIVE_MATCH_KEY, MatchPersistenceCoordinator, SaveStatus,
} from '../../core/persistence/MatchPersistenceCoordinator';
import { recoverMatch } from '../../core/persistence/MatchRecoveryService';

export type BootState = 'LOADING_STORAGE' | 'RESTORING_MATCH' | 'READY' | 'RECOVERY_FAILED';

export interface IPersistenceServices {
  readonly store: IMatchStore;
  readonly identity: GuestIdentity;
  readonly coordinator: MatchPersistenceCoordinator;
}

const CLOCK_SAVE_MS = 3000;
const storageAvailable = (): boolean => typeof window !== 'undefined' && typeof indexedDB !== 'undefined';

export function useMatchPersistence(
  controller: UniversalMatchController | null, onRestored: (match: IStoredMatch) => void,
) {
  const [bootState, setBootState] = useState<BootState>(() => (storageAvailable() ? 'LOADING_STORAGE' : 'READY'));
  const [bootError, setBootError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(() => (storageAvailable() ? 'IDLE' : 'UNAVAILABLE'));
  const [services, setServices] = useState<IPersistenceServices | null>(null);
  const started = useRef(false);
  const restored = useRef(onRestored);
  restored.current = onRestored;

  useEffect(() => {
    // The guard keeps a single writer under React Strict Mode's double effects.
    if (started.current || !controller || !storageAvailable()) return;
    started.current = true;
    void (async () => {
      try {
        const identity = getOrCreateGuestIdentity(window.localStorage);
        const store = new IndexedDBMatchStore();
        const coordinator = new MatchPersistenceCoordinator(store, identity.userId, window.localStorage);
        coordinator.onStatus(setSaveStatus);
        controller.journal.subscribe(coordinator.listener);
        setServices({ store, identity, coordinator });

        const activeId = window.localStorage.getItem(ACTIVE_MATCH_KEY);
        if (activeId) {
          setBootState('RESTORING_MATCH');
          const recovered = await recoverMatch(store, activeId, identity.userId);
          if (recovered) {
            controller.restoreSession(recovered.events, recovered.match.clocks);
            await coordinator.resume(recovered.match);
            restored.current(recovered.match);
          }
        }
        setBootState('READY');
      } catch (error) {
        console.error('[MatchPersistence] Recovery failed:', error);
        setBootError(error instanceof Error ? error.message : String(error));
        setSaveStatus('ERROR');
        setBootState('RECOVERY_FAILED');
      }
    })();
  }, [controller]);

  useEffect(() => {
    if (!services || !controller) return undefined;
    const save = () => { void services.coordinator.saveClocks(controller.getClockManager().getClocksMap()).catch(() => undefined); };
    const timer = window.setInterval(save, CLOCK_SAVE_MS);
    const onHide = () => { if (document.visibilityState === 'hidden') save(); };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [services, controller]);

  /** Leaves the damaged save untouched on disk and only stops pointing at it. */
  const continueWithoutRestore = useCallback(() => {
    try { window.localStorage.removeItem(ACTIVE_MATCH_KEY); } catch { /* nothing to clear */ }
    setBootState('READY');
  }, []);

  /** Switches the live game to a saved match. The previous one stays saved. */
  const openMatch = useCallback(async (matchId: string): Promise<IStoredMatch> => {
    if (!services || !controller) throw new Error('Armazenamento local indisponível.');
    await services.coordinator.drain();
    const recovered = await recoverMatch(services.store, matchId, services.identity.userId);
    if (!recovered) throw new Error('Partida não encontrada neste dispositivo.');
    controller.restoreSession(recovered.events, recovered.match.clocks);
    await services.coordinator.resume(recovered.match);
    restored.current(recovered.match);
    return recovered.match;
  }, [services, controller]);

  return { bootState, bootError, saveStatus, services, openMatch, continueWithoutRestore };
}
