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
}) => {
  const { pieceSet } = useTheme();
  const isPiecePresent = Boolean(piece && piece.name && piece.name !== 'none');

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