import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { LobbyManager } from '../../../matchmaking/engine/LobbyManager';
import { ILobbySummary } from '../../../matchmaking/interfaces/IMatchmakingContracts';
import { Card } from '../primitives/Card';
import { ActionButton } from '../primitives/ActionButton';
import {
  IconUsers,
  IconPlay,
  IconRefresh,
  IconX,
  IconCheck,
} from '../../icons/AppIcons';

export interface ILobbyBrowserModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly userId: string;
  readonly displayName: string;
  readonly lobbyManager?: LobbyManager;
  readonly onJoinLobbySuccess?: (lobby: ILobbySummary) => void;
}

type LobbyTab = 'browse' | 'create' | 'code';

const defaultManager = new LobbyManager();

export const LobbyBrowserModal: React.FC<ILobbyBrowserModalProps> = ({
  isOpen,
  onClose,
  userId,
  displayName,
  lobbyManager = defaultManager,
  onJoinLobbySuccess,
}) => {
  const [activeTab, setActiveTab] = useState<LobbyTab>('browse');
  const [publicLobbies, setPublicLobbies] = useState<ILobbySummary[]>([]);
  const [variantFilter, setVariantFilter] = useState<string>('all');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form states for creating lobby
  const [createTitle, setCreateTitle] = useState('');
  const [createVariant, setCreateVariant] = useState('standard');
  const [createMaxPlayers, setCreateMaxPlayers] = useState(2);
  const [createTimeControl, setCreateTimeControl] = useState(300);
  const [createIsPrivate, setCreateIsPrivate] = useState(false);
  const [createPasscode, setCreatePasscode] = useState('');

  // Direct join code input state
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinPasscodeInput, setJoinPasscodeInput] = useState('');

  const refreshLobbies = useCallback(() => {
    const filter = variantFilter !== 'all' ? { variantId: variantFilter } : undefined;
    const list = lobbyManager.listPublicLobbies(filter);
    setPublicLobbies(list);
  }, [lobbyManager, variantFilter]);

  useEffect(() => {
    if (isOpen) {
      refreshLobbies();
      setErrorMessage(null);
    }
  }, [isOpen, refreshLobbies]);

  const filteredLobbies = useMemo(() => {
    if (variantFilter === 'all') return publicLobbies;
    return publicLobbies.filter((l) => l.variantId === variantFilter);
  }, [publicLobbies, variantFilter]);

  if (!isOpen) {
    return null;
  }

  const handleJoinLobby = (lobbyIdOrCode: string, passcode?: string) => {
    setErrorMessage(null);
    const res = lobbyManager.joinLobby(
      lobbyIdOrCode,
      { userId, displayName },
      passcode
    );

    if (res.success && res.lobby) {
      onJoinLobbySuccess?.(res.lobby);
      onClose();
    } else {
      setErrorMessage(res.error ?? 'Falha ao entrar na sala.');
    }
  };

  const handleCreateLobby = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const title = createTitle.trim() || `Sala de ${displayName}`;
    const newLobby = lobbyManager.createLobby({
      hostId: userId,
      hostName: displayName,
      title,
      variantId: createVariant,
      maxPlayers: createMaxPlayers,
      timeControlSeconds: createTimeControl,
      isPrivate: createIsPrivate,
      passcode: createIsPrivate && createPasscode.trim() ? createPasscode.trim() : undefined,
    });

    onJoinLobbySuccess?.(newLobby);
    onClose();
  };

  const handleJoinByCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCodeInput.trim()) return;
    handleJoinLobby(joinCodeInput.trim(), joinPasscodeInput.trim() || undefined);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lobby-modal-title"
      data-testid="lobby-browser-modal"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem',
      }}
    >
      <Card
        style={{
          width: '100%',
          maxWidth: '640px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          overflow: 'hidden',
          padding: 0,
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <IconUsers size={22} />
            <h2 id="lobby-modal-title" style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
              Saguão de Lobbies da Comunidade
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar saguão"
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.6)',
              cursor: 'pointer',
              padding: '0.25rem',
            }}
          >
            <IconX size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
          }}
        >
          <button
            data-testid="tab-browse-lobbies"
            onClick={() => setActiveTab('browse')}
            style={{
              flex: 1,
              padding: '0.75rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'browse' ? '2px solid #3B82F6' : '2px solid transparent',
              color: activeTab === 'browse' ? '#60A5FA' : 'rgba(255,255,255,0.6)',
              fontWeight: activeTab === 'browse' ? 700 : 500,
              cursor: 'pointer',
            }}
          >
            Salas Abertas
          </button>
          <button
            data-testid="tab-create-lobby"
            onClick={() => setActiveTab('create')}
            style={{
              flex: 1,
              padding: '0.75rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'create' ? '2px solid #3B82F6' : '2px solid transparent',
              color: activeTab === 'create' ? '#60A5FA' : 'rgba(255,255,255,0.6)',
              fontWeight: activeTab === 'create' ? 700 : 500,
              cursor: 'pointer',
            }}
          >
            Criar Sala
          </button>
          <button
            data-testid="tab-join-code"
            onClick={() => setActiveTab('code')}
            style={{
              flex: 1,
              padding: '0.75rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'code' ? '2px solid #3B82F6' : '2px solid transparent',
              color: activeTab === 'code' ? '#60A5FA' : 'rgba(255,255,255,0.6)',
              fontWeight: activeTab === 'code' ? 700 : 500,
              cursor: 'pointer',
            }}
          >
            Entrar por Código
          </button>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div
            data-testid="lobby-error-alert"
            style={{
              padding: '0.75rem 1.25rem',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              borderBottom: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#F87171',
              fontSize: '0.85rem',
            }}
          >
            {errorMessage}
          </div>
        )}

        {/* Tab Body */}
        <div style={{ padding: '1.25rem', overflowY: 'auto', flex: 1 }}>
          {activeTab === 'browse' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Filter & Refresh Controls */}
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <select
                  data-testid="lobby-variant-filter"
                  value={variantFilter}
                  onChange={(e) => setVariantFilter(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '0.5rem 0.75rem',
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#FFF',
                    fontSize: '0.85rem',
                  }}
                >
                  <option value="all">Todas as Variantes</option>
                  <option value="standard">Xadrez Padrão (2P)</option>
                  <option value="hexagonal">Xadrez Hexagonal (4P)</option>
                  <option value="duck">Duck Chess</option>
                  <option value="atomic">Xadrez Atômico</option>
                </select>
                <ActionButton
                  id="btn-refresh-lobbies"
                  variant="secondary"
                  onClick={refreshLobbies}
                  style={{ padding: '0.5rem 0.75rem' }}
                >
                  <IconRefresh size={16} />
                </ActionButton>
              </div>

              {/* Lobbies List */}
              {filteredLobbies.length === 0 ? (
                <div
                  data-testid="empty-lobbies-message"
                  style={{
                    textAlign: 'center',
                    padding: '3rem 1rem',
                    color: 'rgba(255, 255, 255, 0.5)',
                    fontSize: '0.9rem',
                  }}
                >
                  Nenhuma sala pública disponível no momento. Crie sua própria sala!
                </div>
              ) : (
                <div
                  data-testid="public-lobbies-list"
                  style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
                >
                  {filteredLobbies.map((lobby) => (
                    <div
                      key={lobby.lobbyId}
                      data-testid={`lobby-item-${lobby.lobbyId}`}
                      style={{
                        padding: '1rem',
                        backgroundColor: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '1rem',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{lobby.title}</span>
                          <span
                            style={{
                              fontSize: '0.75rem',
                              padding: '0.15rem 0.4rem',
                              borderRadius: '4px',
                              backgroundColor: 'rgba(59, 130, 246, 0.2)',
                              color: '#93C5FD',
                            }}
                          >
                            {lobby.joinCode}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: '0.8rem',
                            color: 'rgba(255, 255, 255, 0.6)',
                            display: 'flex',
                            gap: '0.75rem',
                          }}
                        >
                          <span>Host: {lobby.hostName}</span>
                          <span>•</span>
                          <span>
                            {lobby.currentPlayers}/{lobby.maxPlayers} Jogadores
                          </span>
                          <span>•</span>
                          <span>{Math.floor(lobby.timeControlSeconds / 60)}m</span>
                        </div>
                      </div>

                      <ActionButton
                        id={`btn-join-lobby-${lobby.lobbyId}`}
                        variant="primary"
                        onClick={() => handleJoinLobby(lobby.lobbyId)}
                        style={{ padding: '0.5rem 1rem' }}
                      >
                        <IconPlay size={14} />
                        Entrar
                      </ActionButton>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'create' && (
            <form
              data-testid="create-lobby-form"
              onSubmit={handleCreateLobby}
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
            >
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                  Título da Sala
                </label>
                <input
                  type="text"
                  data-testid="input-create-title"
                  placeholder={`Sala de ${displayName}`}
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.75rem',
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#FFF',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                    Variante
                  </label>
                  <select
                    data-testid="select-create-variant"
                    value={createVariant}
                    onChange={(e) => setCreateVariant(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.75rem',
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      color: '#FFF',
                    }}
                  >
                    <option value="standard">Xadrez Clássico</option>
                    <option value="hexagonal">Hexagonal (4P)</option>
                    <option value="duck">Duck Chess</option>
                    <option value="atomic">Atômico</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                    Máx Jogadores
                  </label>
                  <select
                    data-testid="select-create-max-players"
                    value={createMaxPlayers}
                    onChange={(e) => setCreateMaxPlayers(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.75rem',
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      color: '#FFF',
                    }}
                  >
                    <option value={2}>2 Jogadores (1v1)</option>
                    <option value={4}>4 Jogadores (FFA)</option>
                    <option value={6}>6 Jogadores</option>
                    <option value={8}>8 Jogadores (Chaos)</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                  Controle de Tempo
                </label>
                <select
                  data-testid="select-create-time"
                  value={createTimeControl}
                  onChange={(e) => setCreateTimeControl(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.75rem',
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#FFF',
                  }}
                >
                  <option value={180}>3 Minutos (Blitz)</option>
                  <option value={300}>5 Minutos (Blitz)</option>
                  <option value={600}>10 Minutos (Rápido)</option>
                  <option value={900}>15 Minutos (Clássico)</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                <input
                  type="checkbox"
                  id="chk-private-lobby"
                  data-testid="chk-private-lobby"
                  checked={createIsPrivate}
                  onChange={(e) => setCreateIsPrivate(e.target.checked)}
                />
                <label htmlFor="chk-private-lobby" style={{ fontSize: '0.85rem', cursor: 'pointer' }}>
                  Sala Privada (Acesso apenas por Senha ou Código)
                </label>
              </div>

              {createIsPrivate && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                    Senha de Acesso (Opcional)
                  </label>
                  <input
                    type="password"
                    data-testid="input-create-passcode"
                    placeholder="Digite a senha da sala"
                    value={createPasscode}
                    onChange={(e) => setCreatePasscode(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.75rem',
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      color: '#FFF',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}

              <ActionButton
                id="btn-submit-create-lobby"
                variant="primary"
                type="submit"
                style={{ width: '100%', marginTop: '0.5rem' }}
              >
                <IconCheck size={16} />
                Criar Sala
              </ActionButton>
            </form>
          )}

          {activeTab === 'code' && (
            <form
              data-testid="join-code-form"
              onSubmit={handleJoinByCode}
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem 0' }}
            >
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                  Código da Sala (Ex: HEX-8841 ou F9A2B4)
                </label>
                <input
                  type="text"
                  data-testid="input-join-code"
                  placeholder="HEX-8841"
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    fontSize: '1.25rem',
                    textAlign: 'center',
                    fontFamily: 'monospace',
                    letterSpacing: '0.1em',
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#FFF',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                  Senha de Acesso (Caso a sala seja privada)
                </label>
                <input
                  type="password"
                  data-testid="input-join-passcode"
                  placeholder="Deixe em branco se a sala for aberta"
                  value={joinPasscodeInput}
                  onChange={(e) => setJoinPasscodeInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.75rem',
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#FFF',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <ActionButton
                id="btn-submit-join-code"
                variant="primary"
                type="submit"
                disabled={!joinCodeInput.trim()}
                style={{ width: '100%', marginTop: '0.5rem' }}
              >
                <IconPlay size={16} />
                Entrar na Sala
              </ActionButton>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
};
