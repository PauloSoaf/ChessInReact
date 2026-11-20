import React, { useMemo } from 'react';
import BoardSquare from '../BoardSquare/BoardSquare';
import { IChessPiece, ISquareInfo } from '../../Interfaces/Interfaces';
import { chessPieces } from '../../constants/chessPieces';
import { useGameActions, useGameStore } from '../../bindings/react/useGameStore';
import { asCoordinateKey } from '../../core/coordinates';
import { MovePieceCommand } from '../../core/commands/MovePieceCommand';
import { IPieceEntity } from '../../core/entities/types';
import { SquareTopology } from '../../core/topology/SquareTopology';
import { CubicTopology } from '../../core/topology/CubicTopology';
import { ITopology } from '../../core/topology/types';
import { RulesEngine } from '../../engine/rules/RulesEngine';
import { PlayerId } from '../../core/coordinates/types';
import { useTheme } from '../../ui/theme/ThemeContext';
import { CheckValidator } from '../../engine/rules/CheckValidator';
import { VariantMapConfig } from '../../engine/variants/VariantMapConfig';
import { IInvalidMoveFeedback, ITriggerFeedbackOptions, InvalidMoveReason } from '../../bindings/react/useMoveFeedback';

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
  onHumanPieceMoved,
  onVariantSquareClick,
}) => {
  const { preferences, activeBoardColors } = useTheme();
  const isFlipped = Boolean(preferences.flipBoard);

  const domain = useGameStore((state) => state.domain);
  const ui = useGameStore((state) => state.ui);
  const { executeCommand, selectPiece } = useGameActions();

  // WAI-ARIA Roving Tabindex: store focused square in logical game coordinates (gameX, gameY)
  // Ensures exactly 1 valid tab stop across any boardSize (4x4, 8x8, 16x16) and orientation (flipped).
  const [focusedLogicalCoord, setFocusedLogicalCoord] = React.useState<{ gameX: number; gameY: number }>(() => ({
    gameX: Math.floor(boardSize / 2),
    gameY: Math.min(1, boardSize - 1),
  }));

  // Ensure logical coordinates remain within current board boundaries if boardSize changes
  const validLogicalCoord = useMemo(() => {
    return {
      gameX: Math.max(0, Math.min(boardSize - 1, focusedLogicalCoord.gameX)),
      gameY: Math.max(0, Math.min(boardSize - 1, focusedLogicalCoord.gameY)),
    };
  }, [focusedLogicalCoord, boardSize]);

  // Derive visual (col, row) coordinates reactively from logical coordinates and flip state
  const activeVisualCoord = useMemo(() => {
    return {
      col: isFlipped ? boardSize - 1 - validLogicalCoord.gameX : validLogicalCoord.gameX,
      row: isFlipped ? validLogicalCoord.gameY : boardSize - 1 - validLogicalCoord.gameY,
    };
  }, [validLogicalCoord, isFlipped, boardSize]);

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
          gameX: Math.max(0, Math.min(boardSize - 1, gx)),
          gameY: Math.max(0, Math.min(boardSize - 1, gy)),
        });
      }
    }
  }, [ui.selectedPieceId, domain.boardEntities, boardSize]);

  // When board is flipped or resized while an element inside the board is focused, retain DOM focus on the updated visual square
  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const activeEl = document.activeElement;
    if (activeEl && activeEl.getAttribute('data-square-col') !== null) {
      const nextSquare = document.querySelector<HTMLElement>(
        `[data-square-col="${activeVisualCoord.col}"][data-square-row="${activeVisualCoord.row}"]`
      );
      nextSquare?.focus();
    }
  }, [isFlipped, boardSize, activeVisualCoord.col, activeVisualCoord.row]);

  const handleFocusSquare = (visualCol: number, visualRow: number) => {
    const gx = isFlipped ? boardSize - 1 - visualCol : visualCol;
    const gy = isFlipped ? visualRow : boardSize - 1 - visualRow;
    setFocusedLogicalCoord({
      gameX: Math.max(0, Math.min(boardSize - 1, gx)),
      gameY: Math.max(0, Math.min(boardSize - 1, gy)),
    });
  };

  const topology = useMemo(() => {
    if (propTopology) return propTopology;
    const v = domain.variantId?.toUpperCase() ?? '';
    if (v.includes('CUBIC')) {
      return new CubicTopology({ boardSize });
    }
    if (v.includes('TORUS') || v.includes('TOROIDAL')) {
      return new SquareTopology({ width: boardSize, height: boardSize, toroidal: true });
    }
    if (v.includes('CAPABLANCA')) {
      return new SquareTopology({ width: 10, height: 8 });
    }
    if (v.includes('XIANGQI')) {
      return new SquareTopology({ width: 9, height: 10 });
    }
    if (v.includes('SHOGI')) {
      return new SquareTopology({ width: 9, height: 9 });
    }
    return new SquareTopology({ width: boardSize, height: boardSize });
  }, [propTopology, domain.variantId, boardSize]);

  const effectiveWidth = (topology as { readonly width?: number }).width ?? boardSize;
  const effectiveHeight = (topology as { readonly height?: number }).height ?? boardSize;

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

    for (let rowIndex = 0; rowIndex < boardSize; rowIndex++) {
      const row: IChessPiece[] = [];
      const gameY = isFlipped ? rowIndex : boardSize - 1 - rowIndex;

      for (let colIndex = 0; colIndex < boardSize; colIndex++) {
        const gameX = isFlipped ? boardSize - 1 - colIndex : colIndex;
        const coordKey = isCubic
          ? asCoordinateKey(`${selectedFace}:${gameX},${gameY}`)
          : asCoordinateKey(`${gameX},${gameY}`);
        const entityId = domain.occupancy[coordKey];
        const entity = entityId
          ? (domain.boardEntities[entityId] as IPieceEntity | undefined)
          : undefined;

        if (entity && entity.type === 'PIECE' && !entity.isCaptured) {
          const variantKey = entity.variantId.toLowerCase();
          const base = chessPieces[variantKey] ?? { symbol: '♟', name: variantKey };
          row.push({
            name: entity.variantId,
            symbol: base.symbol,
            color: entity.ownerId === 'P1' ? 'white' : '#ed2fed',
            ownerId: entity.ownerId,
          });
        } else {
          row.push(chessPieces.none);
        }
      }
      grid.push(row);
    }
    return grid;
  }, [domain.occupancy, domain.boardEntities, boardSize, isFlipped, isCubic, selectedFace]);

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
          ? boardSize - 1 - squareInfo.column
          : squareInfo.column;
    const gameY =
      squareInfo.gameY !== undefined
        ? squareInfo.gameY
        : isFlipped
          ? squareInfo.row
          : boardSize - 1 - squareInfo.row;
    const clickedCoord = isCubic
      ? asCoordinateKey(`${selectedFace}:${gameX},${gameY}`)
      : asCoordinateKey(`${gameX},${gameY}`);

    if (VariantMapConfig.isVoidSquare(domain.variantId, gameX, gameY, boardSize)) {
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

    // Dispatch MovePieceCommand through Core State Store with full rules validation
    try {
      onClearInvalidMove?.();
      const promotionVariant = matchedMove.isPromotion ? 'QUEEN' : undefined;
      const moveCmd = new MovePieceCommand(
        activeSelected.id,
        activeSelected.position,
        clickedCoord,
        domain.activePlayer,
        undefined,
        true,
        true,
        promotionVariant,
        topology
      );
      executeCommand(moveCmd);
      onHumanPieceMoved?.(activeSelected.position, clickedCoord, activeSelected.id);
    } catch (err) {
      console.warn('[RulesEngine] Move rejected by Core invariants / Rules Engine:', err);
    } finally {
      selectPiece(null);
    }
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
      {/* Interactive Action Indicator Bar with explicit Cancel button */}
      {(selectedSpellType || selectedDropPiece || duckPlacementActive) && (
        <div
          data-testid="board-action-indicator"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '5px 12px',
            marginBottom: '6px',
            borderRadius: 'var(--radius-sm, 6px)',
            backgroundColor: selectedSpellType === 'FREEZE'
              ? 'rgba(6, 182, 212, 0.22)'
              : selectedSpellType === 'JUMP'
              ? 'rgba(168, 85, 247, 0.22)'
              : duckPlacementActive
              ? 'rgba(234, 179, 8, 0.22)'
              : 'rgba(16, 185, 129, 0.22)',
            border: selectedSpellType === 'FREEZE'
              ? '1.5px solid #06b6d4'
              : selectedSpellType === 'JUMP'
              ? '1.5px solid #a855f7'
              : duckPlacementActive
              ? '1.5px solid #eab308'
              : '1.5px solid #10b981',
            fontSize: '0.78rem',
            fontWeight: 700,
            color: 'var(--text-prominent, #fff)',
          }}
        >
          <span>
            {selectedSpellType === 'FREEZE' && '❄️ Modo Congelamento: Passe o mouse para ver a área 3×3 e clique para congelar.'}
            {selectedSpellType === 'JUMP' && '⚡ Conceder Salto: Passe o mouse sobre uma peça aliada e clique.'}
            {duckPlacementActive && '🦆 Colocar Pato: Passe o mouse sobre uma casa vazia e clique para posicionar.'}
            {selectedDropPiece && `♟ Drop de ${selectedDropPiece}: Passe o mouse sobre uma casa vazia e clique.`}
            {selectedSpellType === 'PORTAL' && '🌀 Portal: Clique em duas casas vazias para criar o atalho.'}
            {selectedSpellType === 'STEALTH_TRAP' && '💣 Mina Oculta: Clique em uma casa vazia para plantar.'}
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
              }}
            >
              ✕ Cancelar (Esc)
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

          const specialZone = VariantMapConfig.getSquareZone(domain.variantId, gameX, gameY, boardSize);
          const isVoid = specialZone === 'VOID';

          const legalMoveInfo = legalMovesMap.get(coordKey);
          const isMoveDestination = legalMoveInfo !== undefined && !legalMoveInfo;
          const isCaptureDestination = legalMoveInfo !== undefined && legalMoveInfo;

          const isCheckKingError = invalidMoveFeedback?.kingCoord === coordKey;
          const isCheckSourceError = invalidMoveFeedback?.sourceCoord === coordKey;
          const isCheckTargetError = invalidMoveFeedback?.targetCoord === coordKey;

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
          } else if (isDirectHover) {
            if (selectedSpellType === 'JUMP') {
              const isFriendly = Boolean(pieceEntity && pieceEntity.ownerId === domain.activePlayer);
              hoverPreview = {
                type: 'JUMP',
                isValid: isFriendly,
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
            }
          }

          return (
            <BoardSquare
              key={`${columnIndex}-${rowIndex}`}
              testId={`square-${gameX},${gameY}`}
              piece={piece}
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
              isCheckKingError={isCheckKingError}
              isCheckSourceError={isCheckSourceError}
              isCheckTargetError={isCheckTargetError}
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
    </div>
  );
};

export default ChessBoard;
