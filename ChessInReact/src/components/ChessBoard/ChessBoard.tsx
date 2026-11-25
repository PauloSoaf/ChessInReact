import React, { useMemo } from 'react';
import BoardSquare from '../BoardSquare/BoardSquare';
import { IChessPiece, ISquareInfo } from '../../Interfaces/Interfaces';
import { chessPieces } from '../../constants/chessPieces';
import { useGameActions, useGameStore } from '../../bindings/react/useGameStore';
import { asCoordinateKey, asEntityId } from '../../core/coordinates';
import { MovePieceCommand } from '../../core/commands/MovePieceCommand';
import { IPieceEntity } from '../../core/entities/types';
import { ITopology } from '../../core/topology/types';
import { SquareTopology } from '../../core/topology/SquareTopology';
import { RulesEngine } from '../../engine/rules/RulesEngine';
import { VariantRegistry } from '../../engine/rules/VariantRegistry';
import { PlayerId } from '../../core/coordinates/types';
import { useTheme } from '../../ui/theme/ThemeContext';
import { CheckValidator } from '../../engine/rules/CheckValidator';
import { VariantMapConfig } from '../../engine/variants/VariantMapConfig';
import { VariantCatalog } from '../../engine/variants/catalog/VariantCatalog';
import { GlobalEventBus } from '../../core/events/EventBus';
import { IInvalidMoveFeedback, ITriggerFeedbackOptions, InvalidMoveReason } from '../../bindings/react/useMoveFeedback';
import { PromotionModal } from '../../ui/components/game/PromotionModal';
import { globalAudioSynthesizer } from '../../audio/WebAudioSynthesizer';

export interface IChessBoardProps {
  boardSize?: number;
  topology?: ITopology;
  isBotThinking?: boolean;
  disabled?: boolean;
  botPlayer?: PlayerId;
  /** Optional legacy prop maintained for backward compatibility */
  boardDisplay?: IChessPiece[][];
  setBoardDisplay?: (newBoardDisplay: Array<IChessPiece>[]) => void;
  invalidMoveFeedback?: IInvalidMoveFeedback | null;
  onTriggerInvalidMove?: (reason: InvalidMoveReason, options: ITriggerFeedbackOptions) => void;
  onClearInvalidMove?: () => void;
  /** Duck Chess duck square (game coordinate key, e.g. "3,4") */
  duckCoordinate?: string | null;
  /** Spell Chess frozen squares (game coordinate keys) */
  frozenCoordinates?: readonly string[];
  /** Spell Chess active linked portals */
  activePortals?: ReadonlyArray<{ readonly coordA: string; readonly coordB: string }>;
  /** Spell Chess stealth traps */
  stealthTraps?: Readonly<Record<string, string>>;
  /** Selected spell type for targeting hover preview ('FREEZE', 'JUMP', etc.) */
  selectedSpellType?: 'FREEZE' | 'JUMP' | string | null;
  /** Selected piece variant for reserve drops */
  selectedDropPiece?: string | null;
  /** Whether Duck Chess is waiting for duck placement (Phase 2) */
  duckPlacementActive?: boolean;
  /** Callback to cancel pending spell or drop action */
  onCancelAction?: () => void;
  /** Called after a successful human move in a variant with a secondary phase. */
  /** Optional last move coordinates for visual highlight (Spec 06 / Lichess standard) */
  lastMove?: { from?: string; to: string } | null;
  onHumanPieceMoved?: (from: string, to: string, pieceId: string) => void;
  /** Handles a variant-specific click such as Duck Chess placement or Spell targeting. */
  onVariantSquareClick?: (coordinate: string) => boolean;
}

export const ChessBoard: React.FC<IChessBoardProps> = ({
  boardSize = 8,
  topology: propTopology,
  isBotThinking = false,
  disabled = false,
  botPlayer,
  invalidMoveFeedback,
  onTriggerInvalidMove,
  onClearInvalidMove,
  duckCoordinate,
  frozenCoordinates,
  activePortals,
  stealthTraps,
  selectedSpellType,
  selectedDropPiece,
  duckPlacementActive,
  onCancelAction,
  lastMove: propLastMove,
  onHumanPieceMoved,
  onVariantSquareClick,
}) => {
  const { preferences, activeBoardColors } = useTheme();
  const isFlipped = Boolean(preferences.flipBoard);

  const domain = useGameStore((state) => state.domain);
  const ui = useGameStore((state) => state.ui);
  const { executeCommand, selectPiece } = useGameActions();

  // Track previous move dynamically via GlobalEventBus (Spec 06 Section 18)
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

  const activeLastMove = propLastMove !== undefined ? propLastMove : internalLastMove;

  // Single authoritative topology resolved from prop or master variant catalog (Spec 02 § 6 & Audit)
  const topology = useMemo(() => {
    if (propTopology) return propTopology;
    if (boardSize && boardSize !== 8) {
      return new SquareTopology({ width: boardSize, height: boardSize });
    }
    return VariantCatalog.getTopologyForVariant(domain.variantId);
  }, [propTopology, boardSize, domain.variantId]);

  const effectiveWidth = (topology as { readonly width?: number }).width ?? boardSize;
  const effectiveHeight = (topology as { readonly height?: number }).height ?? boardSize;

  // WAI-ARIA Roving Tabindex: store focused square in logical game coordinates (gameX, gameY)
  // Ensures exactly 1 valid tab stop across any board dimensions (8x8, 10x8, 9x10, 14x14) and orientation (flipped).
  const [focusedLogicalCoord, setFocusedLogicalCoord] = React.useState<{ gameX: number; gameY: number }>(() => ({
    gameX: Math.floor(effectiveWidth / 2),
    gameY: Math.min(1, effectiveHeight - 1),
  }));

  // Accessible Pawn Promotion Dialog state (Spec 06 RF-08, US06-P09, Spec 01 US01-C10)
  const [pendingPromotion, setPendingPromotion] = React.useState<{
    pieceId: string;
    sourceCoord: string;
    targetCoord: string;
    ownerId: PlayerId;
    allowedVariants?: string[];
  } | null>(null);

  // Ensure logical coordinates remain within current board boundaries if dimensions change
  const validLogicalCoord = useMemo(() => {
    return {
      gameX: Math.max(0, Math.min(effectiveWidth - 1, focusedLogicalCoord.gameX)),
      gameY: Math.max(0, Math.min(effectiveHeight - 1, focusedLogicalCoord.gameY)),
    };
  }, [focusedLogicalCoord, effectiveWidth, effectiveHeight]);

  // Derive visual (col, row) coordinates reactively from logical coordinates and flip state
  const activeVisualCoord = useMemo(() => {
    return {
      col: isFlipped ? effectiveWidth - 1 - validLogicalCoord.gameX : validLogicalCoord.gameX,
      row: isFlipped ? validLogicalCoord.gameY : effectiveHeight - 1 - validLogicalCoord.gameY,
    };
  }, [validLogicalCoord, isFlipped, effectiveWidth, effectiveHeight]);

  // Keep roving active square in sync with selected piece
  React.useEffect(() => {
    if (!ui.selectedPieceId) return;
    const entity = domain.boardEntities[ui.selectedPieceId] as IPieceEntity | undefined;
    if (!entity?.position) return;
    const parts = entity.position.split(',');
    if (parts.length === 2) {
      const gx = parseInt(parts[0], 10);
      const gy = parseInt(parts[1], 10);
      if (!isNaN(gx) && !isNaN(gy)) {
        setFocusedLogicalCoord({
          gameX: Math.max(0, Math.min(effectiveWidth - 1, gx)),
          gameY: Math.max(0, Math.min(effectiveHeight - 1, gy)),
        });
      }
    }
  }, [ui.selectedPieceId, domain.boardEntities, effectiveWidth, effectiveHeight]);

  // When board is flipped or resized while an element inside the board is focused, retain DOM focus on the updated visual square
  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const activeEl = document.activeElement;
    if (activeEl && activeEl.getAttribute('data-square-col') !== null) {
      const nextSquare = document.querySelector<HTMLElement>(
        `[data-square-col="${activeVisualCoord.col}"][data-square-row="${activeVisualCoord.row}"]`
      );
      nextSquare?.focus({ preventScroll: true });
    }
  }, [isFlipped, effectiveWidth, effectiveHeight, activeVisualCoord.col, activeVisualCoord.row]);

  const handleFocusSquare = (visualCol: number, visualRow: number) => {
    const gx = isFlipped ? effectiveWidth - 1 - visualCol : visualCol;
    const gy = isFlipped ? visualRow : effectiveHeight - 1 - visualRow;
    setFocusedLogicalCoord({
      gameX: Math.max(0, Math.min(effectiveWidth - 1, gx)),
      gameY: Math.max(0, Math.min(effectiveHeight - 1, gy)),
    });
  };

  const isCubic = Boolean((topology as { readonly isCubic?: boolean }).isCubic);
  const [selectedFace, setSelectedFace] = React.useState<number>(2); // Default face 2: FRONT
  const [hoveredCoord, setHoveredCoord] = React.useState<string | null>(null);

  const freezeBlastArea = useMemo(() => {
    if (!hoveredCoord || selectedSpellType !== 'FREEZE') return null;
    let center = hoveredCoord;
    if (center.includes(':')) {
      center = center.split(':')[1];
    }
    const [cxStr, cyStr] = center.split(',');
    const cx = parseInt(cxStr, 10);
    const cy = parseInt(cyStr, 10);
    if (isNaN(cx) || isNaN(cy)) return null;

    const set = new Set<string>();
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const tx = cx + dx;
        const ty = cy + dy;
        if (tx >= 0 && tx < effectiveWidth && ty >= 0 && ty < effectiveHeight) {
          set.add(`${tx},${ty}`);
        }
      }
    }
    return { center: `${cx},${cy}`, coords: set };
  }, [hoveredCoord, selectedSpellType, effectiveWidth, effectiveHeight]);

  // Antichess forced captures detection (Spec 04 & Spec 13 RF-13-06)
  const isAntichess = Boolean(
    domain.variantId &&
    (domain.variantId.toUpperCase().includes('ANTICHESS') || domain.variantId.toUpperCase().includes('GIVEAWAY'))
  );
  const forcedCapturePieceIds = useMemo(() => {
    if (!isAntichess || domain.isGameOver) return new Set<string>();
    const allLegals = RulesEngine.getLegalMoves(domain, topology, VariantRegistry.resolveRulesConfig(domain.variantId));
    const captures = allLegals.filter((m) => m.isCapture);
    if (captures.length === 0) return new Set<string>();
    return new Set(captures.map((m) => m.pieceId));
  }, [isAntichess, domain, topology]);

  const hasForcedCaptures = forcedCapturePieceIds.size > 0;

  // Automatically switch face to match selected piece
  React.useEffect(() => {
    if (!isCubic || !ui.selectedPieceId) return;
    const entity = domain.boardEntities[ui.selectedPieceId] as IPieceEntity | undefined;
    if (entity?.position?.includes(':')) {
      const f = parseInt(entity.position.split(':')[0], 10);
      if (!isNaN(f) && f >= 0 && f <= 5) {
        setSelectedFace(f);
      }
    }
  }, [isCubic, ui.selectedPieceId, domain.boardEntities]);

  // Derive board display matrix reactively from Core domain state (Single Source of Truth - AUDIT-04)
  const derivedBoard = useMemo(() => {
    const grid: IChessPiece[][] = [];

    for (let rowIndex = 0; rowIndex < effectiveHeight; rowIndex++) {
      const row: IChessPiece[] = [];
      const gameY = isFlipped ? rowIndex : effectiveHeight - 1 - rowIndex;

      for (let colIndex = 0; colIndex < effectiveWidth; colIndex++) {
        const gameX = isFlipped ? effectiveWidth - 1 - colIndex : colIndex;
        const coordKey = isCubic
          ? asCoordinateKey(`${selectedFace}:${gameX},${gameY}`)
          : asCoordinateKey(`${gameX},${gameY}`);
        const entityId = domain.occupancy[coordKey];
        const entity = entityId
          ? (domain.boardEntities[entityId] as IPieceEntity | undefined)
          : undefined;

        if (entity && entity.type === 'PIECE' && !entity.isCaptured) {
          const vUpper = entity.variantId.toUpperCase();
          const isP1 =
            entity.ownerId === 'P1' ||
            (typeof entity.ownerId === 'string' &&
              ['P1', 'WHITE', 'PLAYER1', 'W'].includes(entity.ownerId.toUpperCase()));
          const isXiangqi = Boolean(domain.variantId?.toUpperCase().includes('XIANGQI'));
          const isShogi = Boolean(domain.variantId?.toUpperCase().includes('SHOGI'));

          let symbol = '';
          if (isXiangqi) {
            if (vUpper === 'KING' || vUpper === 'GENERAL' || vUpper === 'SHUAI' || vUpper === 'JIANG') {
              symbol = isP1 ? '帥' : '將';
            } else if (vUpper === 'ADVISOR') {
              symbol = isP1 ? '仕' : '士';
            } else if (vUpper === 'ELEPHANT') {
              symbol = isP1 ? '相' : '象';
            } else if (vUpper === 'HORSE' || vUpper === 'KNIGHT') {
              symbol = isP1 ? '傌' : '馬';
            } else if (vUpper === 'CHARIOT' || vUpper === 'ROOK') {
              symbol = isP1 ? '俥' : '車';
            } else if (vUpper === 'CANNON') {
              symbol = isP1 ? '炮' : '砲';
            } else if (vUpper === 'SOLDIER' || vUpper === 'PAWN') {
              symbol = isP1 ? '兵' : '卒';
            }
          } else if (isShogi) {
            if (vUpper === 'KING' || vUpper === 'GYOKU') {
              symbol = isP1 ? '玉' : '王';
            } else if (vUpper === 'LANCE') {
              symbol = '香';
            } else if (vUpper === 'KNIGHT') {
              symbol = '桂';
            } else if (vUpper === 'SILVER') {
              symbol = '銀';
            } else if (vUpper === 'GOLD') {
              symbol = '金';
            } else if (vUpper === 'BISHOP') {
              symbol = '角';
            } else if (vUpper === 'ROOK') {
              symbol = '飛';
            } else if (vUpper === 'PAWN') {
              symbol = '歩';
            } else if (vUpper === 'TOKIN') {
              symbol = 'と';
            }
          }

          if (!symbol) {
            const variantKey = entity.variantId.toLowerCase();
            const base = chessPieces[variantKey] ?? { symbol: '♟', name: variantKey };
            symbol = base.symbol ?? '♟';
          }

          row.push({
            name: entity.variantId,
            symbol,
            color: isP1 ? 'white' : '#ed2fed',
            ownerId: isP1 ? 'P1' : (entity.ownerId ?? 'P2'),
          });
        } else {
          row.push(chessPieces.none);
        }
      }
      grid.push(row);
    }
    return grid;
  }, [domain.occupancy, domain.boardEntities, domain.variantId, effectiveWidth, effectiveHeight, isFlipped, isCubic, selectedFace]);

  // Currently selected entity
  const selectedEntity = useMemo(() => {
    if (!ui.selectedPieceId) return undefined;
    return domain.boardEntities[ui.selectedPieceId] as IPieceEntity | undefined;
  }, [ui.selectedPieceId, domain.boardEntities]);

  // Compute legal moves map when showLegalMoves preference is enabled
  const legalMovesMap = useMemo(() => {
    if (
      !preferences.showLegalMoves ||
      !selectedEntity ||
      selectedEntity.ownerId !== domain.activePlayer
    ) {
      return new Map<string, boolean>();
    }
    const moves = RulesEngine.getLegalMovesForPiece(selectedEntity, domain, topology);
    const map = new Map<string, boolean>();
    for (const m of moves) {
      const isCap = Boolean(m.isCapture || (m.to && domain.occupancy[m.to]));
      map.set(m.to, isCap);
    }
    return map;
  }, [preferences.showLegalMoves, selectedEntity, domain, topology]);

  const isAtomicVariant = Boolean(domain.variantId?.toUpperCase().includes('ATOMIC'));
  const atomicBlastArea = useMemo(() => {
    if (!isAtomicVariant || !hoveredCoord || !ui.selectedPieceId) return null;
    let center = hoveredCoord;
    if (center.includes(':')) {
      center = center.split(':')[1];
    }
    const [cxStr, cyStr] = center.split(',');
    const cx = parseInt(cxStr, 10);
    const cy = parseInt(cyStr, 10);
    if (isNaN(cx) || isNaN(cy)) return null;

    const targetKey = asCoordinateKey(`${cx},${cy}`);
    const isCapture = legalMovesMap.get(targetKey);
    if (!isCapture) return null;

    const set = new Set<string>();
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const tx = cx + dx;
        const ty = cy + dy;
        if (tx >= 0 && tx < effectiveWidth && ty >= 0 && ty < effectiveHeight) {
          set.add(`${tx},${ty}`);
        }
      }
    }
    return { center: `${cx},${cy}`, coords: set };
  }, [isAtomicVariant, hoveredCoord, ui.selectedPieceId, legalMovesMap, effectiveWidth, effectiveHeight]);

  const variantTheme = useMemo(
    () => VariantMapConfig.getVariantTheme(domain.variantId),
    [domain.variantId]
  );

  const portalCoordSet = useMemo(() => {
    const set = new Set<string>();
    for (const p of activePortals ?? []) {
      set.add(p.coordA);
      set.add(p.coordB);
    }
    return set;
  }, [activePortals]);

  const getSquareBackground = (gameX: number, gameY: number) => {
    if (variantTheme.themeId !== 'CLASSIC') {
      return (gameX + gameY) % 2 === 0
        ? variantTheme.darkSquare
        : variantTheme.lightSquare;
    }
    return (gameX + gameY) % 2 === 0
      ? activeBoardColors.darkSquare
      : activeBoardColors.lightSquare;
  };

  const handleSquareClick = (squareInfo: ISquareInfo) => {
    if (
      domain.isGameOver ||
      domain.winnerId !== null ||
      isBotThinking ||
      disabled
    ) {
      return;
    }

    const gameX =
      squareInfo.gameX !== undefined
        ? squareInfo.gameX
        : isFlipped
          ? effectiveWidth - 1 - squareInfo.column
          : squareInfo.column;
    const gameY =
      squareInfo.gameY !== undefined
        ? squareInfo.gameY
        : isFlipped
          ? squareInfo.row
          : effectiveHeight - 1 - squareInfo.row;
    const clickedCoord = isCubic
      ? asCoordinateKey(`${selectedFace}:${gameX},${gameY}`)
      : asCoordinateKey(`${gameX},${gameY}`);

    if (VariantMapConfig.isVoidSquare(domain.variantId, gameX, gameY, effectiveWidth)) {
      return;
    }

    if (onVariantSquareClick?.(clickedCoord)) {
      return;
    }

    if (botPlayer && domain.activePlayer === botPlayer) {
      return;
    }

    const clickedEntityId = domain.occupancy[clickedCoord];
    const clickedEntity = clickedEntityId
      ? (domain.boardEntities[clickedEntityId] as IPieceEntity | undefined)
      : undefined;

    // 1. If no piece is currently selected
    if (!ui.selectedPieceId) {
      if (
        clickedEntity &&
        clickedEntity.type === 'PIECE' &&
        clickedEntity.ownerId === domain.activePlayer &&
        !clickedEntity.isCaptured
      ) {
        // If the king is in check and this piece cannot solve it, give feedback
        const isKingInCheck = CheckValidator.isRoyalInCheck(domain.activePlayer, domain, topology);
        const legalMoves = RulesEngine.getLegalMovesForPiece(clickedEntity, domain, topology);
        if (isKingInCheck && legalMoves.length === 0) {
          const king = CheckValidator.findRoyalPiece(domain.activePlayer, domain);
          onTriggerInvalidMove?.('CHECK_CONSTRAINT', {
            sourceCoord: clickedEntity.position,
            kingCoord: king?.position,
            message: 'Movimento inválido: seu rei está em xeque. Essa peça não pode se mover enquanto o rei estiver em xeque.',
          });
          return;
        }

        onClearInvalidMove?.();
        globalAudioSynthesizer.playPieceSelect();
        selectPiece(clickedEntity.id);
      }
      return;
    }

    // 2. A piece is currently selected
    const activeSelected = domain.boardEntities[ui.selectedPieceId] as
      | IPieceEntity
      | undefined;
    if (!activeSelected) {
      onClearInvalidMove?.();
      selectPiece(null);
      return;
    }

    // Clicking the same piece deselects it
    if (activeSelected.id === clickedEntityId || activeSelected.position === clickedCoord) {
      onClearInvalidMove?.();
      selectPiece(null);
      return;
    }

    // Clicking another friendly piece switches the selection
    if (
      clickedEntity &&
      clickedEntity.type === 'PIECE' &&
      clickedEntity.ownerId === domain.activePlayer &&
      !clickedEntity.isCaptured
    ) {
      const isKingInCheck = CheckValidator.isRoyalInCheck(domain.activePlayer, domain, topology);
      const legalMoves = RulesEngine.getLegalMovesForPiece(clickedEntity, domain, topology);
      if (isKingInCheck && legalMoves.length === 0) {
        const king = CheckValidator.findRoyalPiece(domain.activePlayer, domain);
        onTriggerInvalidMove?.('CHECK_CONSTRAINT', {
          sourceCoord: clickedEntity.position,
          kingCoord: king?.position,
          message: 'Movimento inválido: seu rei está em xeque. Essa peça não pode se mover enquanto o rei estiver em xeque.',
        });
        return;
      }

      onClearInvalidMove?.();
      globalAudioSynthesizer.playPieceSelect();
      selectPiece(clickedEntity.id);
      return;
    }

    // Rules Engine Validation: Query legal moves for this piece before dispatching (RF-14)
    const legalMoves = RulesEngine.getLegalMovesForPiece(activeSelected, domain, topology);
    const matchedMove = legalMoves.find((m) => m.to === clickedCoord);

    if (!matchedMove) {
      const isKingInCheck = CheckValidator.isRoyalInCheck(domain.activePlayer, domain, topology);
      const king = CheckValidator.findRoyalPiece(domain.activePlayer, domain);

      if (isKingInCheck) {
        onTriggerInvalidMove?.('CHECK_CONSTRAINT', {
          sourceCoord: activeSelected.position,
          targetCoord: clickedCoord,
          kingCoord: king?.position,
          message: 'Movimento inválido: seu rei está em xeque. Resolva o xeque movendo o rei, capturando a ameaça ou bloqueando a linha.',
        });
      } else {
        onTriggerInvalidMove?.('ILLEGAL_MOVE', {
          sourceCoord: activeSelected.position,
          targetCoord: clickedCoord,
          message: 'Movimento não permitido pelas regras desta peça.',
        });
      }

      selectPiece(null);
      return;
    }

    // If move is a pawn promotion, pause execution and present accessible Promotion Modal (Spec 06 RF-08, US06-P09, Spec 01 US01-C10)
    if (matchedMove.isPromotion) {
      setPendingPromotion({
        pieceId: activeSelected.id,
        sourceCoord: activeSelected.position,
        targetCoord: clickedCoord,
        ownerId: activeSelected.ownerId,
        allowedVariants: matchedMove.promotionOptions ?? ['QUEEN', 'KNIGHT', 'ROOK', 'BISHOP'],
      });
      return;
    }

    // Dispatch MovePieceCommand through Core State Store with full rules validation
    try {
      onClearInvalidMove?.();
      const isTargetOccupied = Boolean(domain.occupancy[clickedCoord]);
      const targetEntityId = domain.occupancy[clickedCoord];
      const capturedPiece = targetEntityId
        ? (domain.boardEntities[targetEntityId] as IPieceEntity | undefined)
        : undefined;
      const isAtomic = Boolean(domain.variantId?.toUpperCase().includes('ATOMIC'));

      const moveCmd = new MovePieceCommand(
        activeSelected.id,
        activeSelected.position,
        clickedCoord,
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
          epicenter: clickedCoord,
          radius: 1,
          destroyedIds: targetEntityId ? [targetEntityId] : [],
        });
      } else if (isTargetOccupied && capturedPiece) {
        GlobalEventBus.emit('PIECE_CAPTURED', {
          capturedId: capturedPiece.id,
          captorId: activeSelected.id,
          coordinate: clickedCoord,
          variantId: capturedPiece.variantId,
        });
      } else {
        GlobalEventBus.emit('PIECE_MOVED', {
          pieceId: activeSelected.id,
          from: activeSelected.position,
          to: clickedCoord,
          actingPlayer: domain.activePlayer,
        });
      }

      onHumanPieceMoved?.(activeSelected.position, clickedCoord, activeSelected.id);
    } catch (err) {
      console.warn('[RulesEngine] Move rejected by Core invariants / Rules Engine:', err);
    } finally {
      selectPiece(null);
    }
  };

  const handleConfirmPromotion = (promotionVariant: string) => {
    if (!pendingPromotion) return;
    const { pieceId, sourceCoord, targetCoord } = pendingPromotion;
    const targetCoordKey = asCoordinateKey(targetCoord);
    try {
      onClearInvalidMove?.();
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

      onHumanPieceMoved?.(sourceCoord, targetCoord, pieceId);
    } catch (err) {
      console.warn('[RulesEngine] Promotion rejected by Core invariants / Rules Engine:', err);
    } finally {
      setPendingPromotion(null);
      selectPiece(null);
    }
  };

  const handleCancelPromotion = () => {
    setPendingPromotion(null);
    selectPiece(null);
  };

  const isSpellVariant = Boolean(domain.variantId && domain.variantId.toUpperCase().includes('SPELL'));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', position: 'relative' }}>
      {isCubic && (
        <div
          data-testid="cubic-face-selector"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '4px',
            marginBottom: '6px',
            justifyContent: 'center',
          }}
        >
          {[
            { id: 0, name: 'TOP (Superior)' },
            { id: 1, name: 'BOTTOM (Inferior)' },
            { id: 2, name: 'FRONT (Frontal)' },
            { id: 3, name: 'BACK (Traseira)' },
            { id: 4, name: 'LEFT (Esquerda)' },
            { id: 5, name: 'RIGHT (Direita)' },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              data-testid={`cubic-face-${f.id}`}
              onClick={() => setSelectedFace(f.id)}
              style={{
                fontSize: '0.72rem',
                padding: '2px 6px',
                borderRadius: '4px',
                border: selectedFace === f.id ? '2px solid #38bdf8' : '1px solid var(--border-subtle, #555)',
                backgroundColor: selectedFace === f.id ? 'var(--color-primary, #6366f1)' : 'var(--bg-card, #222)',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: selectedFace === f.id ? 'bold' : 'normal',
              }}
            >
              {f.name}
            </button>
          ))}
        </div>
      )}
      {/* Interactive Action Indicator Bar with explicit Cancel button - Floating HUD overlay to preserve board stability (Spec 06) */}
      {(selectedSpellType || selectedDropPiece || duckPlacementActive || Boolean(atomicBlastArea) || hasForcedCaptures) && (
        <div
          data-testid="board-action-indicator"
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute',
            top: '8px',
            left: '8px',
            right: '8px',
            zIndex: 35,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 12px',
            borderRadius: 'var(--radius-sm, 6px)',
            backdropFilter: 'blur(8px)',
            backgroundColor: selectedSpellType === 'FREEZE'
              ? 'rgba(6, 182, 212, 0.35)'
              : selectedSpellType === 'JUMP'
              ? 'rgba(168, 85, 247, 0.35)'
              : duckPlacementActive
              ? 'rgba(234, 179, 8, 0.35)'
              : atomicBlastArea
              ? 'rgba(239, 68, 68, 0.4)'
              : hasForcedCaptures
              ? 'rgba(16, 185, 129, 0.35)'
              : 'rgba(16, 185, 129, 0.35)',
            border: selectedSpellType === 'FREEZE'
              ? '1.5px solid #06b6d4'
              : selectedSpellType === 'JUMP'
              ? '1.5px solid #a855f7'
              : selectedSpellType === 'INVISIBILITY'
              ? '1.5px solid #8b5cf6'
              : selectedSpellType === 'MIRROR_SHIELD'
              ? '1.5px solid #38bdf8'
              : selectedSpellType === 'RESURRECTION'
              ? '1.5px solid #f59e0b'
              : selectedSpellType === 'PORTAL'
              ? '1.5px solid #14b8a6'
              : selectedSpellType === 'STEALTH_TRAP'
              ? '1.5px solid #f43f5e'
              : duckPlacementActive
              ? '1.5px solid #eab308'
              : atomicBlastArea
              ? '1.5px solid #ef4444'
              : hasForcedCaptures
              ? '1.5px solid #10b981'
              : '1.5px solid #10b981',
            fontSize: '0.78rem',
            fontWeight: 700,
            color: 'var(--text-prominent, #fff)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
            pointerEvents: 'none',
          }}
        >
          <span style={{ pointerEvents: 'auto' }}>
            {selectedSpellType === 'FREEZE' && 'Congelamento: Passe o cursor para visualizar a área 3×3 e clique para congelar.'}
            {selectedSpellType === 'JUMP' && 'Salto: Clique na peça que você deseja conceder permissão para pular.'}
            {duckPlacementActive && 'Pato Neutro: Clique sobre uma casa vazia para posicionar o pato.'}
            {selectedDropPiece && `Drop de ${selectedDropPiece}: Clique em uma casa vazia para introduzir a peça.`}
            {selectedSpellType === 'PORTAL' && 'Portal: Clique em duas casas vazias para criar o atalho.'}
            {selectedSpellType === 'STEALTH_TRAP' && 'Mina Oculta: Clique em uma casa vazia para plantar.'}
            {selectedSpellType === 'INVISIBILITY' && 'Invisibilidade: Clique em uma peça aliada para ocultá-la por 2 turnos.'}
            {selectedSpellType === 'MIRROR_SHIELD' && 'Escudo Espelhado: Clique em uma peça aliada para protegê-la por 3 turnos.'}
            {selectedSpellType === 'RESURRECTION' && 'Ressurreição: Clique em uma casa livre da sua primeira fileira para reviver uma peça.'}
            {atomicBlastArea && !selectedSpellType && !selectedDropPiece && !duckPlacementActive && 'Detonação Atômica Iminente: Capturar detonará atacante, vítima e peças vizinhas!'}
            {hasForcedCaptures && !selectedSpellType && !selectedDropPiece && !duckPlacementActive && !atomicBlastArea && 'Antichess: Captura obrigatória disponível. Mova uma das peças de combate destacadas.'}
          </span>
          {onCancelAction && !duckPlacementActive && (
            <button
              type="button"
              id="btn-board-cancel-action"
              data-testid="btn-board-cancel-action"
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
                fontWeight: 800,
                pointerEvents: 'auto',
              }}
            >
              Cancelar (Esc)
            </button>
          )}
        </div>
      )}
      <div
        data-testid="chess-board"
        data-variant-theme={variantTheme.themeId}
        className="chess-board-grid"
        style={{
          display: 'grid',
          width: '100%',
          height: '100%',
          aspectRatio: `${effectiveWidth} / ${effectiveHeight}`,
          gridTemplateColumns: `repeat(${effectiveWidth}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${effectiveHeight}, minmax(0, 1fr))`,
          position: 'relative',
          userSelect: 'none',
        }}
      >
        {derivedBoard.map((row, rowIndex) =>
          row.map((piece, columnIndex) => {
            const gameY = isFlipped ? rowIndex : effectiveHeight - 1 - rowIndex;
            const gameX = isFlipped ? effectiveWidth - 1 - columnIndex : columnIndex;
            const coordKey = isCubic
              ? asCoordinateKey(`${selectedFace}:${gameX},${gameY}`)
              : asCoordinateKey(`${gameX},${gameY}`);
          const entityId = domain.occupancy[coordKey];
          const rawEntity = entityId ? domain.boardEntities[entityId] : undefined;
          const pieceEntity = rawEntity?.type === 'PIECE' ? (rawEntity as IPieceEntity) : undefined;
          const isSelected = Boolean(ui.selectedPieceId && entityId === ui.selectedPieceId);

          const specialZone = VariantMapConfig.getSquareZone(domain.variantId, gameX, gameY, effectiveWidth);
          const isVoid = specialZone === 'VOID';

          const legalMoveInfo = legalMovesMap.get(coordKey);
          const isMoveDestination = legalMoveInfo !== undefined && !legalMoveInfo;
          const isCaptureDestination = legalMoveInfo !== undefined && legalMoveInfo;
          const isForcedCapture = Boolean(entityId && forcedCapturePieceIds.has(entityId));
          const isHillVictoryMove = Boolean(
            isMoveDestination &&
            specialZone === 'HILL_SANCTUARY' &&
            domain.variantId?.toUpperCase().includes('HILL') &&
            ui.selectedPieceId &&
            (domain.boardEntities[ui.selectedPieceId] as IPieceEntity | undefined)?.variantId?.toUpperCase() === 'KING'
          );

          const isCheckKingError = invalidMoveFeedback?.kingCoord === coordKey;
          const isCheckSourceError = invalidMoveFeedback?.sourceCoord === coordKey;
          const isCheckTargetError = invalidMoveFeedback?.targetCoord === coordKey;

          const isLastMove = Boolean(
            activeLastMove &&
            (coordKey === activeLastMove.from || coordKey === activeLastMove.to)
          );
          const isCheckWarning = Boolean(
            !domain.isGameOver &&
            pieceEntity &&
            pieceEntity.ownerId === domain.activePlayer &&
            pieceEntity.variantId?.toUpperCase() === 'KING' &&
            CheckValidator.isRoyalInCheck(domain.activePlayer, domain, topology)
          );

          const rankLabel =
            !isVoid && preferences.showCoordinates && columnIndex === 0
              ? String(gameY + 1)
              : undefined;
          const fileLabel =
            !isVoid && preferences.showCoordinates && rowIndex === effectiveHeight - 1
              ? String.fromCharCode(97 + gameX)
              : undefined;

          const isRovingActive =
            activeVisualCoord.col === columnIndex && activeVisualCoord.row === rowIndex;

          const isFrozenSquare =
            Boolean(frozenCoordinates?.includes(coordKey)) ||
            Boolean(pieceEntity?.metadata?.isFrozen);

          // Calculate interactive hover preview
          let hoverPreview: import('../../Interfaces/Interfaces').IHoverPreviewInfo | null = null;
          const isDirectHover = hoveredCoord === coordKey || hoveredCoord === `${gameX},${gameY}`;

          if (selectedSpellType === 'FREEZE') {
            if (freezeBlastArea?.coords.has(`${gameX},${gameY}`)) {
              hoverPreview = {
                type: 'FREEZE',
                isCenter: freezeBlastArea.center === `${gameX},${gameY}`,
                isValid: true,
              };
            }
          } else if (atomicBlastArea?.coords.has(`${gameX},${gameY}`)) {
            const isCenter = atomicBlastArea.center === `${gameX},${gameY}`;
            const targetPieceEntity = entityId ? (domain.boardEntities[entityId] as IPieceEntity | undefined) : undefined;
            const isPawnImmune = !isCenter && targetPieceEntity?.variantId?.toUpperCase() === 'PAWN';
            hoverPreview = {
              type: isCenter ? 'ATOMIC_EPICENTER' : isPawnImmune ? 'ATOMIC_IMMUNE' : 'ATOMIC_BLAST',
              isCenter,
              isValid: !isPawnImmune,
            };
          } else if (isDirectHover) {
            if (selectedSpellType === 'JUMP') {
              const hasPiece = Boolean(pieceEntity);
              hoverPreview = {
                type: 'JUMP',
                isValid: hasPiece,
              };
            } else if (duckPlacementActive) {
              const isEmpty = !entityId && !isVoid;
              hoverPreview = {
                type: 'DUCK',
                isValid: isEmpty,
              };
            } else if (selectedDropPiece) {
              const isEmpty = !entityId && !isVoid;
              const basePiece = chessPieces[selectedDropPiece.toLowerCase()] ?? { symbol: selectedDropPiece[0] };
              hoverPreview = {
                type: 'DROP',
                isValid: isEmpty,
                symbol: basePiece.symbol,
              };
            } else if (selectedSpellType === 'PORTAL') {
              const isEmpty = !entityId && !isVoid;
              hoverPreview = {
                type: 'PORTAL',
                isValid: isEmpty,
              };
            } else if (selectedSpellType === 'STEALTH_TRAP') {
              const isEmpty = !entityId && !isVoid;
              hoverPreview = {
                type: 'TRAP',
                isValid: isEmpty,
              };
            } else if (selectedSpellType === 'INVISIBILITY') {
              const isFriendly = Boolean(pieceEntity && pieceEntity.ownerId === domain.activePlayer);
              hoverPreview = {
                type: 'INVISIBILITY',
                isValid: isFriendly,
              };
            } else if (selectedSpellType === 'MIRROR_SHIELD') {
              const isFriendly = Boolean(pieceEntity && pieceEntity.ownerId === domain.activePlayer);
              hoverPreview = {
                type: 'SHIELD',
                isValid: isFriendly,
              };
            } else if (selectedSpellType === 'RESURRECTION') {
              const backRank = domain.activePlayer === 'P1' ? 0 : 7;
              const isBackRankEmpty = gameY === backRank && !entityId && !isVoid;
              hoverPreview = {
                type: 'RESURRECTION',
                isValid: isBackRankEmpty,
              };
            }
          }

          let isExploding = false;
          let isExplosionCenter = false;
          if (activeExplosion) {
            let centerStr = activeExplosion.center;
            if (centerStr.includes(':')) centerStr = centerStr.split(':')[1];
            const [cx, cy] = centerStr.split(',').map((v) => parseInt(v, 10));
            if (!isNaN(cx) && !isNaN(cy)) {
              if (Math.abs(gameX - cx) <= activeExplosion.radius && Math.abs(gameY - cy) <= activeExplosion.radius) {
                isExploding = true;
              }
              if (gameX === cx && gameY === cy) {
                isExplosionCenter = true;
              }
            }
          }

          return (
            <BoardSquare
              key={`${columnIndex}-${rowIndex}`}
              testId={`square-${gameX},${gameY}`}
              piece={piece}
              pieceOwnerId={pieceEntity?.ownerId}
              boardDisplay={derivedBoard}
              squareInfo={{
                row: rowIndex,
                column: columnIndex,
                gameX,
                gameY,
                squareID: `${columnIndex}-${rowIndex}`,
                name: `${piece.name}${rowIndex}`,
              }}
              backgroundColor={getSquareBackground(gameX, gameY)}
              isSelected={isSelected}
              handleClick={handleSquareClick}
              isMoveDestination={isMoveDestination}
              isCaptureDestination={isCaptureDestination}
              isForcedCapture={isForcedCapture}
              isHillVictoryMove={isHillVictoryMove}
              isCheckKingError={isCheckKingError}
              isCheckSourceError={isCheckSourceError}
              isCheckTargetError={isCheckTargetError}
              isLastMove={isLastMove}
              isCheckWarning={isCheckWarning}
              isExploding={isExploding}
              isExplosionCenter={isExplosionCenter}
              hasDuck={Boolean(duckCoordinate) && duckCoordinate === coordKey}
              isFrozen={isFrozenSquare}
              isVoid={isVoid}
              specialZone={specialZone}
              hasPortal={portalCoordSet.has(coordKey)}
              hasTrap={Boolean(stealthTraps && stealthTraps[coordKey])}
              hasJump={Boolean(pieceEntity?.metadata?.hasJump)}
              isShielded={Boolean(pieceEntity?.metadata?.isShielded)}
              isInvisible={Boolean(pieceEntity?.metadata?.isInvisible)}
              isArcaneSkin={isSpellVariant}
              rankLabel={rankLabel}
              fileLabel={fileLabel}
              tabIndex={isRovingActive ? 0 : -1}
              onFocusSquare={handleFocusSquare}
              hoverPreview={hoverPreview}
              onMouseEnter={() => setHoveredCoord(coordKey)}
              onMouseLeave={() => setHoveredCoord(null)}
            />
          );
        })
      )}
      </div>
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

export default ChessBoard;
