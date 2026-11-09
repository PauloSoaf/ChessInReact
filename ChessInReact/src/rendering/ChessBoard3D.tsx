import React, { useMemo, useCallback, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useGameStore, useGameActions } from '../bindings/react/useGameStore';
import { useTheme } from '../ui/theme/ThemeContext';
import { asCoordinateKey } from '../core/coordinates';
import { IPieceEntity } from '../core/entities/types';
import { SquareTopology } from '../core/topology/SquareTopology';
import { RulesEngine } from '../engine/rules/RulesEngine';
import { CheckValidator } from '../engine/rules/CheckValidator';
import { MovePieceCommand } from '../core/commands/MovePieceCommand';
import { InstancedBoard } from './mesh/InstancedBoard';
import { InstancedPieces } from './mesh/InstancedPieces';
import { IInvalidMoveFeedback, ITriggerFeedbackOptions, InvalidMoveReason } from '../bindings/react/useMoveFeedback';

export interface IChessBoard3DProps {
  boardSize?: number;
  isBotThinking?: boolean;
  botPlayer?: string;
  disabled?: boolean;
  isFlipped?: boolean;
  invalidMoveFeedback?: IInvalidMoveFeedback | null;
  onTriggerInvalidMove?: (reason: InvalidMoveReason, options: ITriggerFeedbackOptions) => void;
  onClearInvalidMove?: () => void;
  onFallbackTo2D?: () => void;
}

/**
 * Checks if WebGL is available in the current environment (Spec 07 § 10.2).
 */
export function isWebGLAvailable(): boolean {
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

/**
 * Ensures on-demand frame invalidation whenever state revisions occur (Spec 07 Priority 4).
 */
function FrameInvalidator({ deps }: { deps: readonly unknown[] }) {
  const { invalidate } = useThree();
  useEffect(() => {
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return null;
}

/**
 * Spec 07: Interactive 3D WebGL Chessboard (RF-01, RF-07, RNF-01, RNF-02).
 * Implements real-time 3D board rendering with InstancedMesh, PBR lighting,
 * OrbitControls, check-constraint error feedback, and Core ECS synchronisation.
 */
export const ChessBoard3D: React.FC<IChessBoard3DProps> = ({
  boardSize = 8,
  isBotThinking = false,
  botPlayer,
  disabled = false,
  isFlipped = false,
  invalidMoveFeedback,
  onTriggerInvalidMove,
  onClearInvalidMove,
  onFallbackTo2D,
}) => {
  const { preferences, activeBoardColors, uiTheme } = useTheme();

  const domain = useGameStore((state) => state.domain);
  const ui = useGameStore((state) => state.ui);
  const { executeCommand, selectPiece } = useGameActions();

  const topology = useMemo(
    () => new SquareTopology({ width: boardSize, height: boardSize }),
    [boardSize]
  );

  // Filter active, uncaptured pieces
  const activePieces = useMemo(() => {
    return Object.values(domain.boardEntities).filter(
      (e): e is IPieceEntity => e.type === 'PIECE' && !e.isCaptured
    );
  }, [domain.boardEntities]);

  // Selected piece entity
  const selectedPiece = useMemo(() => {
    if (!ui.selectedPieceId) return null;
    return (domain.boardEntities[ui.selectedPieceId] as IPieceEntity) ?? null;
  }, [ui.selectedPieceId, domain.boardEntities]);

  // Compute legal moves for selected piece
  const legalMoveCoords = useMemo(() => {
    if (!selectedPiece || !preferences.showLegalMoves) return [];
    if (disabled || (botPlayer && domain.activePlayer === botPlayer)) return [];
    const moves = RulesEngine.getLegalMovesForPiece(selectedPiece, domain, topology);
    return moves.map((m) => m.to);
  }, [selectedPiece, domain, topology, preferences.showLegalMoves, disabled, botPlayer]);

  // Check constraint coordinates for visual highlighting
  const checkConstraintCoords = useMemo(() => {
    if (!invalidMoveFeedback) return null;
    return {
      kingCoord: invalidMoveFeedback.kingCoord,
      sourceCoord: invalidMoveFeedback.sourceCoord,
      targetCoord: invalidMoveFeedback.targetCoord,
    };
  }, [invalidMoveFeedback]);

  // Handle square or piece click to select or move with check-constraint feedback
  const handleSquareClick = useCallback(
    (coord: string) => {
      if (disabled || isBotThinking) return;
      if (botPlayer && domain.activePlayer === botPlayer) return;

      const entityAtCoord = activePieces.find((p) => p.position === coord);

      // Case 1: No piece currently selected
      if (!selectedPiece) {
        if (entityAtCoord && entityAtCoord.ownerId === domain.activePlayer) {
          const isKingInCheck = CheckValidator.isRoyalInCheck(domain.activePlayer, domain, topology);
          const legalMoves = RulesEngine.getLegalMovesForPiece(entityAtCoord, domain, topology);

          if (isKingInCheck && legalMoves.length === 0) {
            const king = CheckValidator.findRoyalPiece(domain.activePlayer, domain);
            onTriggerInvalidMove?.('CHECK_CONSTRAINT', {
              sourceCoord: entityAtCoord.position,
              kingCoord: king?.position,
              message: 'Movimento inválido: seu rei está em xeque. Essa peça não pode se mover enquanto o rei estiver em xeque.',
            });
            return;
          }

          onClearInvalidMove?.();
          selectPiece(entityAtCoord.id);
        }
        return;
      }

      // Case 2: Clicking the same selected piece cancels selection
      if (selectedPiece.position === coord || selectedPiece.id === entityAtCoord?.id) {
        onClearInvalidMove?.();
        selectPiece(null);
        return;
      }

      // Case 3: Clicking another friendly piece switches selection
      if (entityAtCoord && entityAtCoord.ownerId === domain.activePlayer) {
        const isKingInCheck = CheckValidator.isRoyalInCheck(domain.activePlayer, domain, topology);
        const legalMoves = RulesEngine.getLegalMovesForPiece(entityAtCoord, domain, topology);

        if (isKingInCheck && legalMoves.length === 0) {
          const king = CheckValidator.findRoyalPiece(domain.activePlayer, domain);
          onTriggerInvalidMove?.('CHECK_CONSTRAINT', {
            sourceCoord: entityAtCoord.position,
            kingCoord: king?.position,
            message: 'Movimento inválido: seu rei está em xeque. Essa peça não pode se mover enquanto o rei estiver em xeque.',
          });
          return;
        }

        onClearInvalidMove?.();
        selectPiece(entityAtCoord.id);
        return;
      }

      // Case 4: Attempting to move to target coordinate
      const legalMoves = RulesEngine.getLegalMovesForPiece(selectedPiece, domain, topology);
      const matchedMove = legalMoves.find((m) => m.to === coord);

      if (!matchedMove) {
        const isKingInCheck = CheckValidator.isRoyalInCheck(domain.activePlayer, domain, topology);
        const king = CheckValidator.findRoyalPiece(domain.activePlayer, domain);

        if (isKingInCheck) {
          onTriggerInvalidMove?.('CHECK_CONSTRAINT', {
            sourceCoord: selectedPiece.position,
            targetCoord: coord,
            kingCoord: king?.position,
            message: 'Movimento inválido: seu rei está em xeque. Resolva o xeque movendo o rei, capturando a ameaça ou bloqueando a linha.',
          });
        } else {
          onTriggerInvalidMove?.('ILLEGAL_MOVE', {
            sourceCoord: selectedPiece.position,
            targetCoord: coord,
            message: 'Movimento não permitido pelas regras desta peça.',
          });
        }

        selectPiece(null);
        return;
      }

      try {
        onClearInvalidMove?.();
        const promotionVariant = matchedMove.isPromotion ? 'QUEEN' : undefined;
        const moveCmd = new MovePieceCommand(
          selectedPiece.id,
          selectedPiece.position,
          asCoordinateKey(coord),
          domain.activePlayer,
          undefined,
          true,
          true,
          promotionVariant,
          topology
        );
        executeCommand(moveCmd);
      } catch (err) {
        console.warn('[ChessBoard3D] Move execution error:', err);
      } finally {
        selectPiece(null);
      }
    },
    [
      disabled,
      isBotThinking,
      botPlayer,
      activePieces,
      selectedPiece,
      topology,
      domain,
      selectPiece,
      executeCommand,
      onTriggerInvalidMove,
      onClearInvalidMove,
    ]
  );

  const handlePieceClick = useCallback(
    (_pieceId: string, position: string) => {
      handleSquareClick(position);
    },
    [handleSquareClick]
  );

  // Theme-aware studio background and lighting tones
  const ambientIntensity = uiTheme === 'midnight' ? 0.65 : uiTheme === 'ivory' ? 0.9 : 0.8;
  const keyLightIntensity = uiTheme === 'midnight' ? 1.4 : uiTheme === 'ivory' ? 1.2 : 1.6;
  const keyLightColor = uiTheme === 'synthwave' ? '#f472b6' : '#ffffff';
  const rimLightColor = uiTheme === 'synthwave' ? '#38bdf8' : '#e2e8f0';

  const cameraPosition: [number, number, number] = isFlipped ? [0, 8.5, -7.5] : [0, 8.5, 7.5];

  return (
    <div
      id="chess-board-3d-container"
      data-testid="chess-board-3d-container"
      style={{
        width: 'min(75vw, 520px)',
        height: 'min(75vw, 520px)',
        position: 'relative',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-lg)',
        border: '2px solid var(--border-prominent)',
        backgroundColor: 'var(--bg-card)',
      }}
    >
      <Canvas
        shadows
        camera={{ position: cameraPosition, fov: 45 }}
        frameloop="demand"
        style={{ width: '100%', height: '100%' }}
      >
        <FrameInvalidator
          deps={[
            domain.revision,
            domain.turnNumber,
            domain.activePlayer,
            ui.selectedPieceId,
            legalMoveCoords.length,
            invalidMoveFeedback?.timestamp,
            uiTheme,
          ]}
        />

        <OrbitControls
          enablePan={false}
          minDistance={4}
          maxDistance={15}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 2.2}
        />

        {/* Studio Lighting */}
        <ambientLight intensity={ambientIntensity} />
        <directionalLight
          position={[5, 12, 6]}
          intensity={keyLightIntensity}
          color={keyLightColor}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <directionalLight
          position={[-6, 6, -5]}
          intensity={0.4}
          color={rimLightColor}
        />

        {/* 3D Board Surface (InstancedMesh) */}
        <InstancedBoard
          boardSize={boardSize}
          lightColor={activeBoardColors.lightSquare}
          darkColor={activeBoardColors.darkSquare}
          selectedCoord={selectedPiece?.position}
          legalMoveCoords={legalMoveCoords}
          checkConstraintCoords={checkConstraintCoords}
          onSquareClick={handleSquareClick}
        />

        {/* 3D Pieces (Procedural PBR Meshes) */}
        <InstancedPieces
          boardSize={boardSize}
          pieces={activePieces}
          selectedPieceId={ui.selectedPieceId}
          checkConstraintCoords={checkConstraintCoords}
          onPieceClick={handlePieceClick}
        />
      </Canvas>

      {/* Interactive 3D HUD Badge & Safe 2D Fallback Button (Priority 3 & 8) */}
      <div
        style={{
          position: 'absolute',
          bottom: '0.65rem',
          right: '0.75rem',
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(6px)',
          border: '1px solid var(--border-subtle)',
          padding: '0.2rem 0.55rem',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.65rem',
          fontFamily: 'var(--font-mono)',
          fontWeight: 700,
          color: 'var(--color-accent)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          zIndex: 10,
        }}
      >
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }} />
        <span>SPEC 07 WebGL 3D</span>
        {onFallbackTo2D && (
          <button
            type="button"
            id="btn-fallback-2d-pill"
            onClick={onFallbackTo2D}
            title="Retornar ao tabuleiro 2D clássico"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '0.65rem',
              padding: '0 0.2rem',
              textDecoration: 'underline',
            }}
          >
            [Retornar ao 2D]
          </button>
        )}
      </div>
    </div>
  );
};

export default ChessBoard3D;
