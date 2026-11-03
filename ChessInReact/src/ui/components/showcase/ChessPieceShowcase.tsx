import React, { useState, useEffect, useRef, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { InteractiveKnightScene } from './InteractiveKnightScene';
import { ShowcaseFallback } from './ShowcaseFallback';
import { KnightMaterialFinish } from './ProceduralKnight';

export interface IChessPieceShowcaseProps {
  initialFinish?: KnightMaterialFinish;
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

export const ChessPieceShowcase: React.FC<IChessPieceShowcaseProps> = ({
  initialFinish = 'antique-brass',
  className = '',
  style,
}) => {
  const [finish, setFinish] = useState<KnightMaterialFinish>(initialFinish);
  const [hasWebGL, setHasWebGL] = useState<boolean>(false);
  const [isContextLost, setIsContextLost] = useState<boolean>(false);
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);
  const [isVisible, setIsVisible] = useState<boolean>(true);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const fallbackNode = <ShowcaseFallback finish={finish} />;

  return (
    <div
      ref={containerRef}
      id="chess-piece-showcase"
      data-testid="chess-piece-showcase"
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
        background: 'radial-gradient(ellipse at center, rgba(196, 167, 125, 0.08) 0%, rgba(9, 13, 17, 0) 70%)',
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
        {hasWebGL && !isContextLost ? (
          <ShowcaseErrorBoundary fallback={fallbackNode}>
            <Suspense fallback={fallbackNode}>
              {isVisible ? (
                <Canvas
                  frameloop="demand"
                  camera={{ position: [0, 0.4, 4.2], fov: 42 }}
                  dpr={[1, 1.5]}
                  gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
                  style={{ width: '100%', height: '100%', pointerEvents: 'auto', touchAction: 'none' }}
                  onCreated={({ gl }) => {
                    const canvas = gl.domElement;
                    const handleContextLost = (e: Event) => {
                      e.preventDefault();
                      console.warn('[ChessPieceShowcase] WebGL context lost, activating vector fallback');
                      setIsContextLost(true);
                    };
                    const handleContextRestored = () => {
                      console.info('[ChessPieceShowcase] WebGL context restored');
                      setIsContextLost(false);
                    };
                    canvas.addEventListener('webglcontextlost', handleContextLost);
                    canvas.addEventListener('webglcontextrestored', handleContextRestored);
                  }}
                >
                  <InteractiveKnightScene finish={finish} reducedMotion={reducedMotion} />
                </Canvas>
              ) : (
                fallbackNode
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
