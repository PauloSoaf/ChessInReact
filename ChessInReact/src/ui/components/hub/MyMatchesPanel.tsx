/** "Minhas partidas": saved matches of this device. Only summaries are loaded to list them. */
import React, { useCallback, useEffect, useState } from 'react';
import { IPersistenceServices } from '../../../bindings/react/useMatchPersistence';
import { IStoredMatch } from '../../../core/persistence/local/IMatchStore';
import { exportBackup, exportPgn, importBackup } from '../../../core/persistence/MatchBackup';
import { recoverMatch } from '../../../core/persistence/MatchRecoveryService';
import { randomId } from '../../../core/identity/GuestIdentityService';
import { sideName } from '../../../matchmaking/config/participants';

const PAGE_SIZE = 8;

export interface IMyMatchesPanelProps {
  readonly services: IPersistenceServices;
  readonly onContinue: (matchId: string) => Promise<unknown>;
  readonly onReplay: (matchId: string) => Promise<unknown>;
  readonly onReview: (matchId: string) => Promise<unknown>;
}

function resultText(match: IStoredMatch): string {
  if (match.status !== 'COMPLETED') return 'Em andamento';
  if (!match.winnerId) return 'Empate';
  if (!match.humanPlayer) return `Vitória das ${sideName(match.winnerId)}`;
  return match.winnerId === match.humanPlayer ? 'Vitória' : 'Derrota';
}

function durationText(match: IStoredMatch): string {
  const minutes = Math.round((Date.parse(match.endedAt ?? match.updatedAt) - Date.parse(match.startedAt)) / 60000);
  return minutes < 1 ? 'menos de 1 min' : `${minutes} min`;
}

function download(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export const MyMatchesPanel: React.FC<IMyMatchesPanelProps> = ({ services, onContinue, onReplay, onReview }) => {
  const { store, identity } = services;
  const [matches, setMatches] = useState<IStoredMatch[]>([]);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const found = await store.list(identity.userId, limit + 1);
    setMatches(found);
  }, [store, identity.userId, limit]);

  useEffect(() => {
    void services.coordinator.drain().then(reload).catch((error) => setMessage(String(error)));
  }, [reload, services.coordinator]);

  const run = (work: () => Promise<unknown>) => () => {
    setMessage(null);
    void work().catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
  };

  const exportAs = (matchId: string, kind: 'pgn' | 'backup') => run(async () => {
    const recovered = await recoverMatch(store, matchId, identity.userId);
    if (!recovered) return;
    if (kind === 'pgn') download(`${matchId}.pgn`, exportPgn(recovered.match, recovered.events), 'application/x-chess-pgn');
    else download(`${matchId}.chessinreact.json`, exportBackup(recovered.events), 'application/json');
  });

  const onImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    run(async () => {
      await importBackup(store, await file.text(), identity.userId, randomId);
      await reload();
      setMessage('Backup importado.');
    })();
  };

  const visible = matches.slice(0, limit).filter((match) => match.lastPly > 0);

  return (
    <section className="my-matches" aria-label="Minhas partidas" data-testid="my-matches">
      <header className="my-matches__header">
        <div>
          <h2>Minhas partidas</h2>
          <p>
            {identity.displayName} • salvas neste dispositivo. Backup em nuvem indisponível: nenhum servidor
            está configurado. Limpar os dados do site apaga o histórico.
          </p>
        </div>
        <label className="my-matches__action">
          Importar backup
          <input type="file" accept=".json,application/json" onChange={onImport} data-testid="my-matches-import" hidden />
        </label>
      </header>
      {message && <p role="status" className="my-matches__message">{message}</p>}
      {!visible.length ? (
        <p className="my-matches__empty">Nenhuma partida com lances ainda.</p>
      ) : (
        <ul>
          {visible.map((match) => (
            <li key={match.matchId} data-testid="my-match-row" data-match-id={match.matchId}>
              <div className="my-matches__info">
                <strong>{match.variantId.replace(/_/g, ' ')} • {match.opponentLabel}</strong>
                <span>
                  {new Date(match.startedAt).toLocaleString('pt-BR')} •{' '}
                  {match.humanPlayer ? `você de ${sideName(match.humanPlayer).toLowerCase()}` : 'sem cor fixa'} •{' '}
                  {match.lastPly} meios-lances • {durationText(match)} • {resultText(match)}
                </span>
              </div>
              <div className="my-matches__actions">
                {match.status === 'IN_PROGRESS' && (
                  <button type="button" onClick={run(() => onContinue(match.matchId))}>Continuar</button>
                )}
                <button type="button" onClick={run(() => onReplay(match.matchId))}>Ver replay</button>
                {match.status === 'COMPLETED' && (
                  <button type="button" onClick={run(() => onReview(match.matchId))}>Revisão</button>
                )}
                <button type="button" onClick={exportAs(match.matchId, 'pgn')}>PGN</button>
                <button type="button" onClick={exportAs(match.matchId, 'backup')}>Backup</button>
                {confirming === match.matchId ? (
                  <>
                    <button type="button" className="my-matches__danger" onClick={run(async () => {
                      await store.delete(match.matchId);
                      setConfirming(null);
                      await reload();
                    })}>Confirmar exclusão</button>
                    <button type="button" onClick={() => setConfirming(null)}>Cancelar</button>
                  </>
                ) : (
                  <button type="button" onClick={() => setConfirming(match.matchId)}>Excluir</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {matches.length > limit && (
        <button type="button" className="my-matches__action" onClick={() => setLimit((value) => value + PAGE_SIZE)}>
          Carregar mais
        </button>
      )}
    </section>
  );
};
