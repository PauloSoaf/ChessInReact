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
  candidates?: CandidateDiagnostic[];
  engine?: 'SPELL_COMPOSITE';
  timedOut?: boolean;
  fallbackUsed?: boolean;
  quiescenceNodes?: number;
  rootFullyEnumerated?: boolean;
  materialInspectionCompleted?: boolean;
  exchangePlyLimit?: number;
  profile?: import('./SpellChessProfiler').SpellSearchProfile;
  strategicAudit?: SpellStrategicDecisionAudit;
}

export interface CandidateDiagnostic {
  action: SpellChessTurnAction;
  legal: boolean;
  score: number;
  completedDepth: number;
  opponentBestReply?: SpellChessTurnAction;
  allowsImmediateKingCapture: boolean;
  safetyChecked: boolean;
  usedFallback: boolean;
  rejectionReason?: string;
  capturedMaterialCp: number;
  materialSafetyChecked?: boolean;
  materialBalanceAfterRepliesCp?: number;
  materialLossCp?: number;
  tacticalReplyCount?: number;
  tacticalVariation?: SpellChessTurnAction[];
  materialOutcome?: 'WIN' | 'LOSS' | 'DRAW';
  materialResourceBalanceCp?: number;
  replyCoverage?: 'CAPTURES_ONLY' | 'FULL_TURN' | 'ALPHA_BETA_BOUND' | 'NORMAL_AND_CAPTURES';
  opponentRepliesSearched?: number;
  counterFreezeRepliesSearched?: number;
  captureRefutations?: import('./SpellChessMaterialSafety').MaterialInspection['refutedCaptures'];
  followUpCaptureHintCp?: number;
}

export interface SpellStrategicAlternative {
 action: SpellChessTurnAction; scoreCp: number; depthCompleted: number;
 opponentBestReply: SpellChessTurnAction | null;
 replyCoverage: NonNullable<CandidateDiagnostic['replyCoverage']>;
}
export interface FreezeImpactAnalysis {
 affectedPieces: string[];
 threatsRemoved: number | null; threatsCreated: number | null;
 kingSafetyImprovement: number | null; materialSavedCp: number | null; materialWonCp: number | null;
 attacksNeutralized: number | null; concreteFollowUp: SpellChessTurnAction[];
 opponentBestResponse: SpellChessTurnAction | null; counterFreezeRisk: number;
 resourceOpportunityCostCp: number; expectedNetBenefitCp: number | null; provedBySearch: boolean;
}
export interface SpellStrategicDecisionAudit {
 depthCompleted: number; rootCandidatesGenerated: number; rootCandidatesSearched: number;
 rootCandidatesDeepSearched: number; rootReplyCoverage: 'SELECTIVE' | 'EXHAUSTIVE';
 nodesSearched: number; searchTimeMs: number;
 bestWithoutSpell: SpellStrategicAlternative | null; bestWithFreeze: SpellStrategicAlternative | null;
 bestWithJump: SpellStrategicAlternative | null; chosenAction: SpellChessTurnAction;
 principalVariation: SpellChessTurnAction[]; opponentBestReply: SpellChessTurnAction | null;
 spellResourceCost: number; freezeImpact: FreezeImpactAnalysis | null;
 tacticalSafetyChecked: boolean; completedOpponentReply: boolean;
 replyCoverage: NonNullable<CandidateDiagnostic['replyCoverage']>;
 timeoutOccurred: boolean; fallbackUsed: boolean;
 selectionReason: 'IMMEDIATE_VICTORY' | 'TACTICAL_MATERIAL_GAIN' | 'ONLY_INSPECTED_SAFE_ACTION' |
  'MATCHED_SEARCH_ADVANTAGE' | 'CONSERVE_RESOURCE_UNPROVED_GAIN' | 'BEST_INSPECTED_NORMAL_ACTION' | 'UNAVOIDABLE_INSPECTED_LOSS' | 'EMERGENCY_SAFETY_FALLBACK';
}
