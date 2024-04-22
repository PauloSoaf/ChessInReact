import React, { useState } from 'react';
import { IBoardSquare } from '../../Interfaces/Interfaces';

const BoardSquare: React.FC<IBoardSquare> = ({piece, backgroundColor, handleClick, squareID, isSelected, name}) => {

  return (
    <div
      style={{
        backgroundColor: `${backgroundColor}`,
        fontSize: '3.4em',
        justifyContent: 'center',
        alignItems: 'center',
        display: 'flex',
        color: piece.color,
        width: '100%',
        border: `${isSelected ? '1px solid white' : 'none'}`,
      }}
      onClick={() => handleClick(squareID, piece)}
    >
      {piece?.symbol}
    </div>
  );
};

export default BoardSquare;