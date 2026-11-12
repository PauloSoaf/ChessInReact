/**
 * ChessInReact - Universal Variant Definitions & Contracts (Spec 13 § 4, § 6)
 */

export type VariantFamily =
  | 'CLASSIC_MODIFIERS'
  | 'MAGICAL_HYBRIDS'
  | 'GEOMETRIC_FAIRY'
  | 'HISTORICAL_REGIONAL'
  | 'MASSIVE_MULTIPLAYER';

export type TopologyKind =
  | 'SQUARE'
  | 'HEXAGONAL'
  | 'TRIANGULAR'
  | 'TOROIDAL'
  | 'CYLINDRICAL'
  | 'COMPOSITE_MULTIDIRECTIONAL';

export type VictoryConditionType =
  | 'CHECKMATE'
  | 'BARE_KING'
  | 'THREE_CHECKS'
  | 'FIVE_CHECKS'
  | 'KING_OF_THE_HILL'
  | 'RACING_KINGS_EIGHTH_RANK'
  | 'EXTINCTION_OF_PIECE_CLASS'
  | 'NO_LEGAL_MOVES_WINS' // Antichess
  | 'POINTS_THRESHOLD';

export interface IDropRules {
  readonly enabled: boolean;
  readonly restrictedPawnRanks?: readonly number[];
  readonly mustDropOnEmpty: boolean;
  readonly canDropWithCheck: boolean;
  readonly canDropWithCheckmate: boolean;
}

export interface IVariantDefinition {
  readonly id: string;
  readonly name: string;
  readonly family: VariantFamily;
  readonly description: string;
  readonly badge: string;
  readonly initialFen?: string;
  readonly boardDimensions: { readonly width: number; readonly height: number };
  readonly topologyType: TopologyKind;
  readonly maxPlayers: number;
  readonly hasDrops: boolean;
  readonly hasSpells: boolean;
  readonly hasDuck: boolean;
  readonly hasFogOfWar: boolean;
  readonly victoryConditions: readonly VictoryConditionType[];
  readonly specialRules: Readonly<Record<string, unknown>>;
}

