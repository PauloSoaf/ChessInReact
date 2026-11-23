// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BoardSquare from '../../../../components/BoardSquare/BoardSquare';
import { ReserveDropsBar } from '../ReserveDropsBar';
import { globalAudioSynthesizer } from '../../../../audio/WebAudioSynthesizer';
import { IPieceEntity } from '../../../../core/entities/types';
import { chessPieces } from '../../../../constants/chessPieces';
import { asCoordinateKey, asEntityId } from '../../../../core/coordinates';

describe('Minigame & Variant Capricho Polish Suite (Spec 06, Spec 13, Spec 12)', () => {
  it('1. BoardSquare renders antichess-forced-capture-beacon when isForcedCapture is true', () => {
    const dummySquareInfo = {
      row: 4,
      column: 4,
      squareID: '4-4',
      gameX: 4,
      gameY: 3,
    };

    render(
      <BoardSquare
        testId="square-e4"
        piece={{ symbol: '♟', name: 'pawn', color: 'white' }}
        boardDisplay={[]}
        squareInfo={dummySquareInfo}
        handleClick={() => {}}
        isForcedCapture={true}
      />
    );

    const beacon = screen.getByTestId('antichess-forced-capture-beacon');
    expect(beacon).toBeDefined();
    expect(beacon.querySelector('svg')).toBeDefined();

    const squareEl = screen.getByTestId('square-e4');
    expect(squareEl.getAttribute('aria-label')).toContain('CAPTURA OBRIGATÓRIA (Antichess)');
  });

  it('2. BoardSquare renders golden crown badge on legal-move-dot when isHillVictoryMove is true', () => {
    const dummySquareInfo = {
      row: 4,
      column: 4,
      squareID: '4-4',
      gameX: 4,
      gameY: 4,
    };

    render(
      <BoardSquare
        testId="square-e5"
        piece={chessPieces.none}
        boardDisplay={[]}
        squareInfo={dummySquareInfo}
        handleClick={() => {}}
        isMoveDestination={true}
        isHillVictoryMove={true}
      />
    );

    const dot = screen.getByTestId('legal-move-dot');
    expect(dot).toBeDefined();
    expect(dot.querySelector('svg')).toBeDefined();

    const squareEl = screen.getByTestId('square-e5');
    expect(squareEl.getAttribute('aria-label')).toContain('LANCE DE VITÓRIA DA COLINA!');
  });

  it('3. ReserveDropsBar handles numerical hotkeys (1, 2) to select drop pieces', () => {
    const onSelectDropPiece = vi.fn();
    const reservePieces: IPieceEntity[] = [
      {
        id: asEntityId('p1'),
        type: 'PIECE',
        ownerId: 'P1',
        position: asCoordinateKey('0,0'),
        variantId: 'PAWN',
        hasMoved: false,
        isCaptured: true,
      },
      {
        id: asEntityId('k1'),
        type: 'PIECE',
        ownerId: 'P1',
        position: asCoordinateKey('0,0'),
        variantId: 'KNIGHT',
        hasMoved: false,
        isCaptured: true,
      },
    ];

    render(
      <ReserveDropsBar
        activePlayer="P1"
        reservePieces={reservePieces}
        selectedPieceVariant={null}
        onSelectDropPiece={onSelectDropPiece}
        playerLabel="Brancas"
      />
    );

    const kbd1 = screen.getByTestId('drop-kbd-pawn');
    const kbd2 = screen.getByTestId('drop-kbd-knight');
    expect(kbd1.textContent).toBe('1');
    expect(kbd2.textContent).toBe('2');

    // Press '1'
    fireEvent.keyDown(window, { key: '1' });
    expect(onSelectDropPiece).toHaveBeenCalledWith('PAWN');

    // Press '2'
    fireEvent.keyDown(window, { key: '2' });
    expect(onSelectDropPiece).toHaveBeenCalledWith('KNIGHT');
  });

  it('4. WebAudioSynthesizer executes playVictoryFanfare safely', () => {
    expect(() => {
      globalAudioSynthesizer.playVictoryFanfare();
    }).not.toThrow();
  });
});
