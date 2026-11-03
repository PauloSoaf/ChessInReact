import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { InteractiveKnightScene } from './InteractiveKnightScene';
import { ShowcaseFallback } from './ShowcaseFallback';
import { KnightMaterialFinish } from './ProceduralKnight';
import { useTheme } from '../../theme/ThemeContext';
import { UIThemeId } from '../../theme/types';

export interface IChessPieceShowcaseProps {
  initialFinish?: KnightMaterialFinish;
  theme?: UIThemeId;
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
  midnight: 'radial-gradient(ellipse at center, rgba(196, 167, 125, 0.08) 0%, rgba(9, 13, 17, 0) 70%)',
  ivory: 'radial-gradient(ellipse at center, rgba(30, 41, 59, 0.05) 0%, rgba(248, 250, 252, 0) 70%)',
  synthwave: 'radial-gradient(ellipse at center, rgba(217, 70, 239, 0.12) 0%, rgba(13, 2, 28, 0) 70%)',
};

export const ChessPieceShowcase: React.FC<IChessPieceShowcaseProps> = ({
  initialFinish = 'antique-brass',
  theme: propTheme,
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

  // Track page visibility to suspend rendering in background tabs (RNF-14)
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
    // If context restoration is not received within 5 seconds, transition to fallback
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
    // Increment remount key to recreate R3F Canvas and fresh Three.js state
    setRemountKey((prev) => prev + 1);
    // Note: status 'available' is set strictly inside onCreated once R3F mounts the new context.
    recoveryTimerRef.current = setTimeout(() => {
      setContextStatus((curr) => (curr === 'recovering' ? 'fallback' : curr));
      recoveryTimerRef.current = null;
    }, 5000);
  }, []);

  const detachListeners = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    canvas.removeEventListener('webglcontextlost', handleContextLost);
    canvas.removeEventListener('webglcontextrestored', handleContextRestored);
  }, [handleContextLost, handleContextRestored]);

  // Cleanup recovery timer and detach listeners symmetrically on unmount
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

  // Pause rendering when scrolled out of view
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
        height: '100%',
        minHeight: '260px',
        maxHeight: '440px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--radius-xl)',
        background: THEME_GRADIENTS[effectiveTheme] ?? THEME_GRADIENTS.midnight,
        userSelect: 'none',
        ...style,
      }}
    >
      {/* 3D Canvas or 2D Vector Fallback */}
      <div
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {hasWebGL ? (
          <ShowcaseErrorBoundary fallback={fallbackNode}>
            <Suspense fallback={fallbackNode}>
              {/* Keep Canvas mounted in DOM so webglcontextrestored can fire on the canvas element */}
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
                    camera={{ position: [0, 0.4, 4.2], fov: 42 }}
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
                      // Succeeded WebGL context creation verified by R3F
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

              {/* Overlay Fallback or Recovery UI when context is not available */}
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
                        top: '1rem',
                        right: '1rem',
                        backgroundColor: 'var(--bg-surface-elevated)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '0.35rem 0.65rem',
                        fontSize: '0.75rem',
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
        style={{
          position: 'absolute',
          bottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          backgroundColor: 'var(--bg-surface-glass)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-full)',
          padding: '0.25rem 0.5rem',
          boxShadow: 'var(--shadow-sm)',
          zIndex: 10,
        }}
      >
        <span
          style={{
            fontSize: '0.6875rem',
            fontFamily: 'var(--font-sans)',
            fontWeight: 600,
            color: 'var(--text-muted)',
            marginRight: '0.25rem',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Acabamento:
        </span>

        <button
          id="showcase-btn-finish-brass"
          type="button"
          aria-label="Acabamento Latão Envelhecido"
          title="Latão Escovado"
          onClick={() => setFinish('antique-brass')}
          style={{
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            backgroundColor: '#C4A77D',
            border: finish === 'antique-brass' ? '2px solid var(--text-primary)' : '1px solid rgba(0,0,0,0.3)',
            boxShadow: finish === 'antique-brass' ? '0 0 8px #C4A77D' : 'none',
            cursor: 'pointer',
            padding: 0,
            transition: 'all var(--transition-fast)',
            outline: 'none',
          }}
        />

        <button
          id="showcase-btn-finish-obsidian"
          type="button"
          aria-label="Acabamento Obsidiana Negra"
          title="Obsidiana Negra"
          onClick={() => setFinish('obsidian')}
          style={{
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            backgroundColor: '#161C22',
            border: finish === 'obsidian' ? '2px solid var(--text-primary)' : '1px solid rgba(255,255,255,0.2)',
            boxShadow: finish === 'obsidian' ? '0 0 8px rgba(255,255,255,0.4)' : 'none',
            cursor: 'pointer',
            padding: 0,
            transition: 'all var(--transition-fast)',
            outline: 'none',
          }}
        />

        <button
          id="showcase-btn-finish-ivory"
          type="button"
          aria-label="Acabamento Mármore Marfim"
          title="Mármore Marfim"
          onClick={() => setFinish('ivory-marble')}
          style={{
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            backgroundColor: '#F4F1EB',
            border: finish === 'ivory-marble' ? '2px solid var(--text-primary)' : '1px solid rgba(0,0,0,0.25)',
            boxShadow: finish === 'ivory-marble' ? '0 0 8px #F4F1EB' : 'none',
            cursor: 'pointer',
            padding: 0,
            transition: 'all var(--transition-fast)',
            outline: 'none',
          }}
        />
      </div>
    </div>
  );
};
