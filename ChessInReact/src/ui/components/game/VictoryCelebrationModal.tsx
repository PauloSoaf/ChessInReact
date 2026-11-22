import React, { useEffect, useRef } from 'react';
import { PlayerId } from '../../../core/coordinates/types';

export interface IVictoryCelebrationModalProps {
  readonly isOpen: boolean;
  readonly winnerId: PlayerId | null;
  readonly reason?: string;
  readonly turnNumber?: number;
  readonly variantName?: string;
  readonly isRanked?: boolean;
  readonly onRematch: () => void;
  readonly onOpenReview?: () => void;
  readonly onClose: () => void;
}

interface IConfettiParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
  shape: 'rect' | 'circle';
}

const CONFETTI_COLORS = [
  '#f59e0b', // amber / gold
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#38bdf8', // sky
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#f43f5e', // rose
  '#e2e8f0', // slate
];

export const VictoryCelebrationModal: React.FC<IVictoryCelebrationModalProps> = ({
  isOpen,
  winnerId,
  reason,
  turnNumber,
  variantName,
  isRanked = false,
  onRematch,
  onOpenReview,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const isUserWinner = winnerId === 'P1';
  const isDraw = !winnerId;

  // Run confetti burst when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = (canvas.width = window.innerWidth);
    const height = (canvas.height = window.innerHeight);

    const particles: IConfettiParticle[] = [];
    const particleCount = isUserWinner ? 140 : 50;

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: width / 2 + (Math.random() - 0.5) * 200,
        y: height * 0.28 + (Math.random() - 0.5) * 80,
        vx: (Math.random() - 0.5) * 14,
        vy: -Math.random() * 12 - 4,
        size: Math.random() * 8 + 4,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 12,
        opacity: 1,
        shape: Math.random() > 0.4 ? 'rect' : 'circle',
      });
    }

    const startTime = performance.now();

    const animate = (time: number) => {
      const elapsed = time - startTime;
      ctx.clearRect(0, 0, width, height);

      let aliveCount = 0;

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.32; // gravity
        p.vx *= 0.985; // air drag
        p.rotation += p.rotationSpeed;

        if (elapsed > 2500) {
          p.opacity -= 0.015;
        }

        if (p.opacity > 0 && p.y < height + 20) {
          aliveCount++;
          ctx.save();
          ctx.globalAlpha = Math.max(0, p.opacity);
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.fillStyle = p.color;

          if (p.shape === 'rect') {
            ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          } else {
            ctx.beginPath();
            ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      }

      if (aliveCount > 0 && elapsed < 6000) {
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen, isUserWinner]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const headerTitle = isDraw
    ? 'Partida Empatada'
    : isUserWinner
    ? 'Vitória!'
    : winnerId === 'P2'
    ? 'Vitória das Pretas'
    : 'Fim de Jogo';

  const headerSubtitle = isDraw
    ? 'Empate confirmado pelas regras oficiais.'
    : isUserWinner
    ? 'Excelente partida! Você conquistou a vitória.'
    : 'O adversário venceu o confronto.';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="victory-modal-title"
      data-testid="victory-celebration-modal"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99990,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
        backgroundColor: 'rgba(5, 10, 24, 0.78)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        animation: 'fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Zero-Dependency Confetti Canvas */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 99991,
        }}
      />

      {/* Main Modern Clinical NutriOpus Card */}
      <div
        style={{
          position: 'relative',
          zIndex: 99992,
          width: '100%',
          maxWidth: '470px',
          backgroundColor: 'rgba(15, 23, 42, 0.96)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '16px',
          boxShadow: isUserWinner
            ? '0 20px 50px -10px rgba(0, 0, 0, 0.8), 0 0 35px rgba(16, 185, 129, 0.25)'
            : '0 20px 50px -10px rgba(0, 0, 0, 0.8), 0 0 30px rgba(56, 189, 248, 0.15)',
          padding: '2rem 1.75rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: '1.25rem',
          transform: 'translateY(0)',
          animation: 'modalSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Dismiss Button (✕) */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar modal de vitória"
          title="Fechar e ver tabuleiro (Esc)"
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted, #94a3b8)',
            cursor: 'pointer',
            padding: '6px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted, #94a3b8)')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Hero Crown / Trophy SVG Icon (Clean NutriOpus style - No emoji clutter) */}
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isDraw
              ? 'rgba(148, 163, 184, 0.12)'
              : isUserWinner
              ? 'rgba(16, 185, 129, 0.15)'
              : 'rgba(56, 189, 248, 0.15)',
            border: `1.5px solid ${
              isDraw
                ? 'rgba(148, 163, 184, 0.3)'
                : isUserWinner
                ? 'rgba(16, 185, 129, 0.4)'
                : 'rgba(56, 189, 248, 0.3)'
            }`,
            color: isDraw ? '#94a3b8' : isUserWinner ? '#34d399' : '#38bdf8',
            boxShadow: isUserWinner ? '0 0 24px rgba(16, 185, 129, 0.3)' : '0 0 20px rgba(56, 189, 248, 0.2)',
          }}
        >
          {isUserWinner ? (
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
              <path d="M4 22h16" />
              <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
              <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
              <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
            </svg>
          ) : isDraw ? (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          ) : (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
              <line x1="4" y1="22" x2="4" y2="15" />
            </svg>
          )}
        </div>

        {/* Title and Subtitle */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <h2
            id="victory-modal-title"
            style={{
              margin: 0,
              fontSize: '1.65rem',
              fontWeight: 800,
              fontFamily: 'var(--font-sans, Inter, sans-serif)',
              letterSpacing: '-0.02em',
              color: isDraw ? '#f1f5f9' : isUserWinner ? '#34d399' : '#38bdf8',
            }}
          >
            {headerTitle}
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: '0.86rem',
              color: 'var(--text-secondary, #cbd5e1)',
              lineHeight: 1.4,
            }}
          >
            {headerSubtitle}
          </p>
        </div>

        {/* Reason Pill (Captura Real, Xeque-mate, etc.) */}
        {reason && (
          <div
            style={{
              width: '100%',
              padding: '0.65rem 0.85rem',
              borderRadius: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              fontSize: '0.82rem',
              fontFamily: 'var(--font-mono, monospace)',
              color: '#e2e8f0',
              lineHeight: 1.45,
            }}
          >
            {reason}
          </div>
        )}

        {/* Match Statistics Chips */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            flexWrap: 'wrap',
            width: '100%',
          }}
        >
          {variantName && (
            <span
              style={{
                fontSize: '0.72rem',
                fontFamily: 'var(--font-mono, monospace)',
                color: 'var(--text-muted, #94a3b8)',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                padding: '3px 8px',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              {variantName}
            </span>
          )}
          {typeof turnNumber === 'number' && (
            <span
              style={{
                fontSize: '0.72rem',
                fontFamily: 'var(--font-mono, monospace)',
                color: 'var(--text-muted, #94a3b8)',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                padding: '3px 8px',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              {turnNumber} Turnos
            </span>
          )}
          <span
            style={{
              fontSize: '0.72rem',
              fontFamily: 'var(--font-mono, monospace)',
              color: isRanked ? '#f59e0b' : '#94a3b8',
              backgroundColor: isRanked ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255, 255, 255, 0.05)',
              padding: '3px 8px',
              borderRadius: '6px',
              border: `1px solid ${isRanked ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255, 255, 255, 0.06)'}`,
            }}
          >
            {isRanked ? 'Ranqueada' : 'Amistosa'}
          </span>
        </div>

        {/* Action Buttons Deck (NutriOpus Clinical Design System) */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem',
            width: '100%',
            marginTop: '0.25rem',
          }}
        >
          {onOpenReview && (
            <button
              type="button"
              id="victory-btn-game-review"
              data-testid="victory-btn-game-review"
              onClick={() => {
                onClose();
                onOpenReview();
              }}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                borderRadius: '10px',
                backgroundColor: '#0284c7',
                backgroundImage: 'linear-gradient(to right, #0284c7, #0ea5e9)',
                color: '#ffffff',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.88rem',
                fontFamily: 'var(--font-sans, Inter, sans-serif)',
                letterSpacing: '0.01em',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                boxShadow: '0 4px 14px rgba(14, 165, 233, 0.35)',
                transition: 'all 0.2s ease',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              <span>Revisão de Partida (Game Review & CAPS2)</span>
            </button>
          )}

          <button
            type="button"
            id="victory-btn-rematch"
            data-testid="victory-btn-rematch"
            onClick={() => {
              onClose();
              onRematch();
            }}
            style={{
              width: '100%',
              padding: '0.7rem 1rem',
              borderRadius: '10px',
              backgroundColor: 'rgba(255, 255, 255, 0.07)',
              color: '#f8fafc',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              fontWeight: 600,
              fontSize: '0.86rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.07)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.14)';
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M8 16H3v5" />
            </svg>
            <span>Jogar Novamente</span>
          </button>

          <button
            type="button"
            id="victory-btn-view-board"
            data-testid="victory-btn-view-board"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted, #94a3b8)',
              fontSize: '0.78rem',
              cursor: 'pointer',
              padding: '0.25rem',
              textDecoration: 'underline',
              textUnderlineOffset: '3px',
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#e2e8f0')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted, #94a3b8)')}
          >
            Explorar Tabuleiro Final
          </button>
        </div>
      </div>
    </div>
  );
};
