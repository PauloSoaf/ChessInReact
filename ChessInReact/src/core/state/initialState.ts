import { IDomainState, IPresentationUIState } from './gameState';

export function createDefaultDomainState(matchId = 'local_sandbox', variantId = 'classic_square'): IDomainState {
  return {
    matchId,
    variantId,
    isGameOver: false,
    winnerId: null,
    activePlayer: 'P1',
    turnNumber: 1,
    revision: 0,
    boardEntities: {},
    occupancy: {},
    capturedInventory: {
      P1: [],
      P2: [],
      P3: [],
      P4: [],
      P5: [],
      P6: [],
      P7: [],
      P8: [],
      NONE: [],
    },
    turnState: {
      phase: 'WAITING',
      lastActionTimestamp: Date.now(),
      enPassantTarget: null,
      fiftyMoveCounter: 0,
    },
  };
}

export function createDefaultUIState(): IPresentationUIState {
  return {
    selectedPieceId: null,
    highlightedCoords: [],
    hoveredCoord: null,
    visibilityWindow: {
      qMin: -50,
      qMax: 50,
      rMin: -50,
      rMax: 50,
    },
  };
}
