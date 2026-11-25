import React from 'react';
import { useTheme } from '../../theme/ThemeContext';
import { PreMatchStagingModal } from './PreMatchStagingModal';
import { TournamentArenaModal } from './TournamentArenaModal';
import { AcademyStudySection } from './AcademyStudySection';
import { ClassicModesSection } from './ClassicModesSection';
import { DIFFICULTY_META } from './difficultyTypes';
import { IMatchConfiguration } from '../../../matchmaking/config/IMatchConfiguration';
import { ArenasMultiplayerSection } from './ArenasMultiplayerSection';
import { MinigamesCatalogSection } from './MinigamesCatalogSection';
import { GeometricCatalogSection } from './GeometricCatalogSection';
import { HistoricalCatalogSection } from './HistoricalCatalogSection';
import { MatchmakingQueueModal } from './MatchmakingQueueModal';
import { LobbyBrowserModal } from './LobbyBrowserModal';
import { LiveSpectateModal } from './LiveSpectateModal';
import { GameHubHeroSection } from './GameHubHeroSection';

export type Progressive3DMode = 'idle' | 'eager' | 'off';

export type HubTabId = 'CLASSIC' | 'MINIGAMES' | 'ARENAS' | 'GEOMETRIC' | 'HISTORICAL' | 'ACADEMY';

export interface IGameHubProps {
  onStartBotMatch: (difficulty: number) => void;
  onStartLocalMatch: () => void;
  onResumeMatch: () => void;
  hasActiveMatch: boolean;
  turnNumber: number;
  activePlayer?: string;
  isGameOver?: boolean;
  botEnabled: boolean;
  botDifficulty: number;
  onSelectDifficulty: (d: number) => void;
  onOpenThemeModal: () => void;
  progressive3DMode?: Progressive3DMode;
  onLaunchMinigame?: (minigameId: string) => void;
  onLaunchMatch?: (config: IMatchConfiguration) => void;
  activeTab?: HubTabId;
  onTabChange?: (tab: HubTabId) => void;
  onNavigateToPuzzles?: () => void;
}

export const GameHub: React.FC<IGameHubProps> = ({
  onStartBotMatch,
  onStartLocalMatch,
  onResumeMatch,
  hasActiveMatch,
  turnNumber,
  activePlayer = 'P1',
  isGameOver = false,
  botEnabled,
  botDifficulty,
  onSelectDifficulty,
  onOpenThemeModal,
  progressive3DMode,
  onLaunchMinigame,
  onLaunchMatch,
  activeTab,
  onTabChange,
  onNavigateToPuzzles,
}) => {
  const { uiTheme } = useTheme();
  const activeDiff = DIFFICULTY_META.find((d) => d.level === botDifficulty) ?? DIFFICULTY_META[2];

  const effectiveMode: Progressive3DMode = progressive3DMode ?? 'idle';

  const [is3DActive, setIs3DActive] = React.useState<boolean>(() => effectiveMode === 'eager');
  const [keyboardActivated, setKeyboardActivated] = React.useState<boolean>(false);
  const [internalHubTab, setInternalHubTab] = React.useState<HubTabId>(activeTab ?? 'CLASSIC');

  React.useEffect(() => {
    if (activeTab && activeTab !== internalHubTab) {
      setInternalHubTab(activeTab);
    }
  }, [activeTab, internalHubTab]);

  const activeHubTab = activeTab ?? internalHubTab;

  const handleTabSelect = (tab: HubTabId) => {
    setInternalHubTab(tab);
    onTabChange?.(tab);
  };
  const [stagingVariantId, setStagingVariantId] = React.useState<string | null>(null);
  const [stagingParticipants, setStagingParticipants] = React.useState<number>(2);
  const [isTournamentModalOpen, setIsTournamentModalOpen] = React.useState<boolean>(false);
  const [isMatchmakingOpen, setIsMatchmakingOpen] = React.useState<boolean>(false);
  const [isLobbyBrowserOpen, setIsLobbyBrowserOpen] = React.useState<boolean>(false);
  const [isLiveSpectateOpen, setIsLiveSpectateOpen] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (effectiveMode === 'off') {
      setKeyboardActivated(false);
      setIs3DActive(false);
      return;
    }
    if (effectiveMode === 'eager') {
      setIs3DActive(true);
      return;
    }

    if (is3DActive || typeof window === 'undefined') {
      return;
    }

    let cancelled = false;
    const activateOnIdle = () => {
      if (!cancelled) {
        setIs3DActive(true);
      }
    };

    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (typeof win.requestIdleCallback === 'function') {
      const idleId = win.requestIdleCallback(activateOnIdle, { timeout: 1500 });
      return () => {
        cancelled = true;
        if (typeof win.cancelIdleCallback === 'function') {
          win.cancelIdleCallback(idleId);
        }
      };
    }

    const timerId = window.setTimeout(activateOnIdle, 1000);
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [effectiveMode, is3DActive]);

  const handleActivate3D = React.useCallback(
    (origin: 'pointer' | 'keyboard' = 'pointer') => {
      if (effectiveMode !== 'idle') {
        return;
      }
      if (origin === 'keyboard') {
        setKeyboardActivated(true);
      }
      setIs3DActive((prev) => (prev ? prev : true));
    },
    [effectiveMode]
  );

  const shouldRender3D = effectiveMode === 'eager' || (effectiveMode === 'idle' && is3DActive);

  return (
    <div id="game-hub" className="hub-shell">
      {/* 1. Editorial Hero Banner with Integrated 3D Staunton Showcase */}
      <GameHubHeroSection
        hasActiveMatch={hasActiveMatch}
        isGameOver={isGameOver}
        turnNumber={turnNumber}
        activePlayer={activePlayer}
        botDifficulty={botDifficulty}
        activeDiffName={activeDiff.name}
        effectiveMode={effectiveMode}
        shouldRender3D={shouldRender3D}
        keyboardActivated={keyboardActivated}
        uiTheme={uiTheme}
        onResumeMatch={onResumeMatch}
        onStartBotMatch={onStartBotMatch}
        onStartLocalMatch={onStartLocalMatch}
        onSelectTab={handleTabSelect}
        onNavigateToPuzzles={onNavigateToPuzzles}
        onOpenThemeModal={onOpenThemeModal}
        onClockModalOpen={() => {
          setStagingVariantId('STANDARD');
          setStagingParticipants(2);
        }}
        onActivate3D={handleActivate3D}
      />

      {/* 2. Game Modes Selection Section */}
      <section className="hub-modes-section" aria-labelledby="hub-modes-heading">
        <div className="hub-modes-header">
          <div>
            <span
              style={{
                fontSize: '0.72rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.09em',
                color: 'var(--color-accent)',
                display: 'block',
                marginBottom: '0.3rem',
              }}
            >
              Seleção de Modalidade
            </span>
            <h2
              id="hub-modes-heading"
              style={{
                margin: 0,
                fontSize: '1.45rem',
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                color: 'var(--text-primary)',
                letterSpacing: '-0.025em',
              }}
            >
              {activeHubTab === 'CLASSIC'
                ? 'Modos Clássicos & Arena Tática'
                : activeHubTab === 'MINIGAMES'
                ? 'Central de Minijogos & Modos Mágicos'
                : activeHubTab === 'ARENAS'
                ? 'Arenas Multijogador Massivas (3 a 12 Jogadores)'
                : activeHubTab === 'GEOMETRIC'
                ? 'Tabuleiros Geométricos & Peças Fadas'
                : activeHubTab === 'HISTORICAL'
                ? 'Variantes Históricas & Regionais (Ásia e Pérsia)'
                : 'Área de Estudos & Academia Tática'}
            </h2>
          </div>

          {/* Section Navigation Tabs: 6 Categories */}
          <div
            role="tablist"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.28rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--bg-sunken)',
              border: '1px solid var(--border-prominent)',
              flexWrap: 'wrap',
            }}
          >
            <button
              id="hub-tab-classic"
              type="button"
              role="tab"
              aria-selected={activeHubTab === 'CLASSIC'}
              onClick={() => handleTabSelect('CLASSIC')}
              style={{
                padding: '0.4rem 0.8rem',
                fontSize: '0.78rem',
                fontFamily: 'var(--font-sans)',
                fontWeight: 700,
                cursor: 'pointer',
                borderRadius: 'var(--radius-sm)',
                backgroundColor:
                  activeHubTab === 'CLASSIC' ? 'var(--color-accent)' : 'transparent',
                color: activeHubTab === 'CLASSIC' ? '#ffffff' : 'var(--text-secondary)',
                border: 'none',
                transition: 'all var(--transition-fast)',
              }}
            >
              Clássico (2)
            </button>

            <button
              id="hub-tab-minigames"
              data-testid="hub-tab-minigames"
              type="button"
              role="tab"
              aria-selected={activeHubTab === 'MINIGAMES'}
              onClick={() => handleTabSelect('MINIGAMES')}
              style={{
                padding: '0.4rem 0.8rem',
                fontSize: '0.78rem',
                fontFamily: 'var(--font-sans)',
                fontWeight: 700,
                cursor: 'pointer',
                borderRadius: 'var(--radius-sm)',
                backgroundColor:
                  activeHubTab === 'MINIGAMES' ? 'var(--color-accent)' : 'transparent',
                color: activeHubTab === 'MINIGAMES' ? '#ffffff' : 'var(--text-secondary)',
                border: 'none',
                transition: 'all var(--transition-fast)',
              }}
            >
              Mágicos &amp; Híbridos (7)
            </button>

            <button
              id="hub-tab-arenas"
              type="button"
              role="tab"
              aria-selected={activeHubTab === 'ARENAS'}
              onClick={() => handleTabSelect('ARENAS')}
              style={{
                padding: '0.4rem 0.8rem',
                fontSize: '0.78rem',
                fontFamily: 'var(--font-sans)',
                fontWeight: 700,
                cursor: 'pointer',
                borderRadius: 'var(--radius-sm)',
                backgroundColor:
                  activeHubTab === 'ARENAS' ? 'var(--color-accent)' : 'transparent',
                color: activeHubTab === 'ARENAS' ? '#ffffff' : 'var(--text-secondary)',
                border: 'none',
                transition: 'all var(--transition-fast)',
              }}
            >
              Arenas Massivas (3-12P)
            </button>

            <button
              id="hub-tab-geometric"
              type="button"
              role="tab"
              aria-selected={activeHubTab === 'GEOMETRIC'}
              onClick={() => handleTabSelect('GEOMETRIC')}
              style={{
                padding: '0.4rem 0.8rem',
                fontSize: '0.78rem',
                fontFamily: 'var(--font-sans)',
                fontWeight: 700,
                cursor: 'pointer',
                borderRadius: 'var(--radius-sm)',
                backgroundColor:
                  activeHubTab === 'GEOMETRIC' ? 'var(--color-accent)' : 'transparent',
                color: activeHubTab === 'GEOMETRIC' ? '#ffffff' : 'var(--text-secondary)',
                border: 'none',
                transition: 'all var(--transition-fast)',
              }}
            >
              Fadas &amp; Geometria
            </button>

            <button
              id="hub-tab-historical"
              type="button"
              role="tab"
              aria-selected={activeHubTab === 'HISTORICAL'}
              onClick={() => handleTabSelect('HISTORICAL')}
              style={{
                padding: '0.4rem 0.8rem',
                fontSize: '0.78rem',
                fontFamily: 'var(--font-sans)',
                fontWeight: 700,
                cursor: 'pointer',
                borderRadius: 'var(--radius-sm)',
                backgroundColor:
                  activeHubTab === 'HISTORICAL' ? 'var(--color-accent)' : 'transparent',
                color: activeHubTab === 'HISTORICAL' ? '#ffffff' : 'var(--text-secondary)',
                border: 'none',
                transition: 'all var(--transition-fast)',
              }}
            >
              Histórico &amp; Regional
            </button>

            <button
              id="hub-tab-academy"
              type="button"
              role="tab"
              aria-selected={activeHubTab === 'ACADEMY'}
              onClick={() => handleTabSelect('ACADEMY')}
              style={{
                padding: '0.4rem 0.8rem',
                fontSize: '0.78rem',
                fontFamily: 'var(--font-sans)',
                fontWeight: 700,
                cursor: 'pointer',
                borderRadius: 'var(--radius-sm)',
                backgroundColor:
                  activeHubTab === 'ACADEMY' ? 'var(--color-accent)' : 'transparent',
                color: activeHubTab === 'ACADEMY' ? '#ffffff' : 'var(--text-secondary)',
                border: 'none',
                transition: 'all var(--transition-fast)',
              }}
            >
              Academia &amp; Estudo
            </button>
          </div>
        </div>

        {activeHubTab === 'CLASSIC' && (
          <ClassicModesSection
            botEnabled={botEnabled}
            botDifficulty={botDifficulty}
            onSelectDifficulty={onSelectDifficulty}
            onStartBotMatch={onStartBotMatch}
            onStartLocalMatch={onStartLocalMatch}
            onResumeMatch={onResumeMatch}
            hasActiveMatch={hasActiveMatch}
            turnNumber={turnNumber}
            onOpenStagingModal={(variantId, participants) => {
              setStagingVariantId(variantId);
              setStagingParticipants(participants);
            }}
          />
        )}

      {/* Minigames Grid */}
      {activeHubTab === 'MINIGAMES' && (
        <MinigamesCatalogSection
          onLaunchMinigame={onLaunchMinigame}
          onStartBotMatch={onStartBotMatch}
          botDifficulty={botDifficulty}
          onOpenStagingModal={(variantId, participants) => {
            setStagingVariantId(variantId);
            setStagingParticipants(participants);
          }}
        />
      )}

      {/* Arenas Massivas (3 a 12 Jogadores) */}
      {activeHubTab === 'ARENAS' && (
        <ArenasMultiplayerSection
          onOpenStagingModal={(variantId, participants) => {
            setStagingVariantId(variantId);
            setStagingParticipants(participants);
          }}
          onOpenMatchmaking={() => setIsMatchmakingOpen(true)}
          onOpenLobbyBrowser={() => setIsLobbyBrowserOpen(true)}
          onOpenTournamentModal={() => setIsTournamentModalOpen(true)}
          onOpenLiveSpectate={() => setIsLiveSpectateOpen(true)}
        />
      )}

      {/* Tabuleiros Geométricos & Peças Fadas */}
      {activeHubTab === 'GEOMETRIC' && (
        <GeometricCatalogSection
          onOpenStagingModal={(variantId, participants) => {
            setStagingVariantId(variantId);
            setStagingParticipants(participants);
          }}
        />
      )}

      {/* Variantes Históricas & Regionais */}
      {activeHubTab === 'HISTORICAL' && (
        <HistoricalCatalogSection
          onOpenStagingModal={(variantId, participants) => {
            setStagingVariantId(variantId);
            setStagingParticipants(participants);
          }}
        />
      )}

      {/* Academy Study Area */}
      {activeHubTab === 'ACADEMY' && (
        <AcademyStudySection
          onOpenTournamentModal={() => setIsTournamentModalOpen(true)}
        />
      )}
    </section>

      {/* Pre-Match Universal Staging Modal (Spec 16 § 5, RF-16-06) */}
      {stagingVariantId && (
        <PreMatchStagingModal
          isOpen={true}
          variantId={stagingVariantId}
          initialParticipantsCount={stagingParticipants}
          onClose={() => setStagingVariantId(null)}
          onLaunchMatch={(cfg) => {
            setStagingVariantId(null);
            if (onLaunchMatch) {
              onLaunchMatch(cfg);
            } else if (onLaunchMinigame) {
              onLaunchMinigame(cfg.variantId);
            } else {
              onStartBotMatch(cfg.slots[1]?.botConfig?.difficultyLevel ?? botDifficulty);
            }
          }}
        />
      )}

      {/* Spec 18: Competitive Tournament Arena & Swiss Modal */}
      <TournamentArenaModal
        isOpen={isTournamentModalOpen}
        onClose={() => setIsTournamentModalOpen(false)}
      />

      {/* Spec 08: Global Matchmaking & ELO Ranked Queue Modal */}
      <MatchmakingQueueModal
        isOpen={isMatchmakingOpen}
        onClose={() => setIsMatchmakingOpen(false)}
        userId="player_hub_user"
        displayName="Jogador"
        eloRating={1500}
        variantId="standard"
        playerCount={2}
        onMatchStart={() => {
          setIsMatchmakingOpen(false);
          if (onStartLocalMatch) {
            onStartLocalMatch();
          } else if (onStartBotMatch) {
            onStartBotMatch(botDifficulty);
          }
        }}
      />

      {/* Spec 08: Community Lobbies Browser Modal */}
      <LobbyBrowserModal
        isOpen={isLobbyBrowserOpen}
        onClose={() => setIsLobbyBrowserOpen(false)}
        userId="player_hub_user"
        displayName="Jogador"
        onJoinLobbySuccess={(lobby) => {
          setIsLobbyBrowserOpen(false);
          setStagingVariantId(lobby.variantId);
          setStagingParticipants(lobby.maxPlayers);
        }}
      />

      {/* Spec 08: Live Spectator Streaming Modal (US08-P06, RF-11) */}
      <LiveSpectateModal
        isOpen={isLiveSpectateOpen}
        onClose={() => setIsLiveSpectateOpen(false)}
      />
    </div>
  );
};
