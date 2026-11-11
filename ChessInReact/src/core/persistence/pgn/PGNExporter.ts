import { CoordinateKey } from '../../coordinates';

export interface IPGNHeaders {
  Event?: string;
  Site?: string;
  Date?: string;
  Round?: string;
  White?: string;
  Black?: string;
  Result?: string;
  Variant?: string;
  Topology?: string;
  Seed?: string;
  FEN?: string;
  PlyCount?: string;
  [key: string]: string | undefined;
}

export interface IPGNMoveEntry {
  readonly moveNumber: number;
  readonly player: 'P1' | 'P2';
  readonly fromCoord: CoordinateKey | string;
  readonly toCoord: CoordinateKey | string;
  readonly san?: string;
  readonly capturedPieceId?: string | null;
  readonly isCheck?: boolean;
  readonly isCheckmate?: boolean;
}

/**
 * Spec 09 § 4 & RF-01: FIDE-compliant Portable Game Notation (PGN) Serializer.
 * Generates valid Seven Tag Roster headers with variant and procedural seed metadata,
 * formatting moves into standard tournament-compatible algebraic text.
 */
export class PGNExporter {
  public static readonly DEFAULT_HEADERS: IPGNHeaders = {
    Event: 'ChessInReact Autonomous Match',
    Site: 'ChessInReact Engine (Isomorphic WebGL)',
    Date: new Date().toISOString().split('T')[0].replace(/-/g, '.'),
    Round: '1',
    White: 'Human Player',
    Black: 'Bot MCTS / Alpha-Beta',
    Result: '*',
    Variant: 'Standard',
    Topology: 'SQUARE',
  };

  /**
   * Converts match metadata and move list into a standard FIDE PGN string.
   */
  public static exportToPGN(
    moves: readonly IPGNMoveEntry[],
    customHeaders: Partial<IPGNHeaders> = {}
  ): string {
    const headers: IPGNHeaders = {
      ...this.DEFAULT_HEADERS,
      Date: new Date().toISOString().split('T')[0].replace(/-/g, '.'),
      PlyCount: String(moves.length),
      ...customHeaders,
    };

    // 1. Format Seven Tag Roster and extended metadata
    const tagLines: string[] = [];
    const orderedTags = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result'];

    orderedTags.forEach((tag) => {
      if (headers[tag] !== undefined) {
        tagLines.push(`[${tag} "${headers[tag]}"]`);
      }
    });

    Object.keys(headers).forEach((tag) => {
      if (!orderedTags.includes(tag) && headers[tag] !== undefined) {
        tagLines.push(`[${tag} "${headers[tag]}"]`);
      }
    });

    // 2. Format move stream
    const moveTokens: string[] = [];
    let currentTurn = 0;

    for (let i = 0; i < moves.length; i++) {
      const move = moves[i];
      const notation = move.san ?? `${this.coordToAlgebraic(move.fromCoord)}-${this.coordToAlgebraic(move.toCoord)}`;
      const suffix = move.isCheckmate ? '#' : move.isCheck ? '+' : '';

      if (move.player === 'P1') {
        currentTurn++;
        moveTokens.push(`${currentTurn}. ${notation}${suffix}`);
      } else {
        if (moveTokens.length === 0 || !moveTokens[moveTokens.length - 1].startsWith(`${currentTurn}.`)) {
          currentTurn = Math.floor(i / 2) + 1;
          moveTokens.push(`${currentTurn}... ${notation}${suffix}`);
        } else {
          moveTokens.push(`${notation}${suffix}`);
        }
      }
    }

    // Add match final result
    const resultToken = headers.Result ?? '*';
    const movesBody = moveTokens.length > 0 ? `${moveTokens.join(' ')} ${resultToken}` : resultToken;

    return `${tagLines.join('\n')}\n\n${movesBody}\n`;
  }

  /**
   * Translates internal coordinate "col,row" (e.g. "4,1") to standard algebraic coordinate (e.g. "e2").
   */
  public static coordToAlgebraic(coord: string): string {
    const parts = coord.split(',');
    if (parts.length < 2) return coord;
    const col = parseInt(parts[0], 10);
    const row = parseInt(parts[1], 10);
    if (isNaN(col) || isNaN(row)) return coord;

    const file = String.fromCharCode(97 + col);
    const rank = String(row + 1);
    return `${file}${rank}`;
  }

  /**
   * Translates algebraic coordinate (e.g. "e2") to internal coordinate "col,row" (e.g. "4,1").
   */
  public static algebraicToCoord(algebraic: string): string {
    const trimmed = algebraic.trim().toLowerCase();
    if (trimmed.length < 2) return algebraic;
    const col = trimmed.charCodeAt(0) - 97;
    const row = parseInt(trimmed.substring(1), 10) - 1;
    if (isNaN(col) || isNaN(row) || col < 0 || col > 25) return algebraic;
    return `${col},${row}`;
  }
}

