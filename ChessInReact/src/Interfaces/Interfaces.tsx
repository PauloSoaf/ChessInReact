export interface IHoverPreviewInfo {
  readonly type:
    | 'FREEZE'
    | 'JUMP'
    | 'DUCK'
    | 'DROP'
    | 'PORTAL'
    | 'TRAP'
    | 'ATOMIC_EPICENTER'
    | 'ATOMIC_BLAST'
    | 'ATOMIC_IMMUNE';
  readonly isCenter?: boolean;
  readonly isValid?: boolean;
  readonly symbol?: string;
}

export interface IBoardSquare {
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