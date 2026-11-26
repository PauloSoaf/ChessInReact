/**
 * ChessInReact - Spell Chess Composite Turn Action Contracts (Spec 15 § 4 Estratégia 7, RF-15-06)
 *
 * Models a complete Spell Chess turn as an atomic composite unit:
 *   SpellChessTurnAction = Optional Spell + Mandatory Piece Move
 */

export type SpellAction =
  | { readonly type: 'NONE' }
  | { readonly type: 'FREEZE'; readonly targetSquare: string }
  | { readonly type: 'JUMP'; readonly targetSquare: string };

export interface SpellChessTurnAction {
  readonly spell: SpellAction;
  readonly move: {
    readonly pieceId: string;
    readonly from: string;
    readonly to: string;
    readonly promotion?: string;
    readonly isCapture?: boolean;
  };
}

export interface SpellResources {
  freezeRemaining: number;
  jumpRemaining: number;
  freezeCooldown: number;
  jumpCooldown: number;
}

export interface SpellChessDecisionTrace {
  depthReached: number;
  nodesSearched: number;
  elapsedMs: number;
  legalTurnActionsConsidered: number;
  topCandidates: Array<{
    spell: SpellAction;
    move: string;
    score: number;
  }>;
  chosenAction: SpellChessTurnAction;
  principalVariation: SpellChessTurnAction[];
}
