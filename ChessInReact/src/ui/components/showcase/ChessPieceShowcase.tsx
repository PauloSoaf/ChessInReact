import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { InteractiveKnightScene } from './InteractiveKnightScene';
import { ShowcaseFallback } from './ShowcaseFallback';
import { KnightMaterialFinish } from './ProceduralKnight';
import { useTheme } from '../../theme/ThemeContext';
import { UIThemeId } from '../../theme/types';

export interface IChessPieceShowcaseProps {
  initialFinish?: KnightMaterialFinish;
  height?: string | number;
  theme?: UIThemeId;
  autoFocusFirstControl?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

class ShowcaseErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { fallback: React.ReactNode; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn('[ChessPieceShowcase] WebGL rendering error encountered, falling back to 2D vector:', error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function checkWebGLSupport(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

export type WebGLContextStatus = 'available' | 'lost' | 'recovering' | 'fallback';

const THEME_GRADIENTS: Record<UIThemeId, string> = {
  midnight: 'radial-gradient(ellipse at 50% 42%, rgba(196, 167, 125, 0.14) 0%, rgba(9, 13, 17, 0.65) 74%)',
  ivory: 'radial-gradient(ellipse at 50% 42%, rgba(30, 41, 59, 0.07) 0%, rgba(236, 231, 220, 0.55) 74%)',
  synthwave: 'radial-gradient(ellipse at 50% 42%, rgba(217, 70, 239, 0.18) 0%, rgba(8, 3, 18, 0.68) 74%)',
};

const FINISH_META: Record<KnightMaterialFinish, { label: string; subtitle: string; swatch: string }> = {
  'antique-brass': { label: 'Latão', subtitle: 'Bronze Staunton', swatch: '#C4A77D' },
  obsidian: { label: 'Obsidiana', subtitle: 'Ébano Polido', swatch: '#161C22' },
  'ivory-marble': { label: 'Marfim', subtitle: 'Alabastro Clássico', swatch: '#F4F1EB' },
};

export const ChessPieceShowcase: React.FC<IChessPieceShowcaseProps> = ({
  initialFinish = 'antique-brass',
  height = '100%',
  theme: propTheme,
  autoFocusFirstControl = false,
  className = '',
  style,
}) => {
  const themeCtx = useTheme();
  const effectiveTheme: UIThemeId = propTheme ?? themeCtx?.uiTheme ?? 'midnight';

  const [finish, setFinish] = useState<KnightMaterialFinish>(initialFinish);
  const [hasWebGL, setHasWebGL] = useState<boolean>(false);
  const [contextStatus, setContextStatus] = useState<WebGLContextStatus>('available');
  const [remountKey, setRemountKey] = useState<number>(0);
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);
  const [isVisible, setIsVisible] = useState<boolean>(true);
  const [isPageVisible, setIsPageVisible] = useState<boolean>(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstControlRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (autoFocusFirstControl && firstControlRef.current) {
      firstControlRef.current.focus();
    }
  }, [autoFocusFirstControl]);

  useEffect(() => {
    setHasWebGL(checkWebGLSupport());

    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      setReducedMotion(mediaQuery.matches);
      const listener = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
      mediaQuery.addEventListener?.('change', listener);
      return () => mediaQuery.removeEventListener?.('change', listener);
    }
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibilityChange = () => {
      setIsPageVisible(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  const handleContextLost = useCallback((e: Event) => {
    e.preventDefault();
    console.warn('[ChessPieceShowcase] WebGL context lost, transitioning to lost state');
    setContextStatus('lost');

    if (recoveryTimerRef.current) {
      clearTimeout(recoveryTimerRef.current);
    }
    recoveryTimerRef.current = setTimeout(() => {
      console.warn('[ChessPieceShowcase] WebGL restoration timed out, transitioning to fallback');
      setContextStatus('fallback');
      recoveryTimerRef.current = null;
    }, 5000);
  }, []);

  const handleContextRestored = useCallback(() => {
    console.info('[ChessPieceShowcase] WebGL context restored, rebuilding 3D scene');
    if (recoveryTimerRef.current) {
      clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = null;
    }
    setContextStatus('recovering');
    setRemountKey((prev) => prev + 1);
    recoveryTimerRef.current = setTimeout(() => {
      setContextStatus((curr) => (curr === 'recovering' ? 'fallback' : curr));
      recoveryTimerRef.current = null;
    }, 5000);
  }, []);

  const detachListeners = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (!canvas) return;
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
    },
    [handleContextLost, handleContextRestored]
  );

  useEffect(() => {
    return () => {
      if (recoveryTimerRef.current) {
        clearTimeout(recoveryTimerRef.current);
        recoveryTimerRef.current = null;
      }
      detachListeners(canvasElementRef.current);
      canvasElementRef.current = null;
    };
  }, [detachListeners]);

  useEffect(() => {
    if (!containerRef.current || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.1 }
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleManualRetry = () => {
    if (recoveryTimerRef.current) {
      clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = null;
    }
    setContextStatus('recovering');
    setRemountKey((prev) => prev + 1);
    recoveryTimerRef.current = setTimeout(() => {
      setContextStatus((curr) => (curr === 'recovering' ? 'fallback' : curr));
      recoveryTimerRef.current = null;
    }, 5000);
  };

  const fallbackNode = <ShowcaseFallback finish={finish} />;
  const activeMeta = FINISH_META[finish];

  return (
    <div
      ref={containerRef}
      id="chess-piece-showcase"
      data-testid="chess-piece-showcase"
      data-webgl-status={contextStatus}
      className={`chess-piece-showcase ${className}`}
      style={{
        position: 'relative',
        width: '100%',
        height,
        minHeight: '260px',
        maxHeight: '440px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-prominent)',
        background: THEME_GRADIENTS[effectiveTheme] ?? THEME_GRADIENTS.midnight,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), var(--shadow-md)',
        overflow: 'hidden',
        userSelect: 'none',
        ...style,
      }}
    >
      {/* Subtle Studio Orbital Ring */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          width: '74%',
          aspectRatio: '1 / 1',
          top: '9%',
          borderRadius: '50%',
          border: '1px solid var(--border-subtle)',
          pointerEvents: 'none',
          opacity: 0.55,
        }}
      />

      {/* Top Studio Header Bar */}
      <div
        style={{
          width: '100%',
          padding: '0.75rem 0.95rem 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 10,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.38rem',
            padding: '0.2rem 0.58rem',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--bg-surface-glass)',
            border: '1px solid var(--border-subtle)',
            fontSize: '0.64rem',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            color: 'var(--text-secondary)',
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-accent)',
            }}
          />
          <span>Staunton Atelier 3D</span>
        </div>

        <span
          style={{
            fontSize: '0.68rem',
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            color: 'var(--text-muted)',
          }}
        >
          {activeMeta.subtitle}
        </span>
      </div>

      {/* 3D Canvas or 2D Vector Fallback */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1,
        }}
      >
        {hasWebGL ? (
          <ShowcaseErrorBoundary fallback={fallbackNode}>
            <Suspense fallback={fallbackNode}>
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  visibility: contextStatus === 'available' ? 'visible' : 'hidden',
                  opacity: contextStatus === 'available' ? 1 : 0,
                  pointerEvents: contextStatus === 'available' ? 'auto' : 'none',
                  transition: 'opacity 0.25s ease',
                }}
              >
                {isVisible && isPageVisible && (
                  <Canvas
                    key={`showcase-canvas-${remountKey}`}
                    frameloop="demand"
                    camera={{ position: [0, 0.45, 4.0], fov: 40 }}
                    dpr={[1, 1.5]}
                    gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
                    style={{ width: '100%', height: '100%', pointerEvents: 'auto', touchAction: 'none' }}
                    onCreated={({ gl }) => {
                      const canvas = gl.domElement;
                      if (canvasElementRef.current && canvasElementRef.current !== canvas) {
                        detachListeners(canvasElementRef.current);
                      }
                      canvasElementRef.current = canvas;
                      canvas.addEventListener('webglcontextlost', handleContextLost);
                      canvas.addEventListener('webglcontextrestored', handleContextRestored);
                      setContextStatus('available');
                      if (recoveryTimerRef.current) {
                        clearTimeout(recoveryTimerRef.current);
                        recoveryTimerRef.current = null;
                      }
                    }}
                  >
                    <InteractiveKnightScene
                      finish={finish}
                      reducedMotion={reducedMotion}
                      theme={effectiveTheme}
                    />
                  </Canvas>
                )}
              </div>

              {contextStatus !== 'available' && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 2,
                  }}
                >
                  {fallbackNode}
                  {contextStatus === 'fallback' && (
                    <button
                      id="showcase-btn-retry-3d"
                      type="button"
                      onClick={handleManualRetry}
                      style={{
                        position: 'absolute',
                        top: '2.75rem',
                        right: '0.95rem',
                        backgroundColor: 'var(--bg-surface-elevated)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '0.32rem 0.6rem',
                        fontSize: '0.72rem',
                        fontFamily: 'var(--font-sans)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        zIndex: 10,
                      }}
                    >
                      Restaurar 3D
                    </button>
                  )}
                </div>
              )}
            </Suspense>
          </ShowcaseErrorBoundary>
        ) : (
          fallbackNode
        )}
      </div>

      {/* Floating Tactical Material Switcher Controls */}
      <div
        role="group"
        aria-label="Acabamento da peça"
        style={{
          position: 'relative',
          marginBottom: '0.85rem',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.35rem',
          backgroundColor: 'var(--bg-surface-glass)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-full)',
          padding: '0.26rem 0.55rem',
          boxShadow: 'var(--shadow-sm)',
          zIndex: 10,
        }}
      >
        <span
          style={{
            fontSize: '0.66rem',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            color: 'var(--text-muted)',
            marginRight: '0.15rem',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Material:
        </span>

        <button
          ref={firstControlRef}
          id="showcase-btn-finish-brass"
          type="button"
          aria-label="Acabamento Latão Envelhecido"
          aria-pressed={finish === 'antique-brass'}
          title="Latão Escovado"
          onClick={() => setFinish('antique-brass')}
          className="ui-control"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            padding: '0.2rem 0.5rem',
            borderRadius: 'var(--radius-full)',
            backgroundColor: finish === 'antique-brass' ? 'var(--bg-surface-elevated)' : 'transparent',
            border: finish === 'antique-brass' ? '1px solid var(--border-active)' : '1px solid transparent',
            color: finish === 'antique-brass' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontSize: '0.68rem',
            fontWeight: finish === 'antique-brass' ? 700 : 500,
            cursor: 'pointer',
          }}
        >
          <span
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: '#C4A77D',
              border: '1px solid rgba(0,0,0,0.35)',
            }}
          />
          <span>Latão</span>
        </button>

        <button
          id="showcase-btn-finish-obsidian"
          type="button"
          aria-label="Acabamento Obsidiana Negra"
          aria-pressed={finish === 'obsidian'}
          title="Obsidiana Negra"
          onClick={() => setFinish('obsidian')}
          className="ui-control"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            padding: '0.2rem 0.5rem',
            borderRadius: 'var(--radius-full)',
            backgroundColor: finish === 'obsidian' ? 'var(--bg-surface-elevated)' : 'transparent',
            border: finish === 'obsidian' ? '1px solid var(--border-active)' : '1px solid transparent',
            color: finish === 'obsidian' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontSize: '0.68rem',
            fontWeight: finish === 'obsidian' ? 700 : 500,
            cursor: 'pointer',
          }}
        >
          <span
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: '#161C22',
              border: '1px solid rgba(255,255,255,0.28)',
            }}
          />
          <span>Obsidiana</span>
        </button>

        <button
          id="showcase-btn-finish-ivory"
          type="button"
          aria-label="Acabamento Mármore Marfim"
          aria-pressed={finish === 'ivory-marble'}
          title="Mármore Marfim"
          onClick={() => setFinish('ivory-marble')}
          className="ui-control"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            padding: '0.2rem 0.5rem',
            borderRadius: 'var(--radius-full)',
            backgroundColor: finish === 'ivory-marble' ? 'var(--bg-surface-elevated)' : 'transparent',
            border: finish === 'ivory-marble' ? '1px solid var(--border-active)' : '1px solid transparent',
            color: finish === 'ivory-marble' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontSize: '0.68rem',
            fontWeight: finish === 'ivory-marble' ? 700 : 500,
            cursor: 'pointer',
          }}
        >
          <span
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: '#F4F1EB',
              border: '1px solid rgba(0,0,0,0.3)',
            }}
          />
          <span>Marfim</span>
        </button>
      </div>
    </div>
  );
};
