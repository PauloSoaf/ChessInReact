import React, { useEffect, useState, useCallback, useMemo } from 'react';
import ChessBoard from './components/ChessBoard/ChessBoard';
import { useActivePlayer, useGameStore, useTurnNumber } from './bindings/react/useGameStore';
import { useBotMatch } from './bindings/react/useBotMatch';
import { useMoveFeedback } from './bindings/react/useMoveFeedback';
import { AIDifficultyLevel } from './workers/ai/interfaces/IAIEngineContracts';
import { bootstrapGame } from './core/bootstrap/GameInitializer';
import { gameStore } from './core/state/gameStore';
import { ThemeProvider, useTheme } from './ui/theme/ThemeContext';
import { TopNavBar, AppView } from './ui/components/navigation/TopNavBar';
import { ThemeCustomizerModal } from './ui/components/navigation/ThemeCustomizerModal';
import { GameHub } from './ui/components/hub/GameHub';
import { PuzzleRushArena } from './ui/components/hub/PuzzleRushArena';
import { BughouseArena } from './ui/components/hub/BughouseArena';
import { PlayerCard } from './ui/components/game/PlayerCard';
import { EvaluationBar } from './ui/components/game/EvaluationBar';
import { GameControlsBar } from './ui/components/game/GameControlsBar';
import { SpectatorControlsBar } from './ui/components/game/SpectatorControlsBar';
import { MultiplayerFactionRibbon } from './ui/components/game/MultiplayerFactionRibbon';
import { DuckChessBanner } from './ui/components/game/DuckChessBanner';
import { VariantMatchBanner } from './ui/components/game/VariantMatchBanner';
import { OfficialSpellBar } from './ui/components/game/OfficialSpellBar';
import { ReserveDropsBar } from './ui/components/game/ReserveDropsBar';
import { SpellCardHand } from './analysis/minigames/SpellCardHand';
import { ISpellCard } from './analysis/minigames/SpellChessEngine';
import { useUniversalMatch } from './bindings/react/useUniversalMatch';
import { IMatchConfiguration } from './matchmaking/config/IMatchConfiguration';
import { MatchConfigurationManager } from './matchmaking/config/MatchConfigurationManager';
import { RulesEngine } from './engine/rules/RulesEngine';
import { CheckValidator } from './engine/rules/CheckValidator';
import { SquareTopology } from './core/topology/SquareTopology';
import { CompositeArenaLayouts } from './engine/multiplayer/arenas/CompositeArenaLayouts';
import { ArenaModeId } from './engine/multiplayer/arenas/interfaces/IArenaContracts';
import { isWebGLAvailable } from './rendering/webglCapabilities';
import { PlayerId, asCoordinateKey } from './core/coordinates/types';
import { IPieceEntity } from './core/entities/types';
import { GlobalEventBus } from './core/events/EventBus';
import { AudioManager } from './audio';
import { IMoveItem } from './ui/components/game/MoveHistoryList';
import './ui/theme/theme.css';

const PIECE_VALUES: Record<string, number> = {
  PAWN: 1,
  P: 1,
  KNIGHT: 3,
  N: 3,
  BISHOP: 3,
  B: 3,
  ROOK: 5,
  R: 5,
  QUEEN: 9,
  Q: 9,
  KING: 0,
  K: 0,
};

function coordToAlgebraic(coordStr: string): string {
  const parts = coordStr.split(',');
  if (parts.length === 2) {
    const x = parseInt(parts[0], 10);
    const y = parseInt(parts[1], 10);
    if (!isNaN(x) && !isNaN(y) && x >= 0 && x < 26 && y >= 0) {
      return `${String.fromCharCode(97 + x)}${y + 1}`;
    }
  }
  return coordStr;
}

// Lazy-loaded 3D WebGL Chessboard to preserve initial 2D bundle size (Spec 07 Priority 2)
const LazyChessBoard3D = React.lazy(() =>
  import('./rendering/ChessBoard3D').then((m) => ({ default: m.ChessBoard3D }))
);

/**
 * Resilient Error Boundary for 3D WebGL scene failures or WebGL context loss (Spec 07 Priority 3).
 * Seamlessly reverts to the 2D SVG board to prevent blank screens or game interruption.
 */
class ChessBoard3DErrorBoundary extends React.Component<
  { onFallback: () => void; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { onFallback: () => void; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('[ChessBoard3D] WebGL mounting or context failure, reverting to 2D:', error);
    this.props.onFallback();
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

const DIFFICULTY_LABELS: Record<AIDifficultyLevel, string> = {
  1: 'Iniciante (N1)',
  2: 'Casual (N2)',
  3: 'Tático (N3)',
  4: 'Forte (N4)',
  5: 'Mestre (N5)',
};

function normalizeBoardCoordinate(coordinate: string | null): string | null {
  if (!coordinate) return null;
  if (/^-?\d+,-?\d+$/.test(coordinate)) return coordinate;

  const algebraic = coordinate.match(/^([a-zA-Z])([1-9]\d*)$/);
  if (!algebraic) return null;

  const file = algebraic[1].toLowerCase().charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number(algebraic[2]) - 1;
  if (file < 0 || rank < 0) return null;

  return `${file},${rank}`;
}

const AppContent: React.FC = () => {
  const [boardSize, setBoardSize] = useState(8);
  const [currentView, setCurrentView] = useState<AppView>(() => {
    if (typeof window !== 'undefined') {
      if (window.location.hash === '#game') return 'GAME';
      if (window.location.hash === '#puzzle_rush') return 'PUZZLE_RUSH';
      if (window.location.hash === '#bughouse') return 'BUGHOUSE';
    }
    return 'HUB';
  });
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [pendingDrawOffer, setPendingDrawOffer] = useState<PlayerId | null>(null);
  const [selectedOfficialSpell, setSelectedOfficialSpell] = useState<'FREEZE' | 'JUMP' | null>(null);
  const [selectedExpandedSpell, setSelectedExpandedSpell] = useState<ISpellCard | null>(null);
  const [selectedDropPiece, setSelectedDropPiece] = useState<string | null>(null);
  const [portalFirstSquare, setPortalFirstSquare] = useState<string | null>(null);

  // Move History & PGN Notation state (Spec 06 Section 18.1 & Spec 09)
  const [matchMoves, setMatchMoves] = useState<IMoveItem[]>([]);

  // Synchronized Digital Chess Clocks (Spec 06 RF-09: 5 min default with <10s critical alert)
  const [p1TimeLeft, setP1TimeLeft] = useState<number>(300000);
  const [p2TimeLeft, setP2TimeLeft] = useState<number>(300000);

  const { preferences, updatePreferences } = useTheme();
  const isBoardFlipped = Boolean(preferences.flipBoard);

  const activePlayer = useActivePlayer();
  const turnNumber = useTurnNumber();
  const revision = useGameStore((state) => state.domain.revision);
  const isGameOver = useGameStore((state) => state.domain.isGameOver);
  const winnerId = useGameStore((state) => state.domain.winnerId);
  const entityCount = useGameStore((state) => Object.keys(state.domain.boardEntities).length);
  const hasActiveMatch = turnNumber > 1 || revision > 0;

  const domain = useGameStore((state) => state.domain);
  const topology = useMemo(
    () => new SquareTopology({ width: boardSize, height: boardSize }),
    [boardSize]
  );

  // Check state detection for White (P1) and Black (P2)
  const isP1InCheck = useMemo(
    () => CheckValidator.isRoyalInCheck('P1', domain, topology),
    [domain, topology]
  );
  const isP2InCheck = useMemo(
    () => CheckValidator.isRoyalInCheck('P2', domain, topology),
    [domain, topology]
  );

  const {
    feedback: invalidMoveFeedback,
    triggerFeedback,
    clearFeedback,
  } = useMoveFeedback();

  const {
    isBotEnabled: legacyBotEnabled,
    difficulty,
    isThinking,
    lastEval,
    toggleBot,
    setDifficulty,
    cancelSearch,
    forceBotMove,
    updateTopologySize,
  } = useBotMatch({
    botPlayer: 'P2',
    difficulty: 3,
  });

  const universalMatch = useUniversalMatch();
  const isUniversalBotMatch = useMemo(
    () =>
      universalMatch.snapshot.config.matchId === domain.matchId &&
      universalMatch.snapshot.config.slots.some(
        (slot) => slot.role === 'AI_BOT' || slot.role === 'BOT_STANDIN'
      ),
    [domain.matchId, universalMatch.snapshot.config]
  );
  // Universal matches expose the same UI state without re-enabling the
  // legacy controller. This keeps the presentation accurate while preserving
  // one and only one bot command authority.
  const isBotEnabled = isUniversalBotMatch || legacyBotEnabled;
  const duckCoordinate = useMemo(
    () => normalizeBoardCoordinate(universalMatch.snapshot.duckCoordinate),
    [universalMatch.snapshot.duckCoordinate]
  );
  const frozenCoordinates = useMemo(
    () =>
      universalMatch.snapshot.frozenCoordinates
        .map(normalizeBoardCoordinate)
        .filter((coordinate): coordinate is string => coordinate !== null),
    [universalMatch.snapshot.frozenCoordinates]
  );

  // Synchronized digital chess clocks (Spec 06 RF-09)
  useEffect(() => {
    if (isGameOver || currentView === 'HUB') return;
    const timer = setInterval(() => {
      if (activePlayer === 'P1') {
        setP1TimeLeft((t) => {
          const next = Math.max(0, t - 100);
          if (next === 0 && t > 0) {
            GlobalEventBus.emit('GAME_ENDED', { winnerId: 'P2', reason: 'Tempo Esgotado' });
          } else if (next < 10000 && t >= 10000) {
            GlobalEventBus.emit('TIME_WARNING', { playerId: 'P1', secondsLeft: Math.round(next / 1000) });
          }
          return next;
        });
      } else {
        setP2TimeLeft((t) => {
          const next = Math.max(0, t - 100);
          if (next === 0 && t > 0) {
            GlobalEventBus.emit('GAME_ENDED', { winnerId: 'P1', reason: 'Tempo Esgotado' });
          } else if (next < 10000 && t >= 10000) {
            GlobalEventBus.emit('TIME_WARNING', { playerId: 'P2', secondsLeft: Math.round(next / 1000) });
          }
          return next;
        });
      }
    }, 100);
    return () => clearInterval(timer);
  }, [activePlayer, isGameOver, currentView]);

  // Real-time Move History logging via GlobalEventBus (Spec 06 Section 18.1 & Spec 09)
  useEffect(() => {
    const unsubMoved = GlobalEventBus.subscribe('PIECE_MOVED', (payload) => {
      const fromAlg = coordToAlgebraic(payload.from);
      const toAlg = coordToAlgebraic(payload.to);
      const san = `${fromAlg}-${toAlg}`;
      setMatchMoves((prev) => {
        const currentTurn = turnNumber;
        if (payload.actingPlayer === 'P1') {
          return [...prev, { turnNumber: currentTurn, white: san }];
        } else {
          if (prev.length === 0) return [{ turnNumber: currentTurn, black: san }];
          const last = prev[prev.length - 1];
          if (last.black) return [...prev, { turnNumber: currentTurn, black: san }];
          const updated = [...prev];
          updated[updated.length - 1] = { ...last, black: san };
          return updated;
        }
      });
    });

    const unsubDrop = GlobalEventBus.subscribe('PIECE_DROPPED', (payload) => {
      const toAlg = coordToAlgebraic(payload.coordinate);
      const initial = payload.pieceVariant.charAt(0).toUpperCase();
      const san = `${initial}@${toAlg}`;
      setMatchMoves((prev) => {
        const currentTurn = turnNumber;
        if (payload.playerId === 'P1') {
          return [...prev, { turnNumber: currentTurn, white: san }];
        } else {
          if (prev.length === 0) return [{ turnNumber: currentTurn, black: san }];
          const last = prev[prev.length - 1];
          if (last.black) return [...prev, { turnNumber: currentTurn, black: san }];
          const updated = [...prev];
          updated[updated.length - 1] = { ...last, black: san };
          return updated;
        }
      });
    });

    return () => {
      unsubMoved();
      unsubDrop();
    };
  }, [turnNumber]);

  // Captured pieces & material balance calculation (Spec 06 RF-09 & Section 18)
  const { p1Captured, p2Captured, p1Material, p2Material } = useMemo(() => {
    const entities = Object.values(domain.boardEntities).filter(
      (e): e is IPieceEntity => e.type === 'PIECE' && Boolean(e.isCaptured)
    );
    const p1Capt = entities.filter((e) => e.ownerId === 'P2');
    const p2Capt = entities.filter((e) => e.ownerId === 'P1');

    const p1Mat = p1Capt.reduce((acc, e) => acc + (PIECE_VALUES[e.variantId?.toUpperCase()] ?? 1), 0);
    const p2Mat = p2Capt.reduce((acc, e) => acc + (PIECE_VALUES[e.variantId?.toUpperCase()] ?? 1), 0);

    return {
      p1Captured: p1Capt.map((e) => e.variantId?.toUpperCase() ?? 'PAWN'),
      p2Captured: p2Capt.map((e) => e.variantId?.toUpperCase() ?? 'PAWN'),
      p1Material: p1Mat,
      p2Material: p2Mat,
    };
  }, [domain.boardEntities]);

  // Automatically fallback to 2D if WebGL is unavailable on device/browser (Spec 07 Priority 3)
  useEffect(() => {
    if (preferences.boardViewMode === '3D' && !isWebGLAvailable()) {
      console.warn('[App] WebGL unavailable, automatically selecting 2D board mode.');
      updatePreferences({ boardViewMode: '2D' });
    }
  }, [preferences.boardViewMode, updatePreferences]);

  // Initialize Core match on first mount (AUDIT-04 Single Source of Truth)
  useEffect(() => {
    if (entityCount === 0) {
      bootstrapGame({ targetStore: gameStore });
    }
  }, [entityCount]);

  // Two-way synchronization with URL hash (#game vs #hub vs #puzzle_rush)
  useEffect(() => {
    const handleHashChange = () => {
      if (typeof window !== 'undefined') {
        const hash = window.location.hash;
        if (hash === '#game') {
          setCurrentView('GAME');
        } else if (hash === '#puzzle_rush') {
          setCurrentView('PUZZLE_RUSH');
        } else {
          setCurrentView('HUB');
        }
      }
    };
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigateTo = useCallback((view: AppView) => {
    setCurrentView(view);
    if (typeof window !== 'undefined') {
      const targetHash =
        view === 'GAME' ? '#game' : view === 'PUZZLE_RUSH' ? '#puzzle_rush' : view === 'BUGHOUSE' ? '#bughouse' : '#hub';
      if (window.location.hash !== targetHash) {
        window.location.hash = targetHash;
      }
    }
  }, []);

  const handleReset = useCallback(() => {
    cancelSearch();
    clearFeedback();
    setPendingDrawOffer(null);
    setSelectedOfficialSpell(null);
    setSelectedExpandedSpell(null);
    setSelectedDropPiece(null);
    setPortalFirstSquare(null);
    setMatchMoves([]);
    setP1TimeLeft(300000);
    setP2TimeLeft(300000);
    if (universalMatch.snapshot.config.matchId === gameStore.getState().domain.matchId) {
      universalMatch.resetUniversalMatch();
    } else {
      bootstrapGame({ targetStore: gameStore });
    }
  }, [cancelSearch, clearFeedback, universalMatch]);

  const handleToggleBot = useCallback(
    (enabled: boolean) => {
      if (universalMatch.snapshot.config.matchId === gameStore.getState().domain.matchId) {
        universalMatch.updateSlotRole(1, enabled ? 'AI_BOT' : 'HUMAN_LOCAL', difficulty);
        toggleBot(false);
      } else {
        toggleBot(enabled);
      }
    },
    [universalMatch, difficulty, toggleBot]
  );

  const handleSetDifficulty = useCallback(
    (level: AIDifficultyLevel) => {
      setDifficulty(level);
      if (universalMatch.snapshot.config.matchId === gameStore.getState().domain.matchId) {
        universalMatch.updateBotDifficulty(1, level);
      }
    },
    [setDifficulty, universalMatch]
  );

  const handleVariantSquareClick = useCallback(
    (coord: string): boolean => {
      if (selectedDropPiece) {
        if (domain.occupancy[asCoordinateKey(coord)]) {
          triggerFeedback('ILLEGAL_MOVE', {
            message: `A casa ${coord} já está ocupada! Escolha uma casa desocupada para inserir sua peça de reserva.`,
          });
          return true;
        }
        const ok = universalMatch.dropPiece(selectedDropPiece, coord);
        if (ok) {
          const pName = selectedDropPiece;
          GlobalEventBus.emit('PIECE_DROPPED', {
            pieceVariant: pName,
            coordinate: asCoordinateKey(coord),
            playerId: domain.activePlayer,
          });
          setSelectedDropPiece(null);
          triggerFeedback('GAME_EVENT', {
            message: `Peça ${pName} inserida na casa ${coord}!`,
          });
          return true;
        } else {
          triggerFeedback('ILLEGAL_MOVE', {
            message: `Não é possível inserir ${selectedDropPiece} em ${coord} pelas regras da variante (ex: peão na 1ª ou última fileira).`,
          });
          return true;
        }
      }

      if (universalMatch.snapshot.duckPhase === 'PLACE_DUCK') {
        if (domain.occupancy[asCoordinateKey(coord)]) {
          triggerFeedback('ILLEGAL_MOVE', {
            message: 'O Pato só pode ser colocado em uma casa desocupada do tabuleiro!',
          });
          return true;
        }
        const placed = universalMatch.placeDuck(coord);
        if (placed) {
          GlobalEventBus.emit('DUCK_PLACED', {
            coordinate: asCoordinateKey(coord),
            playerId: domain.activePlayer,
          });
          triggerFeedback('GAME_EVENT', {
            message: `🦆 Pato posicionado na casa ${coord}! Lance concluído e vez passada.`,
          });
        }
        return placed;
      }

      if (selectedOfficialSpell) {
        if (selectedOfficialSpell === 'JUMP') {
          const occId = domain.occupancy[asCoordinateKey(coord)];
          if (!occId) {
            triggerFeedback('ILLEGAL_MOVE', {
              message: 'Selecione uma peça própria para conceder a habilidade de salto (Jump)!',
            });
            return true;
          }
          const pEnt = domain.boardEntities[occId] as IPieceEntity | undefined;
          if (pEnt && pEnt.ownerId !== domain.activePlayer) {
            triggerFeedback('ILLEGAL_MOVE', {
              message: 'Você só pode conceder o salto Jump para as suas próprias peças!',
            });
            return true;
          }
        }
        const ok = universalMatch.castOfficialSpell(selectedOfficialSpell, coord);
        if (ok) {
          const sName = selectedOfficialSpell;
          GlobalEventBus.emit('SPELL_CAST', {
            spellType: sName,
            coordinate: asCoordinateKey(coord),
            playerId: domain.activePlayer,
          });
          setSelectedOfficialSpell(null);
          triggerFeedback('GAME_EVENT', {
            message: `✨ Feitiço ${sName} conjurado com sucesso em ${coord}! Agora faça seu lance no tabuleiro.`,
          });
          return true;
        } else {
          triggerFeedback('ILLEGAL_MOVE', {
            message: `Falha ao conjurar ${selectedOfficialSpell} em ${coord}. Verifique se você possui cargas disponíveis e se o feitiço não está em recarga.`,
          });
          return true;
        }
      }

      if (selectedExpandedSpell) {
        if (selectedExpandedSpell.type === 'PORTAL' && !portalFirstSquare) {
          if (domain.occupancy[asCoordinateKey(coord)]) {
            triggerFeedback('ILLEGAL_MOVE', {
              message: 'O Portal só pode ser criado em uma casa desocupada!',
            });
            return true;
          }
          setPortalFirstSquare(coord);
          triggerFeedback('GAME_EVENT', {
            message: `🌀 Primeira entrada do Portal fixada em ${coord}. Clique na segunda casa vazia para conectar o vórtice!`,
          });
          return true;
        }
        const ok = universalMatch.castExpandedSpell(
          selectedExpandedSpell,
          coord,
          portalFirstSquare ?? undefined
        );
        if (ok) {
          const spellName = selectedExpandedSpell.displayName;
          const manaCost = selectedExpandedSpell.manaCost;
          const spellType = selectedExpandedSpell.type;
          GlobalEventBus.emit('SPELL_CAST', {
            spellType,
            coordinate: asCoordinateKey(coord),
            playerId: domain.activePlayer,
          });
          setSelectedExpandedSpell(null);
          setPortalFirstSquare(null);
          triggerFeedback('GAME_EVENT', {
            message: `✨ Feitiço ${spellName} conjurado em ${coord} (-${manaCost} mana)!`,
          });
          return true;
        } else {
          triggerFeedback('ILLEGAL_MOVE', {
            message: `Não foi possível conjurar ${selectedExpandedSpell.displayName} (mana insuficiente ou casa inválida).`,
          });
          return true;
        }
      }

      return false;
    },
    [
      domain.occupancy,
      domain.boardEntities,
      domain.activePlayer,
      universalMatch,
      selectedOfficialSpell,
      selectedExpandedSpell,
      selectedDropPiece,
      portalFirstSquare,
      triggerFeedback,
    ]
  );

  const handleUndo = useCallback(() => {
    cancelSearch();
    clearFeedback();
    setSelectedOfficialSpell(null);
    setSelectedExpandedSpell(null);
    setSelectedDropPiece(null);
    setPortalFirstSquare(null);

    const initialPlayer = gameStore.getState().domain.activePlayer;
    if (isBotEnabled) {
      if (initialPlayer === 'P2') {
        universalMatch.undo();
        while (universalMatch.controller?.peekUndoActionType() === 'SPELL') {
          universalMatch.undo();
        }
      } else {
        const undoneFirst = universalMatch.undo();
        if (undoneFirst) {
          universalMatch.undo();
          while (universalMatch.controller?.peekUndoActionType() === 'SPELL') {
            universalMatch.undo();
          }
        }
      }
    } else {
      universalMatch.undo();
    }

    setMatchMoves((prev) => {
      if (prev.length === 0) return prev;
      const updated = [...prev];
      const pops = isBotEnabled && initialPlayer !== 'P2' ? 2 : 1;
      for (let i = 0; i < pops; i++) {
        if (updated.length === 0) break;
        const last = updated[updated.length - 1];
        if (last.black) {
          updated[updated.length - 1] = { ...last, black: undefined };
        } else {
          updated.pop();
        }
      }
      return updated;
    });
  }, [cancelSearch, clearFeedback, isBotEnabled, universalMatch]);

  const handleRedo = useCallback(() => {
    cancelSearch();
    clearFeedback();
    setSelectedOfficialSpell(null);
    setSelectedExpandedSpell(null);
    setSelectedDropPiece(null);
    setPortalFirstSquare(null);

    if (isBotEnabled) {
      const redoneFirst = universalMatch.redo();
      if (redoneFirst) {
        while (universalMatch.controller?.peekRedoActionType() === 'SPELL') {
          universalMatch.redo();
        }
        if (gameStore.getState().domain.activePlayer === 'P2') {
          universalMatch.redo();
        }
      }
    } else {
      universalMatch.redo();
    }
  }, [cancelSearch, clearFeedback, isBotEnabled, universalMatch]);

  const handleBoardSizeChange = useCallback(
    (newSize: number) => {
      const clamped = Math.max(4, Math.min(16, newSize));
      setBoardSize(clamped);
      updateTopologySize(clamped);
      clearFeedback();
    },
    [updateTopologySize, clearFeedback]
  );

  const handleFlipBoard = useCallback(() => {
    updatePreferences({ flipBoard: !preferences.flipBoard });
    clearFeedback();
  }, [preferences.flipBoard, updatePreferences, clearFeedback]);

  const canClaimDraw = useMemo(
    () => !isGameOver && RulesEngine.canClaimDraw(domain, topology),
    [domain, topology, isGameOver]
  );

  const handleOfferDraw = useCallback(() => {
    if (isGameOver) return;
    clearFeedback();

    if (canClaimDraw) {
      cancelSearch();
      RulesEngine.claimDraw(domain, topology);
      gameStore.setState((s) => ({
        domain: {
          ...s.domain,
          isGameOver: true,
          winnerId: null,
        },
      }));
      setPendingDrawOffer(null);
      triggerFeedback('GAME_TERMINATION', {
        message: 'Empate formal reivindicado por repetição tríplice ou regra dos 50 lances.',
      });
      return;
    }

    if (isBotEnabled) {
      // Proposing mutual draw against Bot
      // Bot evaluates position: accepts if position is balanced (|eval| <= 150)
      const botAccepts = lastEval !== null && Math.abs(lastEval) <= 150;
      if (botAccepts) {
        cancelSearch();
        gameStore.setState((s) => ({
          domain: {
            ...s.domain,
            isGameOver: true,
            winnerId: null,
          },
        }));
        triggerFeedback('GAME_TERMINATION', {
          message: 'Proposta de empate aceita pela IA (posição avaliada como equilibrada). Partida encerrada.',
        });
      } else {
        // Do NOT cancel search; the AI declines and continues playing!
        triggerFeedback('GAME_EVENT', {
          message: 'A IA recusou a proposta de empate por avaliar vantagem competitiva no tabuleiro.',
        });
      }
    } else {
      // Local 2-Player Pass & Play: Requires explicit opponent acceptance
      if (!pendingDrawOffer) {
        setPendingDrawOffer(activePlayer);
        const playerLabel = activePlayer === 'P1' ? 'Brancas' : 'Pretas';
        const opponentLabel = activePlayer === 'P1' ? 'Pretas' : 'Brancas';
        triggerFeedback('GAME_EVENT', {
          message: `${playerLabel} propuseram empate. ${opponentLabel}, cliquem no botão para aceitar ou façam um lance para recusar.`,
        });
      } else if (pendingDrawOffer !== activePlayer) {
        // Opponent accepted the draw!
        gameStore.setState((s) => ({
          domain: {
            ...s.domain,
            isGameOver: true,
            winnerId: null,
          },
        }));
        setPendingDrawOffer(null);
        triggerFeedback('GAME_TERMINATION', {
          message: 'Proposta de empate aceita por mútuo acordo entre ambos os jogadores locais.',
        });
      } else {
        // Same player clicked again to retract offer
        setPendingDrawOffer(null);
        triggerFeedback('GAME_EVENT', {
          message: 'Oferta de empate cancelada.',
        });
      }
    }
  }, [
    isGameOver,
    canClaimDraw,
    isBotEnabled,
    lastEval,
    cancelSearch,
    clearFeedback,
    domain,
    topology,
    triggerFeedback,
    pendingDrawOffer,
    activePlayer,
  ]);

  const handleResign = useCallback(
    (resigningPlayer?: PlayerId | unknown) => {
      if (isGameOver) return;
      cancelSearch();
      clearFeedback();

      // If playing against Bot, the human is P1 (White); resigning always gives victory to P2 (Bot),
      // even if human clicks resign during Bot's thinking turn.
      let resigner: PlayerId;
      if (typeof resigningPlayer === 'string' && (resigningPlayer === 'P1' || resigningPlayer === 'P2')) {
        resigner = resigningPlayer;
      } else if (isBotEnabled) {
        resigner = 'P1';
      } else {
        resigner = activePlayer;
      }

      const winner: PlayerId = resigner === 'P1' ? 'P2' : 'P1';
      const resignerName = resigner === 'P1' ? 'Brancas' : 'Pretas';
      const winnerName = winner === 'P1' ? 'Brancas' : 'Pretas';

      gameStore.setState((s) => ({
        domain: {
          ...s.domain,
          isGameOver: true,
          winnerId: winner,
        },
      }));
      setPendingDrawOffer(null);
      triggerFeedback('GAME_TERMINATION', {
        message: `${resignerName} abandonaram a partida. Vitória concedida às ${winnerName}.`,
      });
    },
    [isGameOver, cancelSearch, clearFeedback, isBotEnabled, activePlayer, triggerFeedback]
  );

  // Global Keyboard Shortcuts (Strictly disabled when modal is open to avoid unintended rollbacks)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isThemeModalOpen) {
        if (e.key === 'Escape') {
          setIsThemeModalOpen(false);
        }
        return;
      }

      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.key === 'Escape') {
        if (selectedOfficialSpell || selectedExpandedSpell || selectedDropPiece || portalFirstSquare) {
          setSelectedOfficialSpell(null);
          setSelectedExpandedSpell(null);
          setSelectedDropPiece(null);
          setPortalFirstSquare(null);
          triggerFeedback('GAME_EVENT', {
            message: 'Ação cancelada.',
          });
          return;
        }
      }

      if (e.key === '1') {
        if (universalMatch.snapshot.officialSpellState) {
          const next = selectedOfficialSpell === 'FREEZE' ? null : 'FREEZE';
          setSelectedOfficialSpell(next);
          triggerFeedback('GAME_EVENT', {
            message: next
              ? 'Feitiço FREEZE preparado! Passe o mouse no tabuleiro para ver a área 3×3 e clique na casa central (ou clique em Cancelar).'
              : 'Seleção de FREEZE cancelada.',
          });
          return;
        }
      } else if (e.key === '2') {
        if (universalMatch.snapshot.officialSpellState) {
          const next = selectedOfficialSpell === 'JUMP' ? null : 'JUMP';
          setSelectedOfficialSpell(next);
          triggerFeedback('GAME_EVENT', {
            message: next
              ? 'Feitiço JUMP preparado! Clique na peça aliada no tabuleiro (ou clique em Cancelar).'
              : 'Seleção de JUMP cancelada.',
          });
          return;
        }
      }

      if (e.key === 'z' || e.key === 'Z') {
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if (e.key === 'y' || e.key === 'Y') {
        handleRedo();
      } else if (e.key === 'h' || e.key === 'H') {
        navigateTo(currentView === 'HUB' ? 'GAME' : 'HUB');
      } else if (e.key === 'v' || e.key === 'V') {
        clearFeedback();
        updatePreferences({ boardViewMode: preferences.boardViewMode === '3D' ? '2D' : '3D' });
      } else if (e.key === 'f' || e.key === 'F') {
        handleFlipBoard();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isThemeModalOpen,
    handleUndo,
    handleRedo,
    navigateTo,
    currentView,
    preferences.boardViewMode,
    updatePreferences,
    clearFeedback,
    handleFlipBoard,
    selectedOfficialSpell,
    selectedExpandedSpell,
    selectedDropPiece,
    portalFirstSquare,
    triggerFeedback,
    universalMatch,
  ]);

  const handleResumeMatch = useCallback(() => {
    navigateTo('GAME');
  }, [navigateTo]);

  const handleLaunchMatch = useCallback(
    (config: IMatchConfiguration) => {
      cancelSearch();
      clearFeedback();
      setPendingDrawOffer(null);
      setMatchMoves([]);
      setP1TimeLeft(300000);
      setP2TimeLeft(300000);
      universalMatch.startUniversalMatch(config);

      const v = config.variantId.toUpperCase();
      if (v === 'CAPABLANCA_CHESS') {
        handleBoardSizeChange(10);
      } else if (v === 'SHOGI') {
        handleBoardSizeChange(9);
      } else if (v === 'XIANGQI') {
        handleBoardSizeChange(10);
      } else {
        const arenaLayout = CompositeArenaLayouts.getLayout(v as ArenaModeId);
        if (arenaLayout) {
          handleBoardSizeChange(arenaLayout.boardType === 'SQUARE_CROSS' ? 14 : 16);
        } else if (config.totalParticipants > 2) {
          handleBoardSizeChange(16);
        } else {
          handleBoardSizeChange(8);
        }
      }

      // The universal controller is authoritative for launched Hub matches.
      // The legacy controller stays disabled so it cannot dispatch a second
      // command for the same player and turn.
      if (config.slots[1]?.botConfig) {
        setDifficulty(config.slots[1].botConfig.difficultyLevel as AIDifficultyLevel);
      }
      toggleBot(false);

      triggerFeedback('GAME_EVENT', {
        message: `Partida iniciada: ${config.variantId.replace(/_/g, ' ')} (${config.totalParticipants} jogadores).`,
      });
      navigateTo('GAME');
    },
    [cancelSearch, clearFeedback, universalMatch, handleBoardSizeChange, setDifficulty, toggleBot, triggerFeedback, navigateTo]
  );

  const handleStartBotMatch = useCallback(
    (level: number) => {
      setDifficulty(level as AIDifficultyLevel);
      let cfg = MatchConfigurationManager.createDefaultMatch('standard', 2);
      cfg = MatchConfigurationManager.updateBotDifficulty(
        cfg,
        1,
        level as AIDifficultyLevel
      );
      handleLaunchMatch(cfg);
    },
    [setDifficulty, handleLaunchMatch]
  );

  const handleStartLocalMatch = useCallback(() => {
    toggleBot(false);
    const base = MatchConfigurationManager.createDefaultMatch('standard', 2);
    const cfg = MatchConfigurationManager.updateSlotRole(base, 1, 'HUMAN_LOCAL');
    handleLaunchMatch(cfg);
  }, [toggleBot, handleLaunchMatch]);

  const handleLaunchMinigame = useCallback(
    (minigameId: string) => {
      const lower = minigameId.toLowerCase();
      if (lower === 'puzzle_rush') {
        clearFeedback();
        navigateTo('PUZZLE_RUSH');
        return;
      }
      if (lower === 'bughouse') {
        clearFeedback();
        navigateTo('BUGHOUSE');
        return;
      }
      const participantCount = minigameId.includes('3P') ? 3 : minigameId.includes('4P') ? 4 : 2;
      const defaultCfg = MatchConfigurationManager.createDefaultMatch(minigameId, participantCount);
      handleLaunchMatch(defaultCfg);
    },
    [clearFeedback, navigateTo, handleLaunchMatch]
  );

  return (
    <div className="app-shell">
      {/* Decoupled Web Audio API Sound Synthesizer & EventBus Listener (Spec 01 & Spec 12) */}
      <AudioManager />

      {/* Persistent Responsive Top Navigation Bar */}
      <TopNavBar
        currentView={currentView}
        onNavigate={navigateTo}
        onOpenThemeModal={() => setIsThemeModalOpen(true)}
        isMatchActive={currentView === 'GAME' || hasActiveMatch}
        turnNumber={turnNumber}
        activePlayer={activePlayer}
        isGameOver={isGameOver}
      />

      {/* Main Content Area */}
      {currentView === 'PUZZLE_RUSH' ? (
        <PuzzleRushArena onBackToHub={() => navigateTo('HUB')} />
      ) : currentView === 'BUGHOUSE' ? (
        <BughouseArena onBackToHub={() => navigateTo('HUB')} />
      ) : currentView === 'HUB' ? (
        <GameHub
          onStartBotMatch={handleStartBotMatch}
          onStartLocalMatch={handleStartLocalMatch}
          onResumeMatch={handleResumeMatch}
          hasActiveMatch={hasActiveMatch}
          turnNumber={turnNumber}
          activePlayer={activePlayer}
          isGameOver={isGameOver}
          botEnabled={isBotEnabled}
          botDifficulty={difficulty}
          onSelectDifficulty={(d) => setDifficulty(d as AIDifficultyLevel)}
          onOpenThemeModal={() => setIsThemeModalOpen(true)}
          onLaunchMinigame={handleLaunchMinigame}
          onLaunchMatch={handleLaunchMatch}
        />
      ) : (
        <div id="match-arena-shell" className="match-arena-shell" data-testid="match-arena-shell">
          <div className="match-arena-grid">
            {/* Left / Center Stage: Protagonist Chessboard + Evaluation Bar + Player Cards */}
            <div className="match-stage-column">
              {/* Spectator Autonomous Controls (0-Human / All-Bot matches) */}
              {universalMatch.snapshot.isSpectatorMatch && (
                <SpectatorControlsBar
                  isPaused={universalMatch.snapshot.isPaused}
                  speed={universalMatch.snapshot.playbackSpeed}
                  isThinking={universalMatch.snapshot.isThinking}
                  lastMoveSummary={universalMatch.snapshot.lastMoveSummary}
                  onTogglePause={universalMatch.togglePause}
                  onSetSpeed={universalMatch.setSpeed}
                  onStepForward={universalMatch.stepForward}
                />
              )}

              {/* Variant Match Header Banner (Spec 06, Spec 12, Spec 16) */}
              <VariantMatchBanner
                variantId={universalMatch.snapshot.config.variantId}
                participantCount={universalMatch.snapshot.config.totalParticipants}
                activePlayerLabel={activePlayer === 'P1' ? 'Brancas' : 'Pretas'}
              />

              {/* Multiplayer Faction Ribbon (3 to 12 participants) */}
              {universalMatch.snapshot.config.totalParticipants > 2 && (
                <MultiplayerFactionRibbon
                  slots={universalMatch.snapshot.config.slots}
                  activePlayer={activePlayer}
                  scores={universalMatch.snapshot.scores}
                  eliminatedPlayers={universalMatch.snapshot.eliminatedPlayers}
                  isThinking={universalMatch.snapshot.isThinking}
                />
              )}

              {/* Duck Chess Two-Phase Turn Banner */}
              {universalMatch.snapshot.config.variantId.toUpperCase().includes('DUCK') && (
                <DuckChessBanner
                  duckCoordinate={universalMatch.snapshot.duckCoordinate}
                  duckPhase={universalMatch.snapshot.duckPhase}
                  activePlayerLabel={activePlayer === 'P1' ? 'Brancas' : 'Pretas'}
                />
              )}

              {/* Official Spell Chess Toolbar */}
              {(universalMatch.snapshot.config.variantId.toUpperCase() === 'SPELL_CHESS_OFFICIAL' ||
                universalMatch.snapshot.config.variantId.toUpperCase() === 'SPELL_CHESS') &&
                universalMatch.snapshot.officialSpellState && (
                  <OfficialSpellBar
                    state={universalMatch.snapshot.officialSpellState}
                    activePlayer={activePlayer}
                    selectedSpellType={selectedOfficialSpell}
                    onCancelSpell={() => {
                      setSelectedOfficialSpell(null);
                      triggerFeedback('GAME_EVENT', {
                        message: 'Lançamento cancelado.',
                      });
                    }}
                    onCastSpell={(spellType) => {
                      const selectedPieceId = gameStore.getState().ui.selectedPieceId;
                      if (spellType === 'JUMP' && selectedPieceId) {
                        const ok = universalMatch.castOfficialSpell('JUMP', selectedPieceId);
                        if (ok) {
                          setSelectedOfficialSpell(null);
                          triggerFeedback('GAME_EVENT', {
                            message: 'Feitiço JUMP conjurado na peça selecionada!',
                          });
                          return;
                        }
                      }
                      if (selectedOfficialSpell === spellType) {
                        setSelectedOfficialSpell(null);
                        triggerFeedback('GAME_EVENT', {
                          message: `Seleção de ${spellType} cancelada.`,
                        });
                        return;
                      }
                      setSelectedOfficialSpell(spellType);
                      triggerFeedback('GAME_EVENT', {
                        message:
                          spellType === 'FREEZE'
                            ? 'Feitiço FREEZE preparado! Passe o mouse no tabuleiro para ver a área 3×3 e clique na casa central (ou clique em Cancelar).'
                            : 'Feitiço JUMP preparado! Clique na peça aliada no tabuleiro (ou clique em Cancelar).',
                      });
                    }}
                  />
                )}

              {/* Expanded Spell Chess Hand */}
              {universalMatch.snapshot.config.variantId.toUpperCase() === 'SPELL_CHESS_EXPANDED' &&
                universalMatch.snapshot.expandedSpellState && (
                  <div style={{ maxWidth: '604px', marginBottom: '0.5rem', width: '100%' }}>
                    <SpellCardHand
                      state={universalMatch.snapshot.expandedSpellState}
                      activePlayer={activePlayer === 'P1' ? 'WHITE' : 'BLACK'}
                      selectedSpellType={selectedExpandedSpell?.type ?? null}
                      onCancelSpell={() => {
                        setSelectedExpandedSpell(null);
                        setPortalFirstSquare(null);
                        triggerFeedback('GAME_EVENT', {
                          message: 'Lançamento cancelado.',
                        });
                      }}
                      onSelectSpell={(spell) => {
                        if (!spell || selectedExpandedSpell?.id === spell.id) {
                          setSelectedExpandedSpell(null);
                          setPortalFirstSquare(null);
                          triggerFeedback('GAME_EVENT', {
                            message: 'Seleção de feitiço cancelada.',
                          });
                          return;
                        }
                        if (spell.type === 'RESURRECTION') {
                          const ok = universalMatch.castExpandedSpell(spell, '4,0');
                          setSelectedExpandedSpell(null);
                          setPortalFirstSquare(null);
                          if (ok) {
                            triggerFeedback('GAME_EVENT', {
                              message: `Feitiço ${spell.displayName} conjurado por ${spell.manaCost} mana!`,
                            });
                          }
                          return;
                        }
                        setSelectedExpandedSpell(spell);
                        setPortalFirstSquare(null);
                        triggerFeedback('GAME_EVENT', {
                          message: `Feitiço ${spell.displayName} preparado! Clique na casa-alvo no tabuleiro (ou clique em Cancelar).`,
                        });
                      }}
                    />
                  </div>
                )}

              {/* Shogi, Crazyhouse & Seirawan Reserve Drops Bar */}
              {(universalMatch.snapshot.config.variantId.toUpperCase().includes('SHOGI') ||
                universalMatch.snapshot.config.variantId.toUpperCase().includes('CRAZYHOUSE') ||
                universalMatch.snapshot.config.variantId.toUpperCase().includes('SEIRAWAN')) && (
                <ReserveDropsBar
                  activePlayer={activePlayer}
                  playerLabel={activePlayer === 'P1' ? 'Brancas' : 'Pretas'}
                  reservePieces={
                    activePlayer === 'P1'
                      ? Object.values(domain.boardEntities).filter(
                          (e): e is IPieceEntity => e.type === 'PIECE' && e.isCaptured && e.ownerId === 'P2'
                        )
                      : Object.values(domain.boardEntities).filter(
                          (e): e is IPieceEntity => e.type === 'PIECE' && e.isCaptured && e.ownerId === 'P1'
                        )
                  }
                  selectedPieceVariant={selectedDropPiece}
                  onSelectDropPiece={setSelectedDropPiece}
                  isShogi={universalMatch.snapshot.config.variantId.toUpperCase().includes('SHOGI')}
                />
              )}

              {/* Top Player Strip (Opponent - Black P2 or Bot 2) */}
              <div className="match-stage-player-wrap">
                <PlayerCard
                  playerId="P2"
                  displayName={
                    universalMatch.snapshot.config.slots[1]?.displayName ??
                    (isBotEnabled ? 'Oponente IA' : 'Jogador 2 (Pretas)')
                  }
                  subtitle={
                    universalMatch.snapshot.config.slots[1]?.role === 'AI_BOT' ||
                      universalMatch.snapshot.config.slots[1]?.role === 'BOT_STANDIN'
                      ? `Peças Pretas • IA (N${universalMatch.snapshot.config.slots[1]?.botConfig?.difficultyLevel ?? difficulty})`
                      : 'Peças Pretas • Controle Manual Local'
                  }
                  isTurnActive={!isGameOver && activePlayer === 'P2'}
                  isThinking={isThinking || (universalMatch.snapshot.isThinking && activePlayer === 'P2')}
                  isBot={
                    universalMatch.snapshot.config.slots[1]?.role === 'AI_BOT' ||
                    universalMatch.snapshot.config.slots[1]?.role === 'BOT_STANDIN' ||
                    isBotEnabled
                  }
                  difficultyLabel={
                    universalMatch.snapshot.config.slots[1]?.botConfig
                      ? DIFFICULTY_LABELS[universalMatch.snapshot.config.slots[1].botConfig!.difficultyLevel]
                      : isBotEnabled
                        ? DIFFICULTY_LABELS[difficulty]
                        : undefined
                  }
                  capturedPieces={p2Captured}
                  materialAdvantage={p2Material > p1Material ? p2Material - p1Material : undefined}
                  timeLeftMs={p2TimeLeft}
                  isInCheck={!isGameOver && isP2InCheck}
                />
              </div>

              {/* Board Perspective & View Mode Switcher Ribbon (2D vs 3D and Board Flip) */}
              <div
                className="match-stage-controls-ribbon"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  maxWidth: '604px',
                  padding: '0.45rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-sunken)',
                  border: '1px solid var(--border-prominent)',
                  boxShadow: 'var(--shadow-sm)',
                  gap: '0.5rem',
                  flexWrap: 'wrap',
                }}
              >
                {/* 2D / 3D Prominent Segmented Switcher */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 800,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Visualização:
                  </span>
                  <div
                    style={{
                      display: 'inline-flex',
                      borderRadius: 'var(--radius-sm)',
                      overflow: 'hidden',
                      border: '1.5px solid var(--border-prominent)',
                      backgroundColor: 'var(--bg-card)',
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  >
                    <button
                      id="arena-view-mode-2d-btn"
                      type="button"
                      aria-label="Ativar Visão 2D Clássica"
                      onClick={() => {
                        clearFeedback();
                        updatePreferences({ boardViewMode: '2D' });
                      }}
                      style={{
                        padding: '0.36rem 0.75rem',
                        fontSize: '0.78rem',
                        fontWeight: preferences.boardViewMode !== '3D' ? 800 : 600,
                        cursor: 'pointer',
                        backgroundColor: preferences.boardViewMode !== '3D' ? 'var(--color-accent)' : 'transparent',
                        color: preferences.boardViewMode !== '3D' ? '#ffffff' : 'var(--text-secondary)',
                        border: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        transition: 'all var(--transition-fast)',
                      }}
                      title="Modo 2D Clássico / Vetorial (Atalho: V)"
                    >
                      <span style={{ fontSize: '0.85rem' }}>📐</span>
                      <span>2D Vetorial</span>
                    </button>
                    <button
                      id="arena-view-mode-3d-btn"
                      type="button"
                      aria-label="Ativar Visão 3D"
                      onClick={() => {
                        clearFeedback();
                        updatePreferences({ boardViewMode: '3D' });
                      }}
                      style={{
                        padding: '0.36rem 0.75rem',
                        fontSize: '0.78rem',
                        fontWeight: preferences.boardViewMode === '3D' ? 800 : 600,
                        cursor: 'pointer',
                        backgroundColor: preferences.boardViewMode === '3D' ? 'var(--color-accent)' : 'transparent',
                        color: preferences.boardViewMode === '3D' ? '#ffffff' : 'var(--text-secondary)',
                        border: 'none',
                        borderLeft: '1px solid var(--border-subtle)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        transition: 'all var(--transition-fast)',
                      }}
                      title="Modo 3D WebGL Realtime (Atalho: V)"
                    >
                      <span style={{ fontSize: '0.85rem' }}>🎲</span>
                      <span>Modo 3D</span>
                    </button>
                  </div>
                </div>

                {/* Flip Board Quick Trigger */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <button
                    id="arena-flip-board-quick-btn"
                    type="button"
                    onClick={handleFlipBoard}
                    title="Inverter orientação do tabuleiro (Atalho: F)"
                    style={{
                      padding: '0.36rem 0.75rem',
                      fontSize: '0.76rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      backgroundColor: isBoardFlipped ? 'var(--color-accent-subtle)' : 'var(--bg-card)',
                      color: isBoardFlipped ? 'var(--color-accent)' : 'var(--text-secondary)',
                      border: isBoardFlipped ? '1.5px solid var(--border-active)' : '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  >
                    <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 10a6 6 0 0110.24-4.24L16 7M16 3v4h-4M16 10a6 6 0 01-10.24 4.24L4 13M4 17v-4h4" />
                    </svg>
                    <span>Girar</span>
                  </button>
                </div>
              </div>

              {/* Sculpted Board Bezel: Real-time Evaluation Bar + Protagonist Board */}
              <div className="match-board-bezel" style={{ width: '100%', maxWidth: '604px' }}>
                <div style={{ display: 'flex', flexShrink: 0, alignSelf: 'stretch' }}>
                  <EvaluationBar evalScore={lastEval} />
                </div>

                {preferences.boardViewMode === '3D' ? (
                  <ChessBoard3DErrorBoundary
                    onFallback={() => {
                      updatePreferences({ boardViewMode: '2D' });
                    }}
                  >
                    <React.Suspense
                      fallback={
                        <div
                          data-testid="chess-board-3d-loading"
                          style={{
                            width: 'min(75vw, 520px)',
                            height: 'min(75vw, 520px)',
                            borderRadius: 'var(--radius-lg)',
                            border: '2px solid var(--border-prominent)',
                            backgroundColor: 'var(--bg-card)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--text-secondary)',
                            fontSize: '0.82rem',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          Carregando Tabuleiro 3D WebGL...
                        </div>
                      }
                    >
                      <LazyChessBoard3D
                        boardSize={boardSize}
                        topology={universalMatch.controller?.getTopology()}
                        isBotThinking={isThinking || universalMatch.snapshot.isThinking}
                        botPlayer={isBotEnabled ? 'P2' : undefined}
                        disabled={
                          universalMatch.snapshot.isSpectatorMatch ||
                          (universalMatch.snapshot.duckPhase !== 'PLACE_DUCK' &&
                            (universalMatch.snapshot.activeSlot?.role === 'AI_BOT' ||
                              universalMatch.snapshot.activeSlot?.role === 'BOT_STANDIN' ||
                              (isBotEnabled && activePlayer === 'P2')))
                        }
                        isFlipped={isBoardFlipped}
                        invalidMoveFeedback={invalidMoveFeedback}
                        onTriggerInvalidMove={triggerFeedback}
                        onClearInvalidMove={clearFeedback}
                        onFallbackTo2D={() => updatePreferences({ boardViewMode: '2D' })}
                        duckCoordinate={duckCoordinate}
                        frozenCoordinates={frozenCoordinates}
                        activePortals={universalMatch.snapshot.expandedSpellState?.activePortals}
                        stealthTraps={universalMatch.snapshot.expandedSpellState?.stealthTraps}
                        onHumanPieceMoved={universalMatch.onHumanPieceMoved}
                        onVariantSquareClick={
                          universalMatch.snapshot.duckPhase === 'PLACE_DUCK' ||
                            Boolean(selectedOfficialSpell) ||
                            Boolean(selectedExpandedSpell) ||
                            Boolean(selectedDropPiece)
                            ? handleVariantSquareClick
                            : undefined
                        }
                      />
                    </React.Suspense>
                  </ChessBoard3DErrorBoundary>
                ) : (
                  <main
                    style={{
                      flex: 1,
                      maxWidth: '548px',
                      aspectRatio: '1 / 1',
                      borderRadius: 'var(--radius-md)',
                      overflow: 'hidden',
                      boxShadow: 'var(--shadow-lg)',
                      border: '2px solid var(--border-prominent)',
                      backgroundColor: 'var(--bg-card)',
                    }}
                  >
                    <ChessBoard
                      boardSize={boardSize}
                      topology={universalMatch.controller?.getTopology()}
                      isBotThinking={isThinking || universalMatch.snapshot.isThinking}
                      botPlayer={isBotEnabled ? 'P2' : undefined}
                      disabled={
                        universalMatch.snapshot.isSpectatorMatch ||
                        (universalMatch.snapshot.duckPhase !== 'PLACE_DUCK' &&
                          (universalMatch.snapshot.activeSlot?.role === 'AI_BOT' ||
                            universalMatch.snapshot.activeSlot?.role === 'BOT_STANDIN' ||
                            (isBotEnabled && activePlayer === 'P2')))
                      }
                      invalidMoveFeedback={invalidMoveFeedback}
                      onTriggerInvalidMove={triggerFeedback}
                      onClearInvalidMove={clearFeedback}
                      duckCoordinate={duckCoordinate}
                      frozenCoordinates={frozenCoordinates}
                      activePortals={universalMatch.snapshot.expandedSpellState?.activePortals}
                      stealthTraps={universalMatch.snapshot.expandedSpellState?.stealthTraps}
                      selectedSpellType={selectedOfficialSpell ?? selectedExpandedSpell?.type ?? null}
                      selectedDropPiece={selectedDropPiece}
                      duckPlacementActive={universalMatch.snapshot.duckPhase === 'PLACE_DUCK'}
                      onCancelAction={() => {
                        setSelectedOfficialSpell(null);
                        setSelectedExpandedSpell(null);
                        setSelectedDropPiece(null);
                        setPortalFirstSquare(null);
                        triggerFeedback('GAME_EVENT', {
                          message: 'Ação cancelada.',
                        });
                      }}
                      onHumanPieceMoved={universalMatch.onHumanPieceMoved}
                      onVariantSquareClick={
                        universalMatch.snapshot.duckPhase === 'PLACE_DUCK' ||
                          Boolean(selectedOfficialSpell) ||
                          Boolean(selectedExpandedSpell) ||
                          Boolean(selectedDropPiece)
                          ? handleVariantSquareClick
                          : undefined
                      }
                    />
                  </main>
                )}
              </div>

              {/* Bottom Player Strip (Human - White P1 or Bot 1) */}
              <div className="match-stage-player-wrap">
                <PlayerCard
                  playerId="P1"
                  displayName={universalMatch.snapshot.config.slots[0]?.displayName ?? 'Você (Brancas)'}
                  subtitle={
                    universalMatch.snapshot.config.slots[0]?.role === 'AI_BOT' ||
                      universalMatch.snapshot.config.slots[0]?.role === 'BOT_STANDIN'
                      ? `Peças Brancas • IA (N${universalMatch.snapshot.config.slots[0]?.botConfig?.difficultyLevel ?? difficulty})`
                      : 'Peças Brancas • Perspectiva Principal'
                  }
                  isTurnActive={!isGameOver && activePlayer === 'P1'}
                  isThinking={universalMatch.snapshot.isThinking && activePlayer === 'P1'}
                  isBot={
                    universalMatch.snapshot.config.slots[0]?.role === 'AI_BOT' ||
                    universalMatch.snapshot.config.slots[0]?.role === 'BOT_STANDIN'
                  }
                  difficultyLabel={
                    universalMatch.snapshot.config.slots[0]?.botConfig
                      ? DIFFICULTY_LABELS[universalMatch.snapshot.config.slots[0].botConfig!.difficultyLevel]
                      : undefined
                  }
                  capturedPieces={p1Captured}
                  materialAdvantage={p1Material > p2Material ? p1Material - p2Material : undefined}
                  timeLeftMs={p1TimeLeft}
                  isInCheck={!isGameOver && isP1InCheck}
                />
              </div>
            </div>

            {/* Right Sidebar: Match Status & Tactical Controls Deck */}
            <aside className="match-hud-sidebar" aria-label="Estado e Controles da Partida">
              {/* Check Constraint & Move Error Feedback Banner (US04-P06, SPEC07-CHECK-CONSTRAINT-FEEDBACK-01) */}
              {invalidMoveFeedback && (
                <div
                  role="status"
                  aria-live="polite"
                  data-testid="check-constraint-banner"
                  className={`check-constraint-banner ${invalidMoveFeedback.reason === 'CHECK_CONSTRAINT'
                      ? 'check-constraint-banner--danger'
                      : invalidMoveFeedback.reason === 'GAME_TERMINATION'
                        ? 'check-constraint-banner--info'
                        : invalidMoveFeedback.reason === 'GAME_EVENT'
                          ? 'check-constraint-banner--event'
                          : 'check-constraint-banner--warning'
                    }`}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.65rem',
                    padding: '0.65rem 0.85rem',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor:
                      invalidMoveFeedback.reason === 'CHECK_CONSTRAINT'
                        ? 'var(--color-danger-bg)'
                        : invalidMoveFeedback.reason === 'GAME_TERMINATION'
                          ? 'rgba(79, 140, 255, 0.12)'
                          : invalidMoveFeedback.reason === 'GAME_EVENT'
                            ? 'var(--bg-sunken)'
                            : 'rgba(212, 155, 75, 0.14)',
                    border:
                      invalidMoveFeedback.reason === 'CHECK_CONSTRAINT'
                        ? '1.5px solid var(--color-danger)'
                        : invalidMoveFeedback.reason === 'GAME_TERMINATION'
                          ? '1.5px solid var(--color-accent)'
                          : invalidMoveFeedback.reason === 'GAME_EVENT'
                            ? '1.5px solid var(--border-prominent)'
                            : '1.5px solid var(--color-warning)',
                    boxShadow:
                      invalidMoveFeedback.reason === 'CHECK_CONSTRAINT'
                        ? '0 4px 16px rgba(239, 68, 68, 0.22)'
                        : '0 4px 16px rgba(0, 0, 0, 0.15)',
                    animation: invalidMoveFeedback.reason === 'CHECK_CONSTRAINT' ? 'checkErrorShake 0.4s ease' : undefined,
                  }}
                >
                  <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>
                    {invalidMoveFeedback.reason === 'CHECK_CONSTRAINT'
                      ? '⚠️'
                      : invalidMoveFeedback.reason === 'GAME_TERMINATION'
                        ? '🏁'
                        : invalidMoveFeedback.reason === 'GAME_EVENT'
                          ? '📢'
                          : '⚠️'}
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: 0 }}>
                    <strong
                      style={{
                        fontSize: '0.78rem',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 800,
                        color:
                          invalidMoveFeedback.reason === 'CHECK_CONSTRAINT'
                            ? 'var(--color-danger)'
                            : invalidMoveFeedback.reason === 'GAME_TERMINATION'
                              ? 'var(--color-accent)'
                              : invalidMoveFeedback.reason === 'GAME_EVENT'
                                ? 'var(--text-primary)'
                                : 'var(--color-warning)',
                      }}
                    >
                      {invalidMoveFeedback.reason === 'CHECK_CONSTRAINT'
                        ? 'MOVIMENTO INVÁLIDO: REI EM XEQUE'
                        : invalidMoveFeedback.reason === 'GAME_TERMINATION'
                          ? 'DESFECHO DA PARTIDA'
                          : invalidMoveFeedback.reason === 'GAME_EVENT'
                            ? 'AVISO DA PARTIDA'
                            : 'MOVIMENTO NÃO PERMITIDO'}
                    </strong>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                      {invalidMoveFeedback.message}
                    </span>
                  </div>
                </div>
              )}

              <div className="match-telemetry-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="ui-btn ui-btn--ghost"
                    onClick={() => navigateTo('HUB')}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-secondary)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.3rem 0.65rem',
                    }}
                  >
                    <span>←</span>
                    <span>Voltar ao Hub</span>
                  </button>

                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.07em',
                      color: 'var(--color-accent)',
                    }}
                  >
                    {isBotEnabled ? `Partida vs IA (${DIFFICULTY_LABELS[difficulty]})` : 'Duelo Local'}
                  </span>
                </div>

                {isGameOver && (
                  <div
                    role="status"
                    style={{
                      color: 'var(--color-danger)',
                      fontWeight: 800,
                      fontSize: '0.78rem',
                      fontFamily: 'var(--font-mono)',
                      letterSpacing: '0.06em',
                      padding: '0.55rem 0.75rem',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--color-danger-bg)',
                      border: '1px solid var(--color-danger-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>FIM DE JOGO</span>
                    <span>
                      {winnerId
                        ? `Vitória: ${winnerId === 'P1' ? 'Brancas' : 'Pretas'}`
                        : 'Partida Encerrada'}
                    </span>
                  </div>
                )}

                <div className="match-telemetry-grid">
                  <div className="match-stat-cell">
                    <span className="match-stat-label">Turno</span>
                    <span className="match-stat-value">#{turnNumber}</span>
                  </div>
                  <div className="match-stat-cell">
                    <span className="match-stat-label">Vez de Jogar</span>
                    <span className="match-stat-value">
                      {isGameOver ? 'Encerrada' : activePlayer === 'P1' ? 'Brancas' : 'Pretas'}
                    </span>
                  </div>
                  <div className="match-stat-cell">
                    <span className="match-stat-label">Tabuleiro</span>
                    <span className="match-stat-value">
                      {boardSize}×{boardSize}
                    </span>
                  </div>
                </div>
              </div>

              <GameControlsBar
                isBotEnabled={isBotEnabled}
                difficulty={difficulty}
                isThinking={isThinking || universalMatch.snapshot.isThinking}
                lastEval={lastEval}
                boardSize={boardSize}
                onToggleBot={handleToggleBot}
                onSetDifficulty={handleSetDifficulty}
                onBoardSizeChange={handleBoardSizeChange}
                onUndo={handleUndo}
                onRedo={handleRedo}
                onReset={handleReset}
                onOpenThemeModal={() => setIsThemeModalOpen(true)}
                onFlipBoard={handleFlipBoard}
                isBoardFlipped={isBoardFlipped}
                boardViewMode={preferences.boardViewMode ?? '2D'}
                onToggleBoardViewMode={(mode) => {
                  clearFeedback();
                  updatePreferences({ boardViewMode: mode });
                }}
                onForceBotMove={
                  isUniversalBotMatch ? () => void universalMatch.stepForward() : forceBotMove
                }
                onOfferDraw={handleOfferDraw}
                onResign={handleResign}
                isGameOver={isGameOver}
                canClaimDraw={canClaimDraw}
                pendingDrawOffer={pendingDrawOffer}
                activePlayer={activePlayer}
                moves={matchMoves}
              />
            </aside>
          </div>
        </div>
      )}

      {/* Theme Customizer Live Preview Modal */}
      <ThemeCustomizerModal
        isOpen={isThemeModalOpen}
        onClose={() => setIsThemeModalOpen(false)}
      />
    </div>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
};

export default App;
