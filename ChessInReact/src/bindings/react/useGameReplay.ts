/**
 * Presentation-only replay. It reads the match journal and tells the controller to hold the
 * live game while a past position is on screen. It never writes to the game store.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UniversalMatchController } from '../../controllers/UniversalMatchController';
import { IDomainState } from '../../core/state/gameState';
import { IPieceEntity } from '../../core/entities/types';
import { toAlgebraic } from '../../engine/rules/utils/CoordinateHelper';
import { ReplaySpeed } from '../../ui/components/game/ReplayNavigationBar';

export interface IReplayAnimation {
  /** Changes for every new animation, so that an older one is cancelled. */
  readonly token: number;
  readonly from: string;
  readonly to: string;
  readonly captured?: { readonly ownerId: string; readonly variantId: string };
}

export interface IReplayFrame {
  readonly domain: IDomainState;
  readonly lastMove: { readonly from?: string; readonly to: string } | null;
  readonly frozenCoordinates: string[];
  readonly duckCoordinate: string | null;
  readonly animation: IReplayAnimation | null;
  readonly spellText: string | null;
  readonly jumpCoordinate: string | null;
  /** Changes when the board must be redrawn without sliding pieces between distant positions. */
  readonly snapKey: number;
}

const SPELL_PREVIEW_MS = 700;
const STEP_MS = 900;

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

const square = (coord: string): string => {
  const [x, y] = coord.split(',').map(Number);
  return Number.isInteger(x) && Number.isInteger(y) ? toAlgebraic(x, y) : coord;
};

interface IView {
  readonly ply: number;
  /** Showing the board right after the spell, before the move of the same turn. */
  readonly preview: boolean;
  readonly token: number;
  readonly animate: boolean;
  readonly snapKey: number;
}

export function useGameReplay(controller: UniversalMatchController | null, matchId: string) {
  const [view, setView] = useState<IView | null>(null);
  const [isPlaying, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<ReplaySpeed>(1);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewRef = useRef<IView | null>(null);
  viewRef.current = view;
  const counter = useRef(0);

  const timeline = controller?.journal.current;
  const available = Boolean(controller && timeline && timeline.length > 0 &&
    controller.getConfig().matchId === matchId);
  const livePly = available ? timeline!.livePly : 0;

  const clearPreview = (): void => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = null;
  };

  const exit = useCallback(() => {
    clearPreview();
    setPlaying(false);
    setView(null);
    controller?.exitReview();
  }, [controller]);

  const show = useCallback((target: number) => {
    if (!available || !controller) return;
    const line = controller.journal.current;
    const ply = Math.max(0, Math.min(line.livePly, Math.trunc(target)));
    clearPreview();
    controller.enterReview();
    const previous = viewRef.current?.ply ?? line.livePly;
    const step = ply - previous;
    const reduced = prefersReducedMotion();
    const token = ++counter.current;
    const snapKey = Math.abs(step) <= 1 && !reduced ? viewRef.current?.snapKey ?? 0 : token;
    // Backwards steps are drawn directly; only the move that leads to a position is animated.
    const animate = !reduced && step >= 0 && ply > 0;
    const hasSpell = animate && (line.entry(ply)?.spells.length ?? 0) > 0;
    setView({ ply, preview: hasSpell, token, animate: animate && !hasSpell, snapKey });
    if (hasSpell) {
      previewTimer.current = setTimeout(() => {
        previewTimer.current = null;
        setView({ ply, preview: false, token: ++counter.current, animate: true, snapKey });
      }, SPELL_PREVIEW_MS / speed);
    }
  }, [available, controller, speed]);

  // A different match (or a restored one) always starts live.
  useEffect(() => {
    clearPreview();
    setPlaying(false);
    setView(null);
    return clearPreview;
  }, [matchId]);

  useEffect(() => {
    if (!isPlaying || !view || view.preview) return undefined;
    if (view.ply >= livePly) {
      setPlaying(false);
      return undefined;
    }
    const timer = setTimeout(() => show(view.ply + 1), STEP_MS / speed);
    return () => clearTimeout(timer);
  }, [isPlaying, view, livePly, speed, show]);

  const togglePlay = useCallback(() => {
    if (isPlaying) { setPlaying(false); return; }
    const current = viewRef.current?.ply;
    if (current === undefined || current >= livePly) show(0);
    setPlaying(true);
  }, [isPlaying, livePly, show]);

  const frame = useMemo((): IReplayFrame | null => {
    if (!view || !available || !controller) return null;
    const line = controller.journal.current;
    // `livePly` also makes the frame follow rewinds of the underlying timeline.
    const ply = Math.min(view.ply, livePly);
    const entry = line.entry(ply);
    const spells = entry?.spells ?? [];
    const state = view.preview && spells.length
      ? line.stateAfterEvent(spells[spells.length - 1].eventIndex)
      : line.stateAtPly(ply);
    const official = state.variant.officialSpellState;
    const expanded = state.variant.expandedSpellState as { frozenCoordinates?: Record<string, unknown> } | null;
    const move = entry && !view.preview && entry.move.from.includes(',')
      ? { from: entry.move.from, to: entry.move.to } : null;
    let animation: IReplayAnimation | null = null;
    if (view.animate && move && entry) {
      const capturedId = entry.move.capturedPieceId;
      const captured = capturedId ? state.domain.boardEntities[capturedId as keyof typeof state.domain.boardEntities] : undefined;
      animation = {
        token: view.token, from: move.from, to: move.to,
        captured: captured?.type === 'PIECE'
          ? { ownerId: (captured as IPieceEntity).ownerId, variantId: (captured as IPieceEntity).variantId } : undefined,
      };
    }
    const jump = spells.find((s) => s.payload.spell.type === 'JUMP');
    return {
      domain: state.domain,
      lastMove: move,
      // The freeze that shaped this turn stays visible while the turn is on screen.
      frozenCoordinates: [
        ...Object.keys(official?.activeFrozenCoordinates ?? {}),
        ...Object.keys(expanded?.frozenCoordinates ?? {}),
      ],
      duckCoordinate: state.variant.duckState?.duckCoordinate ?? null,
      animation,
      spellText: spells.length
        ? `${spells.map((s) => `${s.payload.spell.type === 'JUMP' ? 'Jump' : s.payload.spell.type === 'FREEZE' ? 'Freeze' : s.payload.spell.type}(${square(s.payload.spell.targetSquare)})`).join(' + ')}${view.preview ? ' — antes do lance' : ''}`
        : null,
      jumpCoordinate: jump ? jump.payload.spell.targetSquare : null,
      snapKey: view.snapKey,
    };
  }, [view, available, controller, livePly]);

  return {
    available,
    livePly,
    selectedPly: view ? Math.min(view.ply, livePly) : null,
    isReplayMode: view !== null,
    isPlaying,
    speed,
    setSpeed,
    selectPly: show,
    togglePlay,
    exit,
    frame,
  };
}
