import React from 'react';
import { IBoardSquare } from '../../Interfaces/Interfaces';
import { useTheme } from '../../ui/theme/ThemeContext';
import { PieceRenderer } from '../../ui/components/pieces/PieceRenderer';

const BoardSquare: React.FC<IBoardSquare> = ({
  piece,
  backgroundColor,
  handleClick,
  squareInfo,
  isSelected,
  boardDisplay,
  testId,
  isMoveDestination,
  isCaptureDestination,
  rankLabel,
  fileLabel,
  tabIndex,
  onFocusSquare,
}) => {
  const { pieceSet, activeBoardColors } = useTheme();
  const isPiecePresent = Boolean(piece && piece.name && piece.name !== 'none');

  const coordLabelColor =
    backgroundColor === activeBoardColors.darkSquare
      ? activeBoardColors.lightSquare
      : activeBoardColors.darkSquare;

  // Compute accessible algebraic notation (e.g. "Casa e4, Peão Branco")
  const effX = squareInfo.gameX ?? squareInfo.column;
  const effY = squareInfo.gameY ?? squareInfo.row;
  const colLetter = String.fromCharCode(97 + effX);
  const rowNumber = effY + 1;
  const coordAlgebraic = `${colLetter}${rowNumber}`;

  const pieceLabelMap: Record<string, string> = {
    PAWN: 'Peão',
    ROOK: 'Torre',
    KNIGHT: 'Cavalo',
    BISHOP: 'Bispo',
    QUEEN: 'Rainha',
    KING: 'Rei',
  };

  const piecePtName = isPiecePresent
    ? `${pieceLabelMap[piece.name.toUpperCase()] ?? piece.name} ${piece.color === 'white' ? 'Branco' : 'Preto'}`
    : 'vazia';

  const statusSuffix = isCaptureDestination
    ? ', captura legal disponível'
    : isMoveDestination
    ? ', movimento legal disponível'
    : isSelected
    ? ', selecionada'
    : '';

  const accessibleLabel = `Casa ${coordAlgebraic}, ${piecePtName}${statusSuffix}`;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick(squareInfo, piece);
      return;
    }

    // Arrow Key Navigation (WAI-ARIA Roving Navigation)
    let dCol = 0;
    let dRow = 0;
    const boardSize = boardDisplay.length;

    if (e.key === 'ArrowLeft') dCol = -1;
    else if (e.key === 'ArrowRight') dCol = 1;
    else if (e.key === 'ArrowUp') dRow = -1;
    else if (e.key === 'ArrowDown') dRow = 1;
    else if (e.key === 'Home') {
      e.preventDefault();
      const targetCol = 0;
      onFocusSquare?.(targetCol, squareInfo.row);
      const nextSquare = document.querySelector<HTMLElement>(
        `[data-square-col="${targetCol}"][data-square-row="${squareInfo.row}"]`
      );
      nextSquare?.focus();
      return;
    } else if (e.key === 'End') {
      e.preventDefault();
      const targetCol = boardSize - 1;
      onFocusSquare?.(targetCol, squareInfo.row);
      const nextSquare = document.querySelector<HTMLElement>(
        `[data-square-col="${targetCol}"][data-square-row="${squareInfo.row}"]`
      );
      nextSquare?.focus();
      return;
    }

    if (dCol !== 0 || dRow !== 0) {
      e.preventDefault();
      const targetCol = Math.max(0, Math.min(boardSize - 1, squareInfo.column + dCol));
      const targetRow = Math.max(0, Math.min(boardSize - 1, squareInfo.row + dRow));
      onFocusSquare?.(targetCol, targetRow);
      const nextSquare = document.querySelector<HTMLElement>(
        `[data-square-col="${targetCol}"][data-square-row="${targetRow}"]`
      );
      nextSquare?.focus();
    }
  };

  return (
    <div
      role="button"
      tabIndex={tabIndex ?? 0}
      aria-label={accessibleLabel}
      aria-pressed={isSelected}
      data-testid={testId}
      data-square-col={squareInfo.column}
      data-square-row={squareInfo.row}
      onFocus={() => onFocusSquare?.(squareInfo.column, squareInfo.row)}
      className="board-square"
      style={{
        backgroundColor: isSelected ? activeBoardColors.selectedSquare : `${backgroundColor}`,
        fontSize: `${boardDisplay.length < 12 ? '175%' : 185 - boardDisplay.length * 5 + '%'}`,
        justifyContent: 'center',
        alignItems: 'center',
        display: 'flex',
        color: piece.color,
        aspectRatio: '1 / 1',
        width: '100%',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
        boxShadow: isSelected
          ? 'inset 0 0 0 2.5px var(--border-active, #C4A77D)'
          : 'inset 0 0 0 0.5px rgba(0, 0, 0, 0.06)',
        cursor: 'pointer',
        position: 'relative',
        userSelect: 'none',
        transition: 'background-color 140ms ease, box-shadow 140ms ease',
      }}
      onClick={() => handleClick(squareInfo, piece)}
      onKeyDown={handleKeyDown}
    >
      {/* Coordinate Labels (Rank along left, File along bottom) */}
      {rankLabel && (
        <span
          data-testid="coordinate-rank"
          style={{
            position: 'absolute',
            top: '3px',
            left: '5px',
            fontSize: '0.6875rem',
            fontFamily: 'var(--font-mono)',
            fontWeight: 800,
            color: coordLabelColor,
            opacity: 0.88,
            pointerEvents: 'none',
            lineHeight: 1,
          }}
        >
          {rankLabel}
        </span>
      )}

      {fileLabel && (
        <span
          data-testid="coordinate-file"
          style={{
            position: 'absolute',
            bottom: '3px',
            right: '5px',
            fontSize: '0.6875rem',
            fontFamily: 'var(--font-mono)',
            fontWeight: 800,
            color: coordLabelColor,
            opacity: 0.88,
            pointerEvents: 'none',
            lineHeight: 1,
          }}
        >
          {fileLabel}
        </span>
      )}

      {/* Legal Move Destination Indicator (Empty square dot) */}
      {isMoveDestination && (
        <div
          data-testid="legal-move-dot"
          style={{
            position: 'absolute',
            width: '28%',
            height: '28%',
            borderRadius: '50%',
            backgroundColor: activeBoardColors.legalMoveDot,
            pointerEvents: 'none',
            boxShadow: '0 0 8px rgba(0,0,0,0.32), inset 0 1px 1px rgba(255,255,255,0.28)',
          }}
        />
      )}

      {/* Legal Capture Indicator (Occupied square ring) */}
      {isCaptureDestination && (
        <div
          data-testid="legal-capture-ring"
          style={{
            position: 'absolute',
            inset: '4px',
            borderRadius: '50%',
            border: `3px solid ${activeBoardColors.captureSquare}`,
            backgroundColor: 'rgba(239, 68, 68, 0.14)',
            pointerEvents: 'none',
            boxShadow: 'inset 0 0 10px rgba(239, 68, 68, 0.35)',
          }}
        />
      )}

      {/* Chess Piece */}
      {isPiecePresent ? (
        <PieceRenderer
          variantId={piece.name}
          ownerId={piece.color === 'white' ? 'P1' : 'P2'}
          pieceSet={pieceSet}
        />
      ) : null}
    </div>
  );
};

export default BoardSquare;
