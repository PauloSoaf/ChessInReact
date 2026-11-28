/** Loads and validates saved matches. Damaged data is reported, never repaired or erased. */
import { EVENT_SCHEMA_VERSION, GameEvent } from '../timeline/events';
import { ReplayTimeline } from '../timeline/ReplayTimeline';
import { IMatchStore, IStoredMatch } from './local/IMatchStore';

export class RecoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecoveryError';
  }
}

export interface IRecoveredMatch {
  readonly match: IStoredMatch;
  readonly events: GameEvent[];
}

/** Structural and integrity validation shared by recovery and backup import. */
export function validateHistory(events: readonly GameEvent[], matchId: string): ReplayTimeline {
  if (!events.length || events[0]?.type !== 'MATCH_STARTED') throw new RecoveryError('O histórico não tem o evento inicial.');
  events.forEach((event, index) => {
    if (!event || event.sequence !== index || event.matchId !== matchId || event.id !== `${matchId}:${index}`) {
      throw new RecoveryError(`Evento ${index} ausente, repetido ou fora de ordem.`);
    }
  });
  let timeline: ReplayTimeline;
  try {
    timeline = new ReplayTimeline(events);
  } catch (error) {
    throw new RecoveryError(`Histórico ilegível: ${String(error)}`);
  }
  const damaged = timeline.findCorruption();
  if (damaged !== null) throw new RecoveryError(`A posição do evento ${damaged} não confere com o registro.`);
  return timeline;
}

export async function recoverMatch(store: IMatchStore, matchId: string, ownerUserId: string): Promise<IRecoveredMatch | null> {
  const match = await store.get(matchId);
  if (!match) return null;
  if (match.ownerUserId !== ownerUserId) throw new RecoveryError('Esta partida pertence a outro usuário deste navegador.');
  if (match.schemaVersion > EVENT_SCHEMA_VERSION) {
    throw new RecoveryError('Partida salva por uma versão mais nova do aplicativo.');
  }
  const events = await store.events(matchId);
  validateHistory(events, matchId);
  if (events.length !== match.lastSequence + 1) throw new RecoveryError('Faltam eventos no histórico salvo.');
  return { match, events };
}
