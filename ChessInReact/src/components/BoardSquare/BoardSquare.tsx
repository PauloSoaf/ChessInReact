import { IBoardSquare } from '../../Interfaces/Interfaces';

const BoardSquare: React.FC<IBoardSquare> = ({piece, backgroundColor, handleClick, squareInfo, isSelected, boardDisplay}) => {

  return (
    <div
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
        border: `${isSelected ? '1px solid white' : 'none'}`,
      }}
      onClick={() => handleClick(squareInfo, piece)}
    >
      {piece?.symbol}
    </div>
  );
};

export default BoardSquare;