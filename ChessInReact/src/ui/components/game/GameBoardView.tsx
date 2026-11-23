import React, { useMemo, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { InstancedBoard } from '../../../rendering/mesh/InstancedBoard';
import { InstancedPieces } from '../../../rendering/mesh/InstancedPieces';
import { PieceRenderer } from '../pieces/PieceRenderer';
import { useTheme } from '../../theme/ThemeContext';
import { isWebGLAvailable } from '../../../rendering/webglCapabilities';
import { parseCoord, toCoordKey, toAlgebraic } from '../../../engine/rules/utils/CoordinateHelper';
import { asEntityId } from '../../../core/coordinates';
import { IPieceEntity } from '../../../core/entities/types';
import { PlayerId } from '../../../core/coordinates/types';

export interface IGameBoardViewPiece {
  readonly id?: string;
  readonly variantId: string;
  readonly ownerId: string;
  readonly position?: string;
}

export interface IGameBoardViewProps {
  readonly boardId?: string;
  readonly pieces: ReadonlyMap<string, IGameBoardViewPiece>;
  readonly selectedSquare: string | null;
  readonly legalDestinations?: ReadonlyMap<string, boolean> | ReadonlySet<string>;
  readonly onSquareClick: (coord: string) => void;
  readonly viewMode: '2D' | '3D';
  readonly isFlipped?: boolean;
  readonly testId?: string;
  readonly squareTestIdPrefix?: string;
  readonly coordFormat?: 'cartesian' | 'algebraic';
  readonly style?: React.CSSProperties;
  readonly className?: string;
  readonly checkCoord?: string | null;
  readonly lastMove?: { readonly from: string; readonly to: string } | null;
}

export class GameBoard3DErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  public state = { hasError: false };

  public static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  public componentDidCatch(error: Error): void {
    console.warn('[GameBoardView] 3D WebGL render failure, falling back to 2D:', error);
  }

  public render(): React.ReactNode {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

/**
 * Spec 07 & Spec 12 Presentation Adapter: GameBoardView (PATCH-05).
 * Replaces simulated CSS transforms with a decoupled presentation adapter
 * supporting true R3F WebGL 3D boards and responsive 2D boards with full feature parity.
 */
export const GameBoardView: React.FC<IGameBoardViewProps> = ({
  boardId,
  pieces,
  selectedSquare,
  legalDestinations,
  onSquareClick,
  viewMode,
  isFlipped = false,
  testId,
  squareTestIdPrefix = 'sq',
  coordFormat = 'cartesian',
  style,
  className,
  checkCoord,
  lastMove,
}) => {
  const { pieceSet, activeBoardColors } = useTheme();
  const webGLReady = useMemo(() => isWebGLAvailable(), []);

  // Normalization helper: convert any coordinate to Cartesian ("x,y")
  const toCartesianStr = (coord: string): string => {
    if (coord.includes(',')) return coord;
    const parsed = parseCoord(coord);
    return parsed ? `${parsed.x},${parsed.y}` : coord;
  };

  // Normalization helper: convert Cartesian ("x,y") to target coordFormat
  const formatOutputCoord = (file: number, rank: number): string => {
    if (coordFormat === 'algebraic') {
      return toAlgebraic(file, rank);
    }
    return toCoordKey(file, rank);
  };

  // Convert map of pieces to IPieceEntity[] for InstancedPieces (3D)
  const pieceEntities3D = useMemo<IPieceEntity[]>(() => {
    const list: IPieceEntity[] = [];
    pieces.forEach((p, coord) => {
      const parsed = parseCoord(coord);
      if (!parsed) return;
      const posKey = toCoordKey(parsed.x, parsed.y);
      const ownerId = (p.ownerId === 'P1' || p.ownerId === 'WHITE' ? 'P1' : 'P2') as PlayerId;
      list.push({
        id: asEntityId(p.id ?? `piece-${coord}-${p.variantId}`),
        type: 'PIECE',
        ownerId,
        position: posKey,
        variantId: p.variantId,
        hasMoved: true,
        isCaptured: false,
      });
    });
    return list;
  }, [pieces]);

  // Selected piece ID and cartesian coord for 3D highlight
  const selectedCartesian = useMemo(() => {
    return selectedSquare ? toCartesianStr(selectedSquare) : null;
  }, [selectedSquare]);

  const selectedPieceId3D = useMemo(() => {
    if (!selectedCartesian) return null;
    const match = pieceEntities3D.find((p) => p.position === selectedCartesian);
    return match ? match.id : null;
  }, [selectedCartesian, pieceEntities3D]);

  // Legal destinations converted to Cartesian coords array for 3D tiles
  const legalMoveCoordsCartesian = useMemo(() => {
    if (!legalDestinations) return [];
    const list: string[] = [];
    if (legalDestinations instanceof Set) {
      legalDestinations.forEach((c) => list.push(toCartesianStr(c)));
    } else {
      legalDestinations.forEach((_, c) => list.push(toCartesianStr(c)));
    }
    return list;
  }, [legalDestinations]);

  const lastMoveCoords = useMemo(() => {
    if (!lastMove) return [];
    return [toCartesianStr(lastMove.from), toCartesianStr(lastMove.to)];
  }, [lastMove]);

  const render2DGrid = (): React.ReactElement => (
    <div
      role="grid"
      aria-label={testId ?? `Tabuleiro ${boardId ?? '2D'}`}
      data-testid={testId ?? `game-board-view-${boardId ?? 'main'}`}
      className={className}
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 1fr)',
        aspectRatio: '1 / 1',
        borderRadius: 'var(--radius-sm, 6px)',
        overflow: 'hidden',
        border: '2px solid var(--border-prominent, #475569)',
        boxShadow: 'var(--shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.1))',
        ...style,
      }}
    >
      {Array.from({ length: 64 }, (_, idx) => {
        const file = isFlipped ? 7 - (idx % 8) : idx % 8;
        const rank = isFlipped ? Math.floor(idx / 8) : 7 - Math.floor(idx / 8);
        const coord = formatOutputCoord(file, rank);
        const piece = pieces.get(coord);

        const isSelected = selectedSquare === coord || selectedCartesian === toCartesianStr(coord);
        const isDark = (file + rank) % 2 === 0;

        let isMoveDest = false;
        let isCaptureDest = false;
        if (legalDestinations) {
          if (legalDestinations instanceof Set) {
            isMoveDest = legalDestinations.has(coord);
          } else if ('get' in legalDestinations) {
            const destVal = legalDestinations.get(coord);
            if (destVal !== undefined) {
              isCaptureDest = Boolean(destVal);
              isMoveDest = !destVal;
            }
          }
        }

        const isCheck = checkCoord === coord;

        return (
          <button
            key={coord}
            type="button"
            role="gridcell"
            data-testid={`${squareTestIdPrefix}-${coord}`}
            aria-label={`Casa ${coord}${piece ? ` ${piece.variantId}` : ''}`}
            onClick={() => onSquareClick(coord)}
            style={{
              position: 'relative',
              border: isSelected
                ? '2px solid var(--color-accent, #38bdf8)'
                : isCheck
                ? '2px solid #ef4444'
                : '0.5px solid rgba(0, 0, 0, 0.08)',
              background: isSelected
                ? activeBoardColors.selectedSquare
                : isCheck
                ? 'rgba(239, 68, 68, 0.45)'
                : isDark
                ? activeBoardColors.darkSquare
                : activeBoardColors.lightSquare,
              aspectRatio: '1',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isMoveDest && (
              <span
                data-testid="bughouse-legal-dot"
                style={{
                  position: 'absolute',
                  width: '26%',
                  height: '26%',
                  borderRadius: '50%',
                  backgroundColor: activeBoardColors.legalMoveDot,
                  pointerEvents: 'none',
                }}
              />
            )}
            {isCaptureDest && (
              <span
                data-testid="bughouse-capture-ring"
                style={{
                  position: 'absolute',
                  inset: '3px',
                  borderRadius: '50%',
                  border: `2.5px solid ${activeBoardColors.captureSquare}`,
                  pointerEvents: 'none',
                }}
              />
            )}
            {piece && (
              <PieceRenderer
                variantId={piece.variantId}
                ownerId={piece.ownerId as PlayerId}
                pieceSet={pieceSet}
                size="78%"
              />
            )}
          </button>
        );
      })}
    </div>
  );

  // Render 3D R3F Canvas when requested and WebGL is available
  if (viewMode === '3D' && webGLReady) {
    const cameraPos: [number, number, number] = isFlipped ? [0, 8.5, -7.5] : [0, 8.5, 7.5];

    return (
      <GameBoard3DErrorBoundary fallback={render2DGrid()}>
        <div
          data-testid={testId ?? `game-board-view-${boardId ?? 'main'}`}
          className={className}
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '1 / 1',
            borderRadius: 'var(--radius-md, 8px)',
            overflow: 'hidden',
            backgroundColor: '#0a0f1d',
            border: '2px solid var(--border-prominent, #475569)',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
            ...style,
          }}
        >
          <Canvas
            shadows
            camera={{ position: cameraPos, fov: 45 }}
            frameloop="demand"
            dpr={[1, 2]}
            gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
            style={{ width: '100%', height: '100%', display: 'block' }}
          >
            <ambientLight intensity={0.7} />
            <directionalLight
              position={[5, 12, 6]}
              intensity={1.2}
              color="#ffffff"
              castShadow
              shadow-mapSize={[1024, 1024]}
            />
            <directionalLight
              position={[-6, 6, -5]}
              intensity={0.4}
              color="#93c5fd"
            />

            <OrbitControls
              enablePan={false}
              minDistance={4}
              maxDistance={14}
              minPolarAngle={Math.PI / 6}
              maxPolarAngle={Math.PI / 2.2}
            />

            <Suspense fallback={null}>
              <InstancedBoard
                boardSize={8}
                lightColor={activeBoardColors.lightSquare}
                darkColor={activeBoardColors.darkSquare}
                selectedCoord={selectedCartesian}
                legalMoveCoords={legalMoveCoordsCartesian}
                lastMoveCoords={lastMoveCoords}
                onSquareClick={(cartesianCoord) => {
                  const [cx, cy] = cartesianCoord.split(',').map(Number);
                  const outCoord = formatOutputCoord(cx, cy);
                  onSquareClick(outCoord);
                }}
              />

              <InstancedPieces
                boardSize={8}
                pieces={pieceEntities3D}
                selectedPieceId={selectedPieceId3D}
                checkConstraintCoords={checkCoord ? { kingCoord: toCartesianStr(checkCoord) } : null}
                onPieceClick={(_, pos) => {
                  const [cx, cy] = pos.split(',').map(Number);
                  const outCoord = formatOutputCoord(cx, cy);
                  onSquareClick(outCoord);
                }}
              />
            </Suspense>
          </Canvas>

          {/* Accessible E2E DOM Layer ensuring interactive parity, testing and accessibility */}
          <div
            role="grid"
            aria-label={testId ?? `Tabuleiro ${boardId ?? '3D'}`}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(8, 1fr)',
              pointerEvents: 'none',
              opacity: 0,
            }}
          >
            {Array.from({ length: 64 }, (_, idx) => {
              const file = isFlipped ? 7 - (idx % 8) : idx % 8;
              const rank = isFlipped ? Math.floor(idx / 8) : 7 - Math.floor(idx / 8);
              const coord = formatOutputCoord(file, rank);
              const piece = pieces.get(coord);

              let isMoveDest = false;
              let isCaptureDest = false;
              if (legalDestinations) {
                if (legalDestinations instanceof Set) {
                  isMoveDest = legalDestinations.has(coord);
                } else if ('get' in legalDestinations) {
                  const destVal = legalDestinations.get(coord);
                  if (destVal !== undefined) {
                    isCaptureDest = Boolean(destVal);
                    isMoveDest = !destVal;
                  }
                }
              }

              return (
                <button
                  key={coord}
                  type="button"
                  role="gridcell"
                  data-testid={`${squareTestIdPrefix}-${coord}`}
                  aria-label={`Casa ${coord}${piece ? ` ${piece.variantId}` : ''}`}
                  style={{ pointerEvents: 'auto' }}
                  onClick={() => onSquareClick(coord)}
                >
                  {isMoveDest && (
                    <span
                      data-testid="bughouse-legal-dot"
                      style={{
                        position: 'absolute',
                        width: '26%',
                        height: '26%',
                        borderRadius: '50%',
                        backgroundColor: activeBoardColors.legalMoveDot,
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                  {isCaptureDest && (
                    <span
                      data-testid="bughouse-capture-ring"
                      style={{
                        position: 'absolute',
                        inset: '3px',
                        borderRadius: '50%',
                        border: `2.5px solid ${activeBoardColors.captureSquare}`,
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </GameBoard3DErrorBoundary>
    );
  }

  // 2D High-Performance Vector Grid View
  return render2DGrid();
};

export default GameBoardView;
