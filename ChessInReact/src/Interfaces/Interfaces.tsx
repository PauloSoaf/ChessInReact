export interface IHoverPreviewInfo {
  readonly type:
    | 'FREEZE'
    | 'JUMP'
    | 'DUCK'
    | 'DROP'
    | 'PORTAL'
    | 'TRAP'
    | 'INVISIBILITY'
    | 'SHIELD'
    | 'RESURRECTION'
    | 'ATOMIC_EPICENTER'
    | 'ATOMIC_BLAST'
    | 'ATOMIC_IMMUNE';
  readonly isCenter?: boolean;
  readonly isValid?: boolean;
  readonly symbol?: string;
}

export interface IBoardSquare {
  /** Replay only: the piece on this square slides in from this many squares away. */
  replaySlide?: { columns: number; rows: number; token: number };
  /** Replay only: the piece just captured here, shown fading out. */
  replayGhost?: { variantId: string; ownerId: string; token: number };
  /** Replay only: square targeted by the Jump cast on the viewed turn. */
  isJumpTarget?: boolean;
  piece: IChessPiece;
  backgroundColor?: string;
  handleClick: (squareID: ISquareInfo, piece: IChessPiece) => void;
  name?: string;
  key?: string;
  testId?: string;
  isSelected?: boolean;
  squareInfo: ISquareInfo;
  boardDisplay: IChessPiece[][];
  isMoveDestination?: boolean;
  isCaptureDestination?: boolean;
  isForcedCapture?: boolean;
  isHillVictoryMove?: boolean;
  isLastMove?: boolean;
  isCheckWarning?: boolean;
  isCheckKingError?: boolean;
  isCheckSourceError?: boolean;
  isCheckTargetError?: boolean;
  isExploding?: boolean;
  isExplosionCenter?: boolean;
  /** Variant overlays (Duck Chess duck / Spell Chess frozen square / Portals / Traps / Zones / Skins). */
  hasDuck?: boolean;
  isFrozen?: boolean;
  isVoid?: boolean;
  specialZone?:
    | 'NORMAL'
    | 'VOID'
    | 'HILL_SANCTUARY'
    | 'FINISH_LINE'
    | 'ARCANE_CONDUIT'
    | 'CITADEL_RING'
    | 'XIANGQI_PALACE'
    | 'XIANGQI_RIVER';
  hasPortal?: boolean;
  hasTrap?: boolean;
  hasJump?: boolean;
  isShielded?: boolean;
  isInvisible?: boolean;
  isArcaneSkin?: boolean;
  rankLabel?: string;
  fileLabel?: string;
  tabIndex?: number;
  onFocusSquare?: (col: number, row: number) => void;
  hoverPreview?: IHoverPreviewInfo | null;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export interface IChessPiece {
  symbol?: string;
  color?: string;
  name: string;
  ownerId?: string;
}

export interface IChessPieces {
  [key: string]: IChessPiece;
}

export interface ISquareInfo {
  row: number;
  column: number;
  squareID: string;
  name?: string;
  gameX?: number;
  gameY?: number;
}