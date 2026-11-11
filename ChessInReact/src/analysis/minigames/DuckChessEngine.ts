/**
 * ChessInReact - Duck Chess Engine (Spec 12 § 5.2, § 8 RF-08)
 *
 * Implements canonical Duck Chess mechanics:
 * 1. Two-phase turn progression:
 *    - Phase 1 (PIECE_MOVE): Player executes a legal move with one of their pieces.
 *    - Phase 2 (PLACE_DUCK): Player MUST move the rubber duck to any unoccupied square.
 * 2. Absolute Blocker:
 *    - The duck cannot be captured.
 *    - Pieces cannot move to or pass through the duck's coordinate.
 * 3. Physical King Capture:
 *    - There is NO check or checkmate.
 *    - The king is captured physically like any other piece to declare victory.
 */

export type DuckTurnPhase = 'PIECE_MOVE' | 'PLACE_DUCK' | 'TURN_COMPLETED';

export interface IDuckChessState {
  readonly activePlayer: 'WHITE' | 'BLACK';
  readonly duckCoordinate: string | null;
  readonly currentPhase: DuckTurnPhase;
  readonly lastPieceMove: {
    readonly from: string;
    readonly to: string;
    readonly pieceId: string;
  } | null;
  readonly isGameOver: boolean;
  readonly winner: 'WHITE' | 'BLACK' | null;
  readonly fullmoveNumber: number;
}

export class DuckChessEngine {
  /**
   * Initializes Duck Chess match state according to Spec 12 § 5.2.
   * Board starts with White active, no duck placed yet (placed on turn 1 after White's first move).
   */
  public static createInitialState(): IDuckChessState {
    return {
      activePlayer: 'WHITE',
      duckCoordinate: null,
      currentPhase: 'PIECE_MOVE',
      lastPieceMove: null,
      isGameOver: false,
      winner: null,
      fullmoveNumber: 1,
    };
  }

  /**
   * Checks whether the Duck is blocking a specific coordinate.
   */
  public static isDuckBlocking(state: IDuckChessState, coord: string): boolean {
    return state.duckCoordinate !== null && state.duckCoordinate === coord;
  }

  /**
   * Validates if a piece move is allowed with respect to Duck Chess constraints.
   */
  public static canExecutePieceMove(
    state: IDuckChessState,
    _fromCoord: string,
    toCoord: string,
    pathCoords: readonly string[] = []
  ): { allowed: boolean; reason?: string } {
    if (state.isGameOver) {
      return { allowed: false, reason: 'Partida já finalizada por captura física do rei.' };
    }

    if (state.currentPhase !== 'PIECE_MOVE') {
      return { 
        allowed: false, 
        reason: 'Fase atual requer colocação do pato antes de mover outra peça.' 
      };
    }

    // Duck cannot be captured
    if (this.isDuckBlocking(state, toCoord)) {
      return { allowed: false, reason: 'O Pato de borracha é neutro e intransponível: não pode ser capturado.' };
    }

    // Pieces cannot jump or slide through the Duck
    for (const stepCoord of pathCoords) {
      if (this.isDuckBlocking(state, stepCoord)) {
        return { allowed: false, reason: 'Trajetória bloqueada pelo Pato de borracha.' };
      }
    }

    return { allowed: true };
  }

  /**
   * Executes a piece move in Phase 1 (Spec 12 § 5.2).
   * If the opponent's King is captured, ends the match immediately.
   * Otherwise, advances phase to PLACE_DUCK.
   */
  public static executePieceMove(
    state: IDuckChessState,
    move: {
      from: string;
      to: string;
      pieceId: string;
      pathCoords?: readonly string[];
      capturedPieceType?: string; // 'k' or 'king' indicates physical king capture
    }
  ): IDuckChessState {
    const check = this.canExecutePieceMove(state, move.from, move.to, move.pathCoords);
    if (!check.allowed) {
      throw new Error(check.reason);
    }

    const isKingCapture = 
      move.capturedPieceType?.toLowerCase() === 'k' || 
      move.capturedPieceType?.toLowerCase() === 'king';

    if (isKingCapture) {
      return {
        ...state,
        currentPhase: 'TURN_COMPLETED',
        lastPieceMove: { from: move.from, to: move.to, pieceId: move.pieceId },
        isGameOver: true,
        winner: state.activePlayer,
      };
    }

    return {
      ...state,
      currentPhase: 'PLACE_DUCK',
      lastPieceMove: { from: move.from, to: move.to, pieceId: move.pieceId },
    };
  }

  /**
   * Validates if the duck can be moved to the target coordinate (Phase 2).
   */
  public static canPlaceDuck(
    state: IDuckChessState,
    targetCoord: string,
    occupiedCoordinates: ReadonlySet<string>
  ): { allowed: boolean; reason?: string } {
    if (state.isGameOver) {
      return { allowed: false, reason: 'Partida já finalizada.' };
    }

    if (state.currentPhase !== 'PLACE_DUCK') {
      return { allowed: false, reason: 'A fase atual não é de posicionamento do pato.' };
    }

    if (occupiedCoordinates.has(targetCoord)) {
      return { allowed: false, reason: 'O pato só pode ser posicionado em casas completamente desocupadas.' };
    }

    if (state.duckCoordinate === targetCoord) {
      return { allowed: false, reason: 'O pato deve obrigatoriamente se mover para uma casa diferente da atual.' };
    }

    return { allowed: true };
  }

  /**
   * Places the Duck on the board in Phase 2, ending the turn and passing to opponent.
   */
  public static executePlaceDuck(
    state: IDuckChessState,
    targetCoord: string,
    occupiedCoordinates: ReadonlySet<string>
  ): IDuckChessState {
    const check = this.canPlaceDuck(state, targetCoord, occupiedCoordinates);
    if (!check.allowed) {
      throw new Error(check.reason);
    }

    const nextPlayer: 'WHITE' | 'BLACK' = state.activePlayer === 'WHITE' ? 'BLACK' : 'WHITE';
    const nextFullmove = state.activePlayer === 'BLACK' 
      ? state.fullmoveNumber + 1 
      : state.fullmoveNumber;

    return {
      ...state,
      activePlayer: nextPlayer,
      duckCoordinate: targetCoord,
      currentPhase: 'PIECE_MOVE',
      fullmoveNumber: nextFullmove,
    };
  }
}
