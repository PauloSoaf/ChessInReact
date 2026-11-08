import React, { useMemo, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useGameStore, useGameActions } from '../bindings/react/useGameStore';
import { useTheme } from '../ui/theme/ThemeContext';
import { asCoordinateKey } from '../core/coordinates';
import { IPieceEntity } from '../core/entities/types';
import { SquareTopology } from '../core/topology/SquareTopology';
import { RulesEngine } from '../engine/rules/RulesEngine';
import { MovePieceCommand } from '../core/commands/MovePieceCommand';
import { InstancedBoard } from './mesh/InstancedBoard';
import { InstancedPieces } from './mesh/InstancedPieces';

export interface IChessBoard3DProps {
  boardSize?: number;
  isBotThinking?: boolean;
  botPlayer?: string;
  disabled?: boolean;
  isFlipped?: boolean;
}

/**
 * Spec 07: Interactive 3D WebGL Chessboard (RF-01, RF-07, RNF-01, RNF-02).
 * Implements real-time 3D board rendering with InstancedMesh, PBR lighting,
 * OrbitControls, and full integration with Core ECS and Rules Engine.
 */
export const ChessBoard3D: React.FC<IChessBoard3DProps> = ({
  boardSize = 8,
  isBotThinking = false,
  botPlayer,
  disabled = false,
  isFlipped = false,
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

  // Handle square or piece click to select or move
  const handleSquareClick = useCallback(
    (coord: string) => {
      if (disabled || isBotThinking) return;
      if (botPlayer && domain.activePlayer === botPlayer) return;

      const entityAtCoord = activePieces.find((p) => p.position === coord);

      // Case 1: No piece currently selected
      if (!selectedPiece) {
        if (entityAtCoord && entityAtCoord.ownerId === domain.activePlayer) {
          selectPiece(entityAtCoord.id);
        }
        return;
      }

      // Case 2: Clicking the same selected piece cancels selection
      if (selectedPiece.position === coord || selectedPiece.id === entityAtCoord?.id) {
        selectPiece(null);
        return;
      }

      // Case 3: Clicking another friendly piece switches selection
      if (entityAtCoord && entityAtCoord.ownerId === domain.activePlayer) {
        selectPiece(entityAtCoord.id);
        return;
      }

      // Case 4: Attempting to move to target coordinate
      const legalMoves = RulesEngine.getLegalMovesForPiece(selectedPiece, domain, topology);
      const matchedMove = legalMoves.find((m) => m.to === coord);

      if (!matchedMove) {
        selectPiece(null);
        return;
      }

      try {
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
          onSquareClick={handleSquareClick}
        />

        {/* 3D Pieces (Procedural PBR Meshes) */}
        <InstancedPieces
          boardSize={boardSize}
          pieces={activePieces}
          selectedPieceId={ui.selectedPieceId}
          onPieceClick={handlePieceClick}
        />
      </Canvas>

      {/* Interactive 3D HUD Badge */}
      <div
        style={{
          position: 'absolute',
          bottom: '0.65rem',
          right: '0.75rem',
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(6px)',
          border: '1px solid var(--border-subtle)',
          padding: '0.2rem 0.55rem',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.65rem',
          fontFamily: 'var(--font-mono)',
          fontWeight: 700,
          color: 'var(--color-accent)',
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
        }}
      >
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }} />
        <span>SPEC 07 WebGL 3D</span>
      </div>
    </div>
  );
};
