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
}) => {
  const { pieceSet, activeBoardColors } = useTheme();
  const isPiecePresent = Boolean(piece && piece.name && piece.name !== 'none');

  const coordLabelColor =
    backgroundColor === activeBoardColors.darkSquare
      ? activeBoardColors.lightSquare
      : activeBoardColors.darkSquare;

  return (
    <div
      data-testid={testId}
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
        boxShadow: isSelected ? 'inset 0 0 0 2px var(--color-accent, #38bdf8)' : 'none',
        cursor: 'pointer',
        position: 'relative',
        userSelect: 'none',
        transition: 'background-color 150ms ease, box-shadow 150ms ease',
      }}
      onClick={() => handleClick(squareInfo, piece)}
    >
      {/* Coordinate Labels (Rank along left, File along bottom) */}
      {rankLabel && (
        <span
          data-testid="coordinate-rank"
          style={{
            position: 'absolute',
            top: '2px',
            left: '3px',
            fontSize: '0.625rem',
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
            bottom: '2px',
            right: '3px',
            fontSize: '0.625rem',
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
            boxShadow: '0 0 4px rgba(0,0,0,0.25)',
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
            borderRadius: 'var(--radius-sm, 4px)',
            border: `3px solid ${activeBoardColors.captureSquare}`,
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            pointerEvents: 'none',
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