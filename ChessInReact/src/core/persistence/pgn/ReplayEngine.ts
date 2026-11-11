import { asCoordinateKey, asEntityId } from '../../coordinates';
import { IDomainState } from '../../state/gameState';
import { createDefaultDomainState } from '../../state/initialState';
import { createStandardChessPieces } from '../../bootstrap/GameInitializer';
import { MovePieceCommand } from '../../commands/MovePieceCommand';
import { IParsedPGNMatch } from './PGNParser';
import { IPieceEntity } from '../../entities/types';

/**
 * Spec 09 § 8 & RF-03: Event Sourcing Deterministic Replay Engine.
 * Compiles a PGN move stream into an array of sequential state snapshots,
 * allowing instantaneous O(1) state random access, time scrubbing, and 60 FPS replay playback.
 */
export class ReplayEngine {
  private readonly statesList: IDomainState[] = [];
  private currentIndex = 0;

  constructor(public readonly pgnMatch: IParsedPGNMatch, initialDomain?: IDomainState) {
    this.compile(initialDomain);
  }

  /**
   * Initializes frame 0 with standard or provided pieces.
   */
  private createInitialState(customDomain?: IDomainState): IDomainState {
    if (customDomain) {
      return JSON.parse(JSON.stringify(customDomain));
    }

    const base = createDefaultDomainState('replay_match', 'classic_square');
    const domain: IDomainState = {
      ...base,
      turnState: {
        ...base.turnState,
        phase: 'COMMIT',
      },
      boardEntities: {},
      occupancy: {},
    };

    const pieces = createStandardChessPieces();
    pieces.forEach((piece) => {
      domain.boardEntities[piece.id] = piece;
      if (piece.position) {
        domain.occupancy[piece.position] = piece.id;
      }
    });

    return domain;
  }

  /**
   * Evaluates the move stream sequentially and caches each state snapshot.
   */
  private compile(customDomain?: IDomainState): void {
    let currentState = this.createInitialState(customDomain);
    this.statesList.push(currentState);

    for (let i = 0; i < this.pgnMatch.moves.length; i++) {
      const move = this.pgnMatch.moves[i];
      let from = move.fromCoord;
      const to = move.toCoord;

      if (!to) continue;

      // If fromCoord is missing from algebraic notation, resolve source piece in currentState
      if (!from) {
        from = this.inferFromCoord(currentState, to, move.isWhite);
      }

      if (!from) continue;

      const pieceId = currentState.occupancy[asCoordinateKey(from)];
      if (!pieceId) continue;

      const actingPlayer = move.isWhite ? 'P1' : 'P2';
      const command = new MovePieceCommand(
        asEntityId(pieceId),
        asCoordinateKey(from),
        asCoordinateKey(to),
        actingPlayer,
        `replay_cmd_${i}`,
        true,
        false
      );

      const nextState: IDomainState = JSON.parse(JSON.stringify(currentState));
      command.execute(nextState);
      currentState = nextState;
      this.statesList.push(currentState);
    }
  }

  /**
   * Infers the source square coordinate from the target coordinate and active player.
   */
  private inferFromCoord(state: IDomainState, toCoord: string, isWhite: boolean): string | undefined {
    const owner = isWhite ? 'P1' : 'P2';
    const pieces = Object.values(state.boardEntities).filter(
      (e): e is IPieceEntity =>
        e.type === 'PIECE' && !e.isCaptured && e.ownerId === owner && e.position !== undefined
    );

    // Simple forward pawn / linear heuristic for replay tolerance
    const toParts = toCoord.split(',');
    const tx = parseInt(toParts[0], 10);
    const ty = parseInt(toParts[1], 10);

    for (const piece of pieces) {
      if (!piece.position) continue;
      const [px, py] = piece.position.split(',').map((n) => parseInt(n, 10));

      if (piece.variantId?.includes('PAWN') && px === tx) {
        if (isWhite && py < ty) return piece.position;
        if (!isWhite && py > ty) return piece.position;
      }
    }

    return pieces[0]?.position;
  }

  /**
   * O(1) Instantaneous random access to any state frame in history.
   */
  public getStateAtTurn(turnIndex: number): IDomainState {
    const clamped = Math.max(0, Math.min(turnIndex, this.statesList.length - 1));
    return this.statesList[clamped];
  }

  public getCurrentState(): IDomainState {
    return this.statesList[this.currentIndex];
  }

  public getCurrentIndex(): number {
    return this.currentIndex;
  }

  public getTotalStates(): number {
    return this.statesList.length;
  }

  public seek(index: number): IDomainState {
    this.currentIndex = Math.max(0, Math.min(index, this.statesList.length - 1));
    return this.getCurrentState();
  }

  public stepForward(): IDomainState {
    if (this.currentIndex < this.statesList.length - 1) {
      this.currentIndex++;
    }
    return this.getCurrentState();
  }

  public stepBackward(): IDomainState {
    if (this.currentIndex > 0) {
      this.currentIndex--;
    }
    return this.getCurrentState();
  }
}
