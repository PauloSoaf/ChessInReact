import { asCoordinateKey, asEntityId } from '../../coordinates';
import { IDomainState } from '../../state/gameState';
import { createDefaultDomainState } from '../../state/initialState';
import { createStandardChessPieces } from '../../bootstrap/GameInitializer';
import { MovePieceCommand } from '../../commands/MovePieceCommand';
import { IParsedPGNMatch, IParsedPGNMove } from './PGNParser';
import { PGNExporter } from './PGNExporter';
import { IPieceEntity } from '../../entities/types';
import { RulesEngine } from '../../../engine/rules/RulesEngine';
import { CheckValidator } from '../../../engine/rules/CheckValidator';
import { SquareTopology } from '../../topology/SquareTopology';

/**
 * Spec 09 § 8 & RF-03: Event Sourcing Deterministic Replay Engine.
 * Compiles a PGN move stream into an array of sequential state snapshots,
 * allowing instantaneous O(1) state random access, time scrubbing, and 60 FPS replay playback.
 * Fully resolves Standard Algebraic Notation (SAN) with disambiguation, castling, and promotions.
 */
export class ReplayEngine {
  private readonly statesList: IDomainState[] = [];
  private readonly defaultTopology = new SquareTopology({ width: 8, height: 8 });
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
      const actingPlayer = move.isWhite ? 'P1' : 'P2';

      // Synchronize activePlayer on currentState if needed
      if (currentState.activePlayer !== actingPlayer) {
        (currentState as { activePlayer: string }).activePlayer = actingPlayer;
      }

      const resolved = this.resolveMove(currentState, move);
      if (!resolved) {
        continue;
      }

      const { pieceId, from, to, promotionVariant, castledRook } = resolved;

      const command = new MovePieceCommand(
        asEntityId(pieceId),
        asCoordinateKey(from),
        asCoordinateKey(to),
        actingPlayer,
        `replay_cmd_${i}`,
        true,
        false, // bypass strict rejection to tolerate legacy / custom PGNs
        promotionVariant,
        this.defaultTopology
      );

      const nextState: IDomainState = JSON.parse(JSON.stringify(currentState));
      command.execute(nextState);

      if (castledRook) {
        const rookCmd = new MovePieceCommand(
          asEntityId(castledRook.pieceId),
          asCoordinateKey(castledRook.from),
          asCoordinateKey(castledRook.to),
          actingPlayer,
          `replay_cmd_${i}_rook`,
          false,
          false,
          undefined,
          this.defaultTopology
        );
        rookCmd.execute(nextState);
      }

      currentState = nextState;
      this.statesList.push(currentState);
    }
  }

  /**
   * Resolves origin, destination, piece ID and promotion from SAN token and legal moves.
   */
  private resolveMove(
    state: IDomainState,
    move: IParsedPGNMove
  ): {
    pieceId: string;
    from: string;
    to: string;
    promotionVariant?: string;
    castledRook?: { pieceId: string; from: string; to: string };
  } | null {
    const actingPlayer = move.isWhite ? 'P1' : 'P2';
    const rawToken = move.token.trim();
    const cleanToken = rawToken.replace(/[+#?!]/g, '').trim();

    // 1. Castling detection (O-O, O-O-O)
    const isKingsideCastle = cleanToken === 'O-O' || cleanToken === '0-0' || cleanToken === 'o-o';
    const isQueensideCastle =
      cleanToken === 'O-O-O' || cleanToken === '0-0-0' || cleanToken === 'o-o-o';

    if (isKingsideCastle || isQueensideCastle) {
      const king = CheckValidator.findRoyalPiece(actingPlayer, state);
      const from = king?.position ?? (actingPlayer === 'P1' ? '4,0' : '4,7');
      const rank = actingPlayer === 'P1' ? 0 : 7;
      const to = isKingsideCastle ? `6,${rank}` : `2,${rank}`;
      const pieceId = king?.id ?? state.occupancy[asCoordinateKey(from)];

      const rookFrom = isKingsideCastle ? `7,${rank}` : `0,${rank}`;
      const rookTo = isKingsideCastle ? `5,${rank}` : `3,${rank}`;
      const rookId = state.occupancy[asCoordinateKey(rookFrom)];

      if (pieceId) {
        return {
          pieceId,
          from,
          to,
          castledRook: rookId ? { pieceId: rookId, from: rookFrom, to: rookTo } : undefined,
        };
      }
    }

    // 2. Promotion detection (=Q, =R, =B, =N or /Q or e8Q)
    let promotionVariant: string | undefined;
    const promoMatch =
      cleanToken.match(/=([QRBN])/i) ||
      cleanToken.match(/\/([QRBN])/i) ||
      cleanToken.match(/[a-h][1-8]([QRBN])$/i);

    if (promoMatch) {
      const char = promoMatch[1].toUpperCase();
      promotionVariant =
        char === 'Q' ? 'QUEEN' : char === 'R' ? 'ROOK' : char === 'B' ? 'BISHOP' : 'KNIGHT';
    }

    const baseToken = cleanToken
      .replace(/=[QRBN]/i, '')
      .replace(/\/([QRBN])/i, '')
      .replace(/([a-h][1-8])[QRBN]$/i, '$1');

    // 3. Target coordinate extraction
    let to = move.toCoord;
    if (!to) {
      const destMatch = baseToken.match(/([a-h][1-8])$/i);
      if (destMatch) {
        to = PGNExporter.algebraicToCoord(destMatch[1]);
      }
    }

    if (!to) return null;

    // 4. Target piece role & disambiguation pattern
    let targetRole = 'PAWN';
    let prefix = baseToken;

    if (['N', 'B', 'R', 'Q', 'K'].includes(baseToken[0])) {
      const roleChar = baseToken[0];
      targetRole =
        roleChar === 'N'
          ? 'KNIGHT'
          : roleChar === 'B'
          ? 'BISHOP'
          : roleChar === 'R'
          ? 'ROOK'
          : roleChar === 'Q'
          ? 'QUEEN'
          : 'KING';
      prefix = baseToken.substring(1);
    }

    prefix = prefix.replace(/x/g, '');
    const disambig = prefix.slice(0, -2); // may be '', 'b', '1', 'h4', 'e', etc.

    // 5. Query legal moves for exact match
    const legalMoves = RulesEngine.getLegalMoves(state, this.defaultTopology);
    const candidateMoves = legalMoves.filter((m) => {
      if (m.to !== to) return false;
      const piece = state.boardEntities[m.pieceId] as IPieceEntity | undefined;
      if (!piece || piece.ownerId !== actingPlayer) return false;
      if (!piece.variantId.toUpperCase().includes(targetRole)) return false;

      if (disambig.length > 0) {
        const fromAlg = PGNExporter.coordToAlgebraic(m.from);
        if (disambig.length === 1) {
          if (disambig >= 'a' && disambig <= 'h') {
            if (fromAlg[0] !== disambig) return false;
          } else if (disambig >= '1' && disambig <= '8') {
            if (fromAlg[1] !== disambig) return false;
          }
        } else if (disambig.length === 2) {
          if (fromAlg !== disambig) return false;
        }
      }

      return true;
    });

    if (candidateMoves.length > 0) {
      const chosen = candidateMoves[0];
      return {
        pieceId: chosen.pieceId,
        from: chosen.from,
        to: chosen.to,
        promotionVariant:
          promotionVariant ?? (chosen.isPromotion ? chosen.promotionOptions?.[0] ?? 'QUEEN' : undefined),
      };
    }

    // 6. Direct coordinate fallback if fromCoord was explicitly in PGN (e.g. e2-e4)
    if (move.fromCoord) {
      const pieceId = state.occupancy[asCoordinateKey(move.fromCoord)];
      if (pieceId) {
        return {
          pieceId,
          from: move.fromCoord,
          to,
          promotionVariant,
        };
      }
    }

    // 7. Heuristic fallback for non-strict or partial moves
    const fromInferred = this.inferFromCoord(state, to, move.isWhite, targetRole, disambig);
    if (fromInferred) {
      const pieceId = state.occupancy[asCoordinateKey(fromInferred)];
      if (pieceId) {
        return {
          pieceId,
          from: fromInferred,
          to,
          promotionVariant,
        };
      }
    }

    return null;
  }

  /**
   * Infers the source square coordinate from the target coordinate and active player.
   */
  private inferFromCoord(
    state: IDomainState,
    toCoord: string,
    isWhite: boolean,
    targetRole?: string,
    disambig?: string
  ): string | undefined {
    const owner = isWhite ? 'P1' : 'P2';
    const pieces = Object.values(state.boardEntities).filter(
      (e): e is IPieceEntity =>
        e.type === 'PIECE' && !e.isCaptured && e.ownerId === owner && e.position !== undefined
    );

    // Filter by role if provided
    const matchingPieces = targetRole
      ? pieces.filter((p) => p.variantId?.toUpperCase().includes(targetRole))
      : pieces;

    const pool = matchingPieces.length > 0 ? matchingPieces : pieces;

    // Filter by disambiguation if provided
    if (disambig && disambig.length > 0) {
      for (const piece of pool) {
        if (!piece.position) continue;
        const alg = PGNExporter.coordToAlgebraic(piece.position);
        if (disambig.length === 1) {
          if (alg[0] === disambig || alg[1] === disambig) {
            return piece.position;
          }
        } else if (alg === disambig) {
          return piece.position;
        }
      }
    }

    // Forward pawn heuristic
    const toParts = toCoord.split(',');
    const tx = parseInt(toParts[0], 10);
    const ty = parseInt(toParts[1], 10);

    for (const piece of pool) {
      if (!piece.position) continue;
      const [px, py] = piece.position.split(',').map((n) => parseInt(n, 10));

      if (piece.variantId?.includes('PAWN') && px === tx) {
        if (isWhite && py < ty) return piece.position;
        if (!isWhite && py > ty) return piece.position;
      }
    }

    return pool[0]?.position;
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
