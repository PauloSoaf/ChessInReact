import { PGNExporter } from './PGNExporter';

export interface IParsedPGNMove {
  readonly moveNumber: number;
  readonly isWhite: boolean;
  readonly token: string;
  readonly fromCoord?: string;
  readonly toCoord?: string;
  readonly pieceType?: string;
  readonly isCheck?: boolean;
  readonly isCheckmate?: boolean;
}

export interface IParsedPGNMatch {
  readonly headers: Record<string, string>;
  readonly moves: IParsedPGNMove[];
  readonly result: string;
  readonly rawMovesText: string;
}

/**
 * Spec 09 § 4 & RF-02: FIDE Portable Game Notation (PGN) Lexer and Parser.
 * Robustly parses Seven Tag Roster, custom variant headers, and moves token streams
 * while safely ignoring comments { ... }, recursive variations ( ... ), and numeric glyphs ($1).
 */
export class PGNParser {
  /**
   * Parses raw PGN string into structured match metadata and move sequence.
   */
  public static parse(pgnText: string): IParsedPGNMatch {
    const headers: Record<string, string> = {};
    const lines = pgnText.split('\n');
    let moveTextStartIndex = 0;

    // 1. Extract Tag Pairs [Tag "Value"]
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('[') && line.endsWith(']')) {
        const match = line.match(/^\[([A-Za-z0-9_]+)\s+"(.*)"\]$/);
        if (match) {
          headers[match[1]] = match[2];
        }
      } else if (line.length > 0) {
        moveTextStartIndex = i;
        break;
      }
    }

    // 2. Extract and sanitize move stream
    const rawMoveLines = lines.slice(moveTextStartIndex).join(' ');
    // Remove inline curly comments { ... }
    const noComments = rawMoveLines.replace(/\{[^}]*\}/g, ' ');
    // Remove recursive variations ( ... )
    const noVariations = noComments.replace(/\([^)]*\)/g, ' ');
    // Remove numeric annotation glyphs $12
    const cleanTokens = noVariations.replace(/\$\d+/g, ' ');

    const tokens = cleanTokens.split(/\s+/).filter((t) => t.length > 0);
    const moves: IParsedPGNMove[] = [];
    let currentMoveNumber = 1;
    let result = headers.Result ?? '*';

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      // Match result tokens
      if (token === '1-0' || token === '0-1' || token === '1/2-1/2' || token === '*') {
        result = token;
        continue;
      }

      // Turn indicator (e.g. "1." or "1...")
      const turnMatch = token.match(/^(\d+)(\.{1,3})$/);
      if (turnMatch) {
        currentMoveNumber = parseInt(turnMatch[1], 10);
        continue;
      }

      // Combined turn indicator + move (e.g. "1.e4" or "1...e5")
      const combinedMatch = token.match(/^(\d+)\.{1,3}(.*)$/);
      let moveToken = token;
      if (combinedMatch && combinedMatch[2].length > 0) {
        currentMoveNumber = parseInt(combinedMatch[1], 10);
        moveToken = combinedMatch[2];
      }

      const isCheckmate = moveToken.includes('#');
      const isCheck = !isCheckmate && moveToken.includes('+');
      const cleanToken = moveToken.replace(/[+#?!]/g, '');

      // Parse coordinate move (e.g. "e2-e4" or "e2e4")
      let fromCoord: string | undefined;
      let toCoord: string | undefined;

      const coordMatch = cleanToken.match(/^([a-h][1-8])[-x]?([a-h][1-8])$/i);
      if (coordMatch) {
        fromCoord = PGNExporter.algebraicToCoord(coordMatch[1]);
        toCoord = PGNExporter.algebraicToCoord(coordMatch[2]);
      } else {
        // Standard algebraic move (e.g. "e4", "Nf3")
        const destMatch = cleanToken.match(/([a-h][1-8])$/i);
        if (destMatch) {
          toCoord = PGNExporter.algebraicToCoord(destMatch[1]);
        }
      }

      const isWhite = moves.length % 2 === 0;

      moves.push({
        moveNumber: currentMoveNumber,
        isWhite,
        token: moveToken,
        fromCoord,
        toCoord,
        isCheck,
        isCheckmate,
      });
    }

    return {
      headers,
      moves,
      result,
      rawMovesText: rawMoveLines.trim(),
    };
  }
}

