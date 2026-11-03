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

  const pieceNameMap: Record<string, string> = {
    PAWN: 'Peão',
    KNIGHT: 'Cavalo',
    BISHOP: 'Bispo',
    ROOK: 'Torre',
    QUEEN: 'Dama',
    KING: 'Rei',
  };

  const friendlyPieceName = pieceNameMap[piece.name.toUpperCase()] ?? piece.name;
  const friendlyColor = piece.color === 'white' ? 'Branco' : 'Preto';
  const pieceDescription = isPiecePresent ? `${friendlyPieceName} ${friendlyColor}` : 'Vazia';

  const accessibleLabel = `Casa ${coordAlgebraic}, ${pieceDescription}${isSelected ? ' (selecionada)' : ''}${
    isMoveDestination ? ' (movimento legal disponível)' : ''
  }${isCaptureDestination ? ' (captura legal disponível)' : ''}`;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick(squareInfo, piece);
      return;
    }

    // Grid Arrow Key Navigation (WAI-ARIA Roving Navigation)
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
        backgroundColor: `${backgroundColor}`,
        fontSize: `${boardDisplay.length < 12 ? '200%' : 200 - boardDisplay.length * 5 + '%'}`,
        justifyContent: 'center',
        alignItems: 'center',
        display: 'flex',
        color: piece.color,
        aspectRatio: 1 / 1,
        width: `${boardDisplay.length < 12 ? '95%' : '100%'}`,
        height: `${boardDisplay.length < 12 ? '95%' : '100%'}`,
        boxShadow: isSelected
          ? 'inset 0 0 0 3px var(--border-active, #C4A77D), 0 0 12px var(--color-accent-glow)'
          : 'none',
        cursor: 'pointer',
        position: 'relative',
        userSelect: 'none',
        transition: 'background-color 150ms ease, box-shadow 150ms ease',
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
            left: '4px',
            fontSize: '0.6875rem',
            fontFamily: 'var(--font-mono)',
            fontWeight: 800,
            color: coordLabelColor,
            opacity: 0.85,
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
            right: '4px',
            fontSize: '0.6875rem',
            fontFamily: 'var(--font-mono)',
            fontWeight: 800,
            color: coordLabelColor,
            opacity: 0.85,
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
            boxShadow: '0 0 6px rgba(0,0,0,0.3)',
          }}
        />
      )}

      {/* Legal Capture Indicator (Occupied square ring) */}
      {isCaptureDestination && (
        <div
          data-testid="legal-capture-ring"
          style={{
            position: 'absolute',
            inset: '3px',
            borderRadius: 'var(--radius-sm, 6px)',
            border: `3px solid ${activeBoardColors.captureSquare}`,
            backgroundColor: 'rgba(168, 66, 66, 0.18)',
            pointerEvents: 'none',
            boxShadow: 'inset 0 0 8px rgba(168, 66, 66, 0.4)',
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