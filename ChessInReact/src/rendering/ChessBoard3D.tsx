import React, { useMemo, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useGameStore, useGameActions } from '../bindings/react/useGameStore';
import { useTheme } from '../ui/theme/ThemeContext';
import { asCoordinateKey, asEntityId } from '../core/coordinates';
import { IPieceEntity } from '../core/entities/types';
import { ITopology } from '../core/topology/types';
import { RulesEngine } from '../engine/rules/RulesEngine';
import { CheckValidator } from '../engine/rules/CheckValidator';
import { MovePieceCommand } from '../core/commands/MovePieceCommand';
import { InstancedBoard } from './mesh/InstancedBoard';
import { InstancedPieces } from './mesh/InstancedPieces';
import { InstancedPieceBatcher } from './mesh/InstancedPieceBatcher.tsx';
import { VariantOverlays3D } from './mesh/VariantOverlays3D';
import { ToroidalChessBoard3D } from './mesh/ToroidalChessBoard3D';
import { CubicChessBoard3D } from './mesh/CubicChessBoard3D';
import { CompositeArenaLayouts } from '../engine/multiplayer/arenas/CompositeArenaLayouts';
import { VariantCatalog } from '../engine/variants/catalog/VariantCatalog';
import { ArenaModeId } from '../engine/multiplayer/arenas/interfaces/IArenaContracts';
import { GlobalEventBus } from '../core/events/EventBus';
import { IInvalidMoveFeedback, ITriggerFeedbackOptions, InvalidMoveReason } from '../bindings/react/useMoveFeedback';
import { PromotionModal } from '../ui/components/game/PromotionModal';
import { PlayerId } from '../core/coordinates/types';
import { globalAudioSynthesizer } from '../audio/WebAudioSynthesizer';

export interface IChessBoard3DProps {
  boardSize?: number;
  topology?: ITopology;
  isBotThinking?: boolean;
  botPlayer?: string;
  disabled?: boolean;
  isFlipped?: boolean;
  useInstancedBatching?: boolean;
  invalidMoveFeedback?: IInvalidMoveFeedback | null;
  onTriggerInvalidMove?: (reason: InvalidMoveReason, options: ITriggerFeedbackOptions) => void;
  onClearInvalidMove?: () => void;
  onFallbackTo2D?: () => void;
  /** Duck Chess duck square ("x,y") */
  duckCoordinate?: string | null;
  /** Spell Chess frozen squares ("x,y") */
  frozenCoordinates?: readonly string[];
  /** Spell Chess active portals */
  activePortals?: ReadonlyArray<{ readonly coordA: string; readonly coordB: string }>;
  /** Spell Chess stealth traps */
  stealthTraps?: Readonly<Record<string, string>>;
  onHumanPieceMoved?: (from: string, to: string, pieceId: string) => void;
  onVariantSquareClick?: (coordinate: string) => boolean;
  selectedSpellType?: 'FREEZE' | 'JUMP' | string | null;
  selectedDropPiece?: string | null;
  duckPlacementActive?: boolean;
  onCancelAction?: () => void;
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
 * Bridges internal Three.js camera and renderer state to testing and runtime automation (Spec 07 § 10, RF-07).
 */
function Chess3DInstrumentation({
  boardSize,
  isFlipped,
  onSquareClick,
}: {
  boardSize: number;
  isFlipped: boolean;
  onSquareClick?: (coord: string) => void;
}) {
  const { camera, gl, size } = useThree();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const offset = (boardSize - 1) / 2;

    (window as unknown as { __CHESS_3D__?: unknown }).__CHESS_3D__ = {
      simulateSquareClick: (coord: string) => {
        onSquareClick?.(coord);
      },
      projectCoordToScreen: (coord: string) => {
        const [colStr, rowStr] = coord.split(',');
        const col = parseInt(colStr, 10);
        const row = parseInt(rowStr, 10);
        if (isNaN(col) || isNaN(row)) return null;

        // In 3D world space, tiles and pieces are centered at wx = col - offset, wz = row - offset
        const wx = col - offset;
        const wz = row - offset;
        const wy = 0.05;

        const vec = new THREE.Vector3(wx, wy, wz);
        vec.project(camera);

        const rect = gl.domElement.getBoundingClientRect();
        const clientX = rect.left + ((vec.x + 1) * 0.5) * rect.width;
        const clientY = rect.top + ((-vec.y + 1) * 0.5) * rect.height;

        return {
          clientX,
          clientY,
          ndc: { x: vec.x, y: vec.y, z: vec.z },
        };
      },
      getRenderMetrics: () => {
        const canvas = gl.domElement;
        const rect = canvas.getBoundingClientRect();
        return {
          width: canvas.width,
          height: canvas.height,
          clientWidth: rect.width,
          clientHeight: rect.height,
          dpr: window.devicePixelRatio || 1,
          cameraFov: (camera as THREE.PerspectiveCamera).fov,
          cameraPosition: [camera.position.x, camera.position.y, camera.position.z],
          isContextLost: Boolean(gl.getContext()?.isContextLost?.()),
        };
      },
    };

    return () => {
      delete (window as unknown as { __CHESS_3D__?: unknown }).__CHESS_3D__;
    };
  }, [boardSize, isFlipped, camera, gl, size, onSquareClick]);

  return null;
}

/**
 * Smoothly interpolates the camera between player perspectives and handles orbit controls (Spec 07 § 10, RF-07).
 */
function SmoothCameraController({
  isFlipped,
  cameraHeight = 8.5,
  cameraDist = 7.5,
}: {
  isFlipped: boolean;
  cameraHeight?: number;
  cameraDist?: number;
}) {
  const { camera, invalidate } = useThree();
  const targetPos = useMemo(
    () => (isFlipped ? new THREE.Vector3(0, cameraHeight, cameraDist) : new THREE.Vector3(0, cameraHeight, -cameraDist)),
    [isFlipped, cameraHeight, cameraDist]
  );
  const isTransitioningRef = React.useRef(false);
  const isMountedRef = React.useRef(false);

  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
    isTransitioningRef.current = true;
    invalidate();
  }, [isFlipped, invalidate]);

  useFrame((_, delta) => {
    if (!isTransitioningRef.current) return;

    camera.position.lerp(targetPos, Math.min(1, delta * 8));
    camera.lookAt(0, 0, 0);
    invalidate();

    if (camera.position.distanceTo(targetPos) < 0.04) {
      camera.position.copy(targetPos);
      camera.lookAt(0, 0, 0);
      isTransitioningRef.current = false;
      invalidate();
    }
  });

  return (
    <OrbitControls
      enablePan={false}
      minDistance={4}
      maxDistance={15}
      minPolarAngle={Math.PI / 6}
      maxPolarAngle={Math.PI / 2.2}
      onChange={() => invalidate()}
    />
  );
}

/**
 * Spec 07: Interactive 3D WebGL Chessboard (RF-01, RF-07, RNF-01, RNF-02).
 * Implements real-time 3D board rendering with InstancedMesh, PBR lighting,
 * OrbitControls, check-constraint error feedback, and Core ECS synchronisation.
 */
export const ChessBoard3D: React.FC<IChessBoard3DProps> = ({
  boardSize = 8,
  topology: propTopology,
  isBotThinking = false,
  botPlayer,
  disabled = false,
  isFlipped = false,
  useInstancedBatching = false,
  invalidMoveFeedback,
  onTriggerInvalidMove,
  onClearInvalidMove,
  onFallbackTo2D,
  duckCoordinate,
  frozenCoordinates,
  activePortals,
  stealthTraps,
  onHumanPieceMoved,
  onVariantSquareClick,
  selectedSpellType,
  selectedDropPiece,
  duckPlacementActive = false,
  onCancelAction,
}) => {
  const { preferences, activeBoardColors, uiTheme } = useTheme();

  const domain = useGameStore((state) => state.domain);
  const ui = useGameStore((state) => state.ui);
  const { executeCommand, selectPiece } = useGameActions();

  // Track previous move dynamically via GlobalEventBus (Spec 06 / Spec 07)
  const [internalLastMove, setInternalLastMove] = React.useState<{ from?: string; to: string } | null>(null);

  // Track active explosion shockwave dynamically via GlobalEventBus (Spec 04 & Spec 13 RF-13-05)
  const [activeExplosion, setActiveExplosion] = React.useState<{ center: string; radius: number } | null>(null);

  React.useEffect(() => {
    const unsubMove = GlobalEventBus.subscribe('PIECE_MOVED', (payload) => {
      setInternalLastMove({ from: payload.from, to: payload.to });
    });
    const unsubDrop = GlobalEventBus.subscribe('PIECE_DROPPED', (payload) => {
      setInternalLastMove({ from: undefined, to: payload.coordinate });
    });
    const unsubExplosion = GlobalEventBus.subscribe('EXPLOSION', (payload) => {
      setActiveExplosion({ center: payload.epicenter, radius: payload.radius });
      const timer = setTimeout(() => {
        setActiveExplosion(null);
      }, 750);
      return () => clearTimeout(timer);
    });
    return () => {
      unsubMove();
      unsubDrop();
      unsubExplosion();
    };
  }, []);

  const lastMoveCoords = useMemo(() => {
    if (!internalLastMove) return [];
    const arr: string[] = [];
    if (internalLastMove.from) arr.push(internalLastMove.from);
    if (internalLastMove.to) arr.push(internalLastMove.to);
    return arr;
  }, [internalLastMove]);

  const arenaLayout = useMemo(() => {
    const v = domain.variantId?.toUpperCase() ?? '';
    return CompositeArenaLayouts.getLayout(v as ArenaModeId);
  }, [domain.variantId]);

  const effectiveBoardSize = useMemo(() => {
    if (arenaLayout) {
      return arenaLayout.boardType === 'SQUARE_CROSS' ? 14 : 16;
    }
    const v = domain.variantId?.toUpperCase() ?? '';
    if (v.includes('CAPABLANCA') || v.includes('XIANGQI')) return 10;
    if (v.includes('SHOGI')) return 9;
    return boardSize;
  }, [arenaLayout, domain.variantId, boardSize]);

  const topology = useMemo(() => {
    if (propTopology) return propTopology;
    return VariantCatalog.getTopologyForVariant(domain.variantId);
  }, [propTopology, domain.variantId]);

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

  // Accessible Pawn Promotion Dialog state for 3D WebGL (Spec 06 RF-08, US06-P09, Spec 01 US01-C10)
  const [pendingPromotion, setPendingPromotion] = React.useState<{
    pieceId: string;
    sourceCoord: string;
    targetCoord: string;
    ownerId: PlayerId;
    allowedVariants?: string[];
  } | null>(null);

  // Compute legal moves for selected piece
  const legalMoveCoords = useMemo(() => {
    if (!selectedPiece || !preferences.showLegalMoves) return [];
    if (disabled || (botPlayer && domain.activePlayer === botPlayer)) return [];
    const moves = RulesEngine.getLegalMovesForPiece(selectedPiece, domain, topology);
    return moves.map((m) => m.to);
  }, [selectedPiece, domain, topology, preferences.showLegalMoves, disabled, botPlayer]);

  // Check constraint coordinates for visual highlighting (Spec 07 RF-05, RF-10 & Spec 04)
  const checkConstraintCoords = useMemo(() => {
    let kingCoord = invalidMoveFeedback?.kingCoord;
    const sourceCoord = invalidMoveFeedback?.sourceCoord;
    const targetCoord = invalidMoveFeedback?.targetCoord;

    // Proactive check detection: highlight King immediately whenever currently in check
    if (!kingCoord && CheckValidator.isRoyalInCheck(domain.activePlayer, domain, topology)) {
      const king = CheckValidator.findRoyalPiece(domain.activePlayer, domain);
      if (king) {
        kingCoord = king.position;
      }
    }

    if (!kingCoord && !sourceCoord && !targetCoord) return null;

    return {
      kingCoord,
      sourceCoord,
      targetCoord,
    };
  }, [invalidMoveFeedback, domain, topology]);

  // Antichess forced captures detection (Spec 04 & Spec 13)
  const isAntichess = useMemo(() => {
    const v = domain.variantId?.toUpperCase() ?? '';
    return v.includes('ANTICHESS') || v.includes('GIVEAWAY');
  }, [domain.variantId]);

  const forcedCapturePieceIds = useMemo(() => {
    if (!isAntichess) return [];
    const playerPieces = activePieces.filter((p) => p.ownerId === domain.activePlayer);
    const pieceIds: string[] = [];
    for (const piece of playerPieces) {
      const moves = RulesEngine.getLegalMovesForPiece(piece, domain, topology);
      if (moves.some((m) => m.isCapture)) {
        pieceIds.push(piece.id);
      }
    }
    return pieceIds;
  }, [isAntichess, activePieces, domain, topology]);

  const forcedCaptureCoords = useMemo(() => {
    if (forcedCapturePieceIds.length === 0) return [];
    const idsSet = new Set(forcedCapturePieceIds);
    return activePieces.filter((p) => idsSet.has(p.id)).map((p) => p.position);
  }, [activePieces, forcedCapturePieceIds]);

  // King of the Hill victory move preview (Spec 04 & Spec 13)
  const hillVictoryMoveCoords = useMemo(() => {
    if (!selectedPiece || selectedPiece.variantId !== 'KING') return [];
    const v = domain.variantId?.toUpperCase() ?? '';
    const isKoth = v === 'KING_OF_THE_HILL' || v.includes('HILL');
    if (!isKoth) return [];
    const centerHill = new Set(['3,3', '3,4', '4,3', '4,4']);
    return legalMoveCoords.filter((c) => centerHill.has(c));
  }, [selectedPiece, domain.variantId, legalMoveCoords]);

  // Handle square or piece click to select or move with check-constraint feedback
  const handleSquareClick = useCallback(
    (coord: string) => {
      if (disabled || isBotThinking) return;
      if (onVariantSquareClick?.(coord)) return;
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
          globalAudioSynthesizer.playPieceSelect();
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
        globalAudioSynthesizer.playPieceSelect();
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

      const targetCoordKey = asCoordinateKey(coord);

      // If move is a pawn promotion, pause execution and present accessible Promotion Modal (Spec 06 RF-08, US06-P09, Spec 01 US01-C10)
      if (matchedMove.isPromotion) {
        setPendingPromotion({
          pieceId: selectedPiece.id,
          sourceCoord: selectedPiece.position,
          targetCoord: targetCoordKey,
          ownerId: selectedPiece.ownerId as PlayerId,
          allowedVariants: matchedMove.promotionOptions ?? ['QUEEN', 'KNIGHT', 'ROOK', 'BISHOP'],
        });
        return;
      }

      try {
        onClearInvalidMove?.();
        const isTargetOccupied = Boolean(domain.occupancy[targetCoordKey]);
        const targetEntityId = domain.occupancy[targetCoordKey];
        const capturedPiece = targetEntityId
          ? (domain.boardEntities[targetEntityId] as IPieceEntity | undefined)
          : undefined;
        const isAtomic = Boolean(domain.variantId?.toUpperCase().includes('ATOMIC'));

        const moveCmd = new MovePieceCommand(
          selectedPiece.id,
          selectedPiece.position,
          targetCoordKey,
          domain.activePlayer,
          undefined,
          true,
          true,
          undefined,
          topology
        );
        executeCommand(moveCmd);

        // Decoupled Audio & Feedback Event Dispatching (Spec 01 Section 10.2 & Spec 12 RF-18)
        if (isAtomic && isTargetOccupied) {
          GlobalEventBus.emit('EXPLOSION', {
            epicenter: targetCoordKey,
            radius: 1,
            destroyedIds: targetEntityId ? [targetEntityId] : [],
          });
        } else if (isTargetOccupied && capturedPiece) {
          GlobalEventBus.emit('PIECE_CAPTURED', {
            capturedId: capturedPiece.id,
            captorId: selectedPiece.id,
            coordinate: targetCoordKey,
            variantId: capturedPiece.variantId,
          });
        } else {
          GlobalEventBus.emit('PIECE_MOVED', {
            pieceId: selectedPiece.id,
            from: selectedPiece.position,
            to: targetCoordKey,
            actingPlayer: domain.activePlayer,
          });
        }

        onHumanPieceMoved?.(selectedPiece.position, coord, selectedPiece.id);
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
      onHumanPieceMoved,
      onVariantSquareClick,
    ]
  );

  const handleConfirmPromotion = useCallback(
    (promotionVariant: string) => {
      if (!pendingPromotion) return;
      const { pieceId, sourceCoord, targetCoord } = pendingPromotion;
      try {
        onClearInvalidMove?.();
        const targetCoordKey = asCoordinateKey(targetCoord);
        const isTargetOccupied = Boolean(domain.occupancy[targetCoordKey]);
        const targetEntityId = domain.occupancy[targetCoordKey];
        const capturedPiece = targetEntityId
          ? (domain.boardEntities[targetEntityId] as IPieceEntity | undefined)
          : undefined;
        const isAtomic = Boolean(domain.variantId?.toUpperCase().includes('ATOMIC'));

        const moveCmd = new MovePieceCommand(
          asEntityId(pieceId),
          asCoordinateKey(sourceCoord),
          targetCoordKey,
          domain.activePlayer,
          undefined,
          true,
          true,
          promotionVariant,
          topology
        );
        executeCommand(moveCmd);

        // Decoupled Audio & Feedback Event Dispatching (Spec 01 Section 10.2 & Spec 12 RF-18)
        if (isAtomic && isTargetOccupied) {
          GlobalEventBus.emit('EXPLOSION', {
            epicenter: targetCoordKey,
            radius: 1,
            destroyedIds: targetEntityId ? [targetEntityId] : [],
          });
        } else if (isTargetOccupied && capturedPiece) {
          GlobalEventBus.emit('PIECE_CAPTURED', {
            capturedId: capturedPiece.id,
            captorId: asEntityId(pieceId),
            coordinate: targetCoordKey,
            variantId: capturedPiece.variantId,
          });
        } else {
          GlobalEventBus.emit('PIECE_MOVED', {
            pieceId: asEntityId(pieceId),
            from: asCoordinateKey(sourceCoord),
            to: targetCoordKey,
            actingPlayer: domain.activePlayer,
          });
        }

        onHumanPieceMoved?.(sourceCoord, targetCoordKey, pieceId);
      } catch (err) {
        console.warn('[ChessBoard3D] Promotion execution error:', err);
      } finally {
        setPendingPromotion(null);
        selectPiece(null);
      }
    },
    [pendingPromotion, onClearInvalidMove, domain, topology, executeCommand, onHumanPieceMoved, selectPiece]
  );

  const handleCancelPromotion = useCallback(() => {
    setPendingPromotion(null);
    selectPiece(null);
  }, [selectPiece]);

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

  const cameraDist = effectiveBoardSize > 12 ? 14.5 : effectiveBoardSize > 9 ? 10.5 : 7.5;
  const cameraHeight = effectiveBoardSize > 12 ? 16.0 : effectiveBoardSize > 9 ? 11.5 : 8.5;
  const cameraPosition: [number, number, number] = isFlipped
    ? [0, cameraHeight, cameraDist]
    : [0, cameraHeight, -cameraDist];

  return (
    <div
      id="chess-board-3d-container"
      data-testid="chess-board-3d-container"
      style={{
        width: '100%',
        maxWidth: 'min(calc(100vh - 170px), 720px)',
        aspectRatio: '1 / 1',
        position: 'relative',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-lg)',
        border: '2px solid var(--border-prominent)',
        backgroundColor: 'var(--bg-card)',
      }}
    >
      {/* Interactive Action Indicator Bar atop 3D Canvas (Spec 06 & Spec 07 § 10) */}
      {(selectedSpellType || selectedDropPiece || duckPlacementActive || Boolean(activeExplosion) || forcedCapturePieceIds.length > 0 || hillVictoryMoveCoords.length > 0) && (
        <div
          data-testid="board-action-indicator-3d"
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute',
            top: '8px',
            left: '8px',
            right: '8px',
            zIndex: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 12px',
            borderRadius: 'var(--radius-sm, 6px)',
            backdropFilter: 'blur(8px)',
            backgroundColor:
              hillVictoryMoveCoords.length > 0
                ? 'rgba(245, 158, 11, 0.45)'
                : forcedCapturePieceIds.length > 0
                ? 'rgba(16, 185, 129, 0.4)'
                : selectedSpellType === 'FREEZE'
                ? 'rgba(6, 182, 212, 0.35)'
                : selectedSpellType === 'JUMP'
                ? 'rgba(168, 85, 247, 0.35)'
                : duckPlacementActive
                ? 'rgba(234, 179, 8, 0.35)'
                : activeExplosion
                ? 'rgba(239, 68, 68, 0.4)'
                : 'rgba(16, 185, 129, 0.35)',
            border:
              hillVictoryMoveCoords.length > 0
                ? '1.5px solid #fbbf24'
                : forcedCapturePieceIds.length > 0
                ? '1.5px solid #10b981'
                : selectedSpellType === 'FREEZE'
                ? '1.5px solid #06b6d4'
                : selectedSpellType === 'JUMP'
                ? '1.5px solid #a855f7'
                : duckPlacementActive
                ? '1.5px solid #eab308'
                : activeExplosion
                ? '1.5px solid #ef4444'
                : '1.5px solid #10b981',
            fontSize: '0.8rem',
            fontWeight: 700,
            color: '#fff',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
            pointerEvents: 'none',
          }}
        >
          <span style={{ pointerEvents: 'auto' }}>
            {hillVictoryMoveCoords.length > 0 && 'King of the Hill (3D): Lance da vitória disponível! Alcance o santuário central para vencer.'}
            {forcedCapturePieceIds.length > 0 && !hillVictoryMoveCoords.length && 'Antichess (3D): Captura obrigatória! Mova uma das peças de combate destacadas em esmeralda.'}
            {selectedSpellType === 'FREEZE' && 'Modo Congelamento (3D): Clique na casa central 3×3 para congelar.'}
            {selectedSpellType === 'JUMP' && 'Conceder Salto (3D): Clique sobre uma peça aliada para conceder a habilidade de saltar.'}
            {duckPlacementActive && 'Colocar Pato (3D): Clique em uma casa vazia para posicionar o pato.'}
            {selectedDropPiece && `Drop de ${selectedDropPiece} (3D): Clique em uma casa vazia para inserir a peça na reserva.`}
            {selectedSpellType === 'PORTAL' && 'Portal (3D): Clique em duas casas vazias para criar o atalho.'}
            {selectedSpellType === 'STEALTH_TRAP' && 'Mina Oculta (3D): Clique em uma casa vazia para plantar.'}
            {selectedSpellType === 'INVISIBILITY' && 'Invisibilidade (3D): Clique em uma peça aliada para ocultá-la por 2 turnos.'}
            {selectedSpellType === 'MIRROR_SHIELD' && 'Escudo Espelhado (3D): Clique em uma peça aliada para protegê-la por 3 turnos.'}
            {selectedSpellType === 'RESURRECTION' && 'Ressurreição (3D): Clique em uma casa livre da sua primeira fileira para reviver uma peça.'}
            {activeExplosion && !selectedSpellType && !selectedDropPiece && !duckPlacementActive && !forcedCapturePieceIds.length && !hillVictoryMoveCoords.length && 'Detonação Atômica! Área de impacto 3×3 detonada.'}
          </span>
          {onCancelAction && !duckPlacementActive && (
            <button
              type="button"
              id="btn-board-3d-cancel-action"
              data-testid="btn-board-3d-cancel-action"
              onClick={onCancelAction}
              style={{
                marginLeft: '8px',
                padding: '3px 9px',
                fontSize: '0.72rem',
                borderRadius: '4px',
                border: '1px solid #ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.25)',
                color: '#fca5a5',
                cursor: 'pointer',
                fontWeight: 600,
                pointerEvents: 'auto',
              }}
            >
              Cancelar
            </button>
          )}
        </div>
      )}
      <Canvas
        shadows
        camera={{ position: cameraPosition, fov: 45 }}
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        style={{ width: '100%', height: '100%', display: 'block' }}
        onCreated={({ invalidate }) => {
          invalidate();
        }}
      >
        <Chess3DInstrumentation
          boardSize={effectiveBoardSize}
          isFlipped={isFlipped}
          onSquareClick={handleSquareClick}
        />
        <FrameInvalidator
          deps={[
            domain.revision,
            domain.turnNumber,
            domain.activePlayer,
            ui.selectedPieceId,
            legalMoveCoords.length,
            lastMoveCoords.join('|'),
            invalidMoveFeedback?.timestamp,
            checkConstraintCoords?.kingCoord,
            uiTheme,
            duckCoordinate,
            frozenCoordinates?.join('|'),
            activeExplosion?.center,
            forcedCaptureCoords.join('|'),
            hillVictoryMoveCoords.join('|'),
          ]}
        />

        {/* Smooth Camera Orbital Lerp & OrbitControls (Spec 07 § 10, RF-07) */}
        <SmoothCameraController
          isFlipped={isFlipped}
          cameraHeight={cameraHeight}
          cameraDist={cameraDist}
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
          intensity={0.5}
          color={rimLightColor}
        />
        <directionalLight
          position={[0, 10, -2]}
          intensity={0.35}
          color="#f8fafc"
        />

        {/* Non-Euclidean 3D Boards (Torus Donut 3D vs Cube 3D vs Standard Instanced) */}
        {domain.variantId?.toUpperCase().includes('TORUS') || domain.variantId?.toUpperCase().includes('TOROIDAL') ? (
          <ToroidalChessBoard3D
            boardSize={effectiveBoardSize}
            lightColor={activeBoardColors.lightSquare}
            darkColor={activeBoardColors.darkSquare}
            pieces={activePieces}
            selectedPieceId={ui.selectedPieceId}
            legalMoveCoords={legalMoveCoords}
            onSquareClick={handleSquareClick}
            onPieceClick={handlePieceClick}
          />
        ) : domain.variantId?.toUpperCase().includes('CUBE') || domain.variantId?.toUpperCase().includes('CUBIC') ? (
          <CubicChessBoard3D
            boardSize={effectiveBoardSize}
            lightColor={activeBoardColors.lightSquare}
            darkColor={activeBoardColors.darkSquare}
            pieces={activePieces}
            selectedPieceId={ui.selectedPieceId}
            legalMoveCoords={legalMoveCoords}
            onSquareClick={handleSquareClick}
            onPieceClick={handlePieceClick}
          />
        ) : (
          <>
            {/* 3D Board Surface (InstancedMesh) */}
            <InstancedBoard
              boardSize={effectiveBoardSize}
              variantId={domain.variantId}
              lightColor={activeBoardColors.lightSquare}
              darkColor={activeBoardColors.darkSquare}
              selectedCoord={selectedPiece?.position}
              legalMoveCoords={legalMoveCoords}
              lastMoveCoords={lastMoveCoords}
              checkConstraintCoords={checkConstraintCoords}
              onSquareClick={handleSquareClick}
            />

            {/* 3D Pieces (GPU Matrix Batched InstancedMesh vs Procedural PBR Meshes) */}
            {useInstancedBatching ? (
              <InstancedPieceBatcher
                boardSize={effectiveBoardSize}
                pieces={activePieces}
                selectedPieceId={ui.selectedPieceId}
                checkKingCoord={checkConstraintCoords?.kingCoord}
                onPieceClick={handlePieceClick}
              />
            ) : (
              <InstancedPieces
                boardSize={effectiveBoardSize}
                variantId={domain.variantId}
                pieces={activePieces}
                selectedPieceId={ui.selectedPieceId}
                checkConstraintCoords={checkConstraintCoords}
                onPieceClick={handlePieceClick}
              />
            )}
          </>
        )}

        {/* Variant mechanics: Duck Chess duck, Spell Chess frozen squares/portals/traps, Hill Sanctuary, Antichess Beacons and Atomic Explosion */}
        <VariantOverlays3D
          boardSize={effectiveBoardSize}
          variantId={domain.variantId}
          duckCoordinate={duckCoordinate}
          frozenCoordinates={frozenCoordinates}
          activePortals={activePortals}
          stealthTraps={stealthTraps}
          explosionEpicenter={activeExplosion?.center ?? null}
          forcedCaptureCoords={forcedCaptureCoords}
          hillVictoryMoveCoords={hillVictoryMoveCoords}
        />
      </Canvas>

      {/* Interactive 3D HUD Badge & Safe 2D Fallback Button (Priority 3 & 8) */}
      <div
        data-testid="badge-board-3d"
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
        <span>3D WebGL</span>
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

      {/* Accessible Pawn Promotion Dialog for 3D View (Spec 06 RF-08, US06-P09, Spec 01 US01-C10) */}
      <PromotionModal
        isOpen={Boolean(pendingPromotion)}
        onSelectPromotion={handleConfirmPromotion}
        onCancel={handleCancelPromotion}
        ownerId={pendingPromotion?.ownerId}
        targetCoord={pendingPromotion?.targetCoord}
        allowedVariants={pendingPromotion?.allowedVariants}
      />
    </div>
  );
};

export default ChessBoard3D;
