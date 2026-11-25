import React from 'react';
import { IBoardSquare } from '../../Interfaces/Interfaces';
import { useTheme } from '../../ui/theme/ThemeContext';
import { PieceRenderer } from '../../ui/components/pieces/PieceRenderer';
import { PlayerId } from '../../core/coordinates/types';
import {
  IconCrown,
  IconSwords,
  IconExplosion,
  IconFinishFlag,
  IconPortal,
  IconTrap,
  IconJump,
  IconShield,
  IconDuck,
  IconFreeze,
  IconAlertTriangle,
} from '../../ui/icons/AppIcons';

export interface IBoardSquareProps extends IBoardSquare {
  pieceOwnerId?: PlayerId;
}

const BoardSquare: React.FC<IBoardSquareProps> = ({
  piece,
  pieceOwnerId,
  backgroundColor,
  handleClick,
  squareInfo,
  isSelected,
  boardDisplay,
  testId,
  isMoveDestination,
  isCaptureDestination,
  isForcedCapture,
  isHillVictoryMove,
  isLastMove,
  isCheckWarning,
  isCheckKingError,
  isCheckSourceError,
  isCheckTargetError,
  isExploding,
  isExplosionCenter,
  hasDuck,
  isFrozen,
  isVoid,
  specialZone,
  hasPortal,
  hasTrap,
  hasJump,
  isShielded,
  isInvisible,
  isArcaneSkin,
  rankLabel,
  fileLabel,
  tabIndex,
  onFocusSquare,
  hoverPreview,
  onMouseEnter,
  onMouseLeave,
}) => {
  const { pieceSet, activeBoardColors } = useTheme();
  const isPiecePresent = Boolean(piece && piece.name && piece.name !== 'none');

  if (isVoid) {
    return (
      <div
        data-testid={testId}
        data-void-square="true"
        data-square-col={squareInfo.column}
        data-square-row={squareInfo.row}
        aria-hidden="true"
        style={{
          aspectRatio: '1 / 1',
          width: '100%',
          height: '100%',
          backgroundColor: 'transparent',
          pointerEvents: 'none',
          opacity: 0,
        }}
      />
    );
  }

  const coordLabelColor =
    backgroundColor === activeBoardColors.darkSquare
      ? activeBoardColors.lightSquare
      : activeBoardColors.darkSquare;

  // Compute accessible algebraic notation (e.g. "Casa e4, Peão Branco")
  const effX = squareInfo.gameX ?? squareInfo.column;
  const effY = squareInfo.gameY ?? squareInfo.row;
  const colLetter = String.fromCharCode(97 + effX);
  const rowNumber = effY + 1;
  const coordAlgebraic = `${colLetter}${rowNumber}`;

  const pieceLabelMap: Record<string, string> = {
    PAWN: 'Peão',
    ROOK: 'Torre',
    KNIGHT: 'Cavalo',
    BISHOP: 'Bispo',
    QUEEN: 'Rainha',
    KING: 'Rei',
  };

  const piecePtName = isPiecePresent
    ? `${pieceLabelMap[piece.name.toUpperCase()] ?? piece.name} ${piece.color === 'white' ? 'Branco' : 'Preto'}`
    : 'vazia';

  const statusSuffix = isCheckKingError
    ? ', REI EM XEQUE! Movimento restrito'
    : isCheckSourceError
    ? ', peça não pode mover enquanto o rei estiver em xeque'
    : isCheckTargetError
    ? ', destino inválido por xeque'
    : isHillVictoryMove
    ? ', LANCE DE VITÓRIA DA COLINA!'
    : isForcedCapture
    ? ', CAPTURA OBRIGATÓRIA (Antichess)'
    : isCaptureDestination
    ? ', captura legal disponível'
    : isMoveDestination
    ? ', movimento legal disponível'
    : isSelected
    ? ', selecionada'
    : '';

  const accessibleLabel = `Casa ${coordAlgebraic}, ${piecePtName}${statusSuffix}`;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick(squareInfo, piece);
      return;
    }

    // Arrow Key Navigation (WAI-ARIA Roving Navigation)
    let dCol = 0;
    let dRow = 0;
    const boardSize = boardDisplay.length;

    if (e.key === 'ArrowLeft') dCol = -1;
    else if (e.key === 'ArrowRight') dCol = 1;
    else if (e.key === 'ArrowUp') dRow = -1;
    else if (e.key === 'ArrowDown') dRow = 1;
    else if (e.key === 'Home') {
      e.preventDefault();
      const targetCol = 0;
      onFocusSquare?.(targetCol, squareInfo.row);
      const nextSquare = document.querySelector<HTMLElement>(
        `[data-square-col="${targetCol}"][data-square-row="${squareInfo.row}"]`
      );
      nextSquare?.focus({ preventScroll: true });
      return;
    } else if (e.key === 'End') {
      e.preventDefault();
      const targetCol = boardSize - 1;
      onFocusSquare?.(targetCol, squareInfo.row);
      const nextSquare = document.querySelector<HTMLElement>(
        `[data-square-col="${targetCol}"][data-square-row="${squareInfo.row}"]`
      );
      nextSquare?.focus({ preventScroll: true });
      return;
    }

    if (dCol !== 0 || dRow !== 0) {
      e.preventDefault();
      const targetCol = Math.max(0, Math.min(boardSize - 1, squareInfo.column + dCol));
      const targetRow = Math.max(0, Math.min(boardSize - 1, squareInfo.row + dRow));
      onFocusSquare?.(targetCol, targetRow);
      const nextSquare = document.querySelector<HTMLElement>(
        `[data-square-col="${targetCol}"][data-square-row="${targetRow}"]`
      );
      nextSquare?.focus({ preventScroll: true });
    }
  };

  return (
    <div
      role="button"
      tabIndex={tabIndex ?? 0}
      aria-label={accessibleLabel}
      aria-pressed={isSelected}
      data-testid={testId}
      data-square-col={squareInfo.column}
      data-square-row={squareInfo.row}
      onFocus={() => onFocusSquare?.(squareInfo.column, squareInfo.row)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`board-square ${
        isSelected ? 'board-square--selected' : ''
      } ${
        isCheckKingError
          ? 'board-square--check-king-error'
          : isCheckSourceError
          ? 'board-square--check-source-error'
          : isCheckTargetError
          ? 'board-square--check-target-error'
          : ''
      }`}
      style={{
        backgroundColor: isCheckKingError || isCheckWarning
          ? undefined
          : isCheckSourceError
          ? 'rgba(239, 68, 68, 0.28)'
          : isSelected
          ? activeBoardColors.selectedSquare
          : isLastMove
          ? activeBoardColors.lastMoveHighlight
          : `${backgroundColor}`,
        ...(isCheckKingError || isCheckWarning
          ? {
              background:
                'radial-gradient(circle at center, rgba(239, 68, 68, 0.72) 0%, rgba(220, 38, 38, 0.42) 50%, rgba(185, 28, 28, 0.12) 80%, transparent 100%)',
            }
          : {}),
        fontSize: `${boardDisplay.length < 12 ? '175%' : 185 - boardDisplay.length * 5 + '%'}`,
        justifyContent: 'center',
        alignItems: 'center',
        display: 'flex',
        color: piece?.color ?? 'inherit',
        aspectRatio: '1 / 1',
        width: '100%',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
        boxShadow: isCheckKingError || isCheckWarning
          ? 'inset 0 0 0 3px #ef4444, 0 0 16px rgba(239, 68, 68, 0.65)'
          : isCheckSourceError
          ? 'inset 0 0 0 2.5px #ef4444, 0 0 10px rgba(239, 68, 68, 0.45)'
          : isCheckTargetError
          ? 'inset 0 0 0 2.5px #ef4444'
          : isSelected
          ? 'inset 0 0 0 2.5px var(--border-active, #C4A77D)'
          : isLastMove
          ? 'inset 0 0 0 1.5px rgba(255, 255, 255, 0.22), inset 0 0 8px rgba(0, 0, 0, 0.15)'
          : 'inset 0 0 0 0.5px rgba(0, 0, 0, 0.06)',
        cursor: 'pointer',
        position: 'relative',
        userSelect: 'none',
        transition: 'background-color 140ms ease, box-shadow 140ms ease',
        animation: isCheckKingError || isCheckWarning
          ? 'checkKingPulse 1.2s infinite ease-in-out'
          : isCheckSourceError
          ? 'checkErrorShake 0.4s ease'
          : 'none',
      }}
      onClick={() => handleClick(squareInfo, piece)}
      onKeyDown={handleKeyDown}
    >
      {/* Coordinate Labels (Rank along left, File along bottom) */}
      {rankLabel && (
        <span
          data-testid="coordinate-rank"
          style={{
            position: 'absolute',
            top: '2px',
            left: '3.5px',
            fontSize: '0.58rem',
            fontFamily: 'var(--font-mono)',
            fontWeight: 800,
            color: coordLabelColor,
            opacity: 0.85,
            pointerEvents: 'none',
            lineHeight: 1,
            zIndex: 2,
          }}
        >
          {rankLabel}
        </span>
      )}

      {fileLabel && (
        <span
          data-testid="coordinate-file"
          style={{
            position: 'absolute',
            bottom: '2px',
            right: '3.5px',
            fontSize: '0.58rem',
            fontFamily: 'var(--font-mono)',
            fontWeight: 800,
            color: coordLabelColor,
            opacity: 0.85,
            pointerEvents: 'none',
            lineHeight: 1,
            zIndex: 2,
          }}
        >
          {fileLabel}
        </span>
      )}

      {/* Legal Move Destination Indicator (Empty square dot, with Crown aura on Hill victory moves) */}
      {isMoveDestination && (
        <div
          data-testid="legal-move-dot"
          className="legal-move-dot"
          style={{
            position: 'absolute',
            width: isHillVictoryMove ? '42%' : '28%',
            height: isHillVictoryMove ? '42%' : '28%',
            borderRadius: '50%',
            backgroundColor: isHillVictoryMove ? '#fbbf24' : activeBoardColors.legalMoveDot,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: isHillVictoryMove
              ? '0 0 14px rgba(251, 191, 36, 0.95), inset 0 0 6px #f59e0b'
              : '0 0 8px rgba(0,0,0,0.32), inset 0 1px 1px rgba(255,255,255,0.28)',
            zIndex: 3,
          }}
        >
          {isHillVictoryMove && (
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden="true">
              <IconCrown size={15} color="#78350f" style={{ filter: 'drop-shadow(0 1px 2px rgba(251, 191, 36, 0.9))' }} />
            </span>
          )}
        </div>
      )}

      {/* Antichess Forced Capture Indicator (Spec 04 & Spec 13 RF-13-06) */}
      {isForcedCapture && (
        <div
          data-testid="antichess-forced-capture-beacon"
          style={{
            position: 'absolute',
            inset: '2px',
            borderRadius: 'var(--radius-sm, 4px)',
            border: '2px dashed #10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            boxShadow: 'inset 0 0 10px rgba(16, 185, 129, 0.35)',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'flex-start',
            padding: '2px',
            zIndex: 2,
          }}
          aria-hidden="true"
        >
          <IconSwords size={12} color="#10b981" style={{ filter: 'drop-shadow(0 0 3px #10b981)' }} />
        </div>
      )}

      {/* Legal Capture Indicator (Occupied square ring) */}
      {isCaptureDestination && (
        <div
          data-testid="legal-capture-ring"
          className="legal-capture-ring"
          style={{
            position: 'absolute',
            inset: '4px',
            borderRadius: '50%',
            border: `3px solid ${activeBoardColors.captureSquare}`,
            backgroundColor: 'rgba(239, 68, 68, 0.14)',
            pointerEvents: 'none',
            boxShadow: 'inset 0 0 10px rgba(239, 68, 68, 0.35)',
          }}
        />
      )}

      {/* Atomic Chess Explosion Shockwave (Spec 04 & Spec 13 RF-13-05) */}
      {isExploding && (
        <div
          data-testid="atomic-shockwave-cell"
          className="atomic-shockwave-cell"
          aria-hidden="true"
        >
          {isExplosionCenter && (
            <IconExplosion
              size={28}
              color="#ef4444"
              style={{ filter: 'drop-shadow(0 0 8px rgba(239, 68, 68, 0.95))' }}
            />
          )}
        </div>
      )}

      {/* Special Variant Zone Overlays (Hill Sanctuary, Finish Line, Arcane Conduit, Citadel Ring) */}
      {specialZone === 'HILL_SANCTUARY' && (
        <div
          data-testid="hill-sanctuary-marker"
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle, rgba(251, 191, 36, 0.34) 0%, rgba(217, 119, 6, 0.16) 100%)',
            boxShadow: 'inset 0 0 0 2px #f59e0b, inset 0 0 10px rgba(251, 191, 36, 0.45)',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'flex-end',
            padding: '2px 3px',
            fontSize: '0.62rem',
            zIndex: 1,
          }}
        >
          <IconCrown size={12} color="#d97706" style={{ opacity: 0.85 }} />
        </div>
      )}

      {specialZone === 'FINISH_LINE' && (
        <div
          data-testid="finish-line-marker"
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'repeating-linear-gradient(45deg, rgba(16, 185, 129, 0.22), rgba(16, 185, 129, 0.22) 6px, rgba(251, 191, 36, 0.22) 6px, rgba(251, 191, 36, 0.22) 12px)',
            boxShadow: 'inset 0 3px 0 0 #10b981',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'flex-end',
            padding: '2px 3px',
            fontSize: '0.58rem',
            zIndex: 1,
          }}
        >
          <IconFinishFlag size={12} color="#10b981" style={{ opacity: 0.85 }} />
        </div>
      )}

      {specialZone === 'ARCANE_CONDUIT' && (
        <div
          data-testid="arcane-conduit-marker"
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle, rgba(168, 85, 247, 0.28) 0%, rgba(56, 189, 248, 0.1) 100%)',
            boxShadow: 'inset 0 0 0 1.5px rgba(168, 85, 247, 0.55)',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'flex-end',
            padding: '2px 3px',
            fontSize: '0.58rem',
            color: '#c084fc',
            zIndex: 1,
          }}
        >
          <span>✦</span>
        </div>
      )}

      {specialZone === 'CITADEL_RING' && (
        <div
          data-testid="citadel-ring-marker"
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            boxShadow: 'inset 0 0 0 1.5px rgba(245, 158, 11, 0.42)',
            backgroundColor: 'rgba(245, 158, 11, 0.08)',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
      )}

      {/* Xiangqi: Nine Palaces (九宮) */}
      {specialZone === 'XIANGQI_PALACE' && (
        <div
          data-testid="xiangqi-palace-marker"
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle, rgba(239, 68, 68, 0.12) 0%, transparent 80%)',
            boxShadow: 'inset 0 0 0 1px rgba(239, 68, 68, 0.28)',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
      )}

      {/* Xiangqi: Chu River - Han Border (楚河 · 漢界) */}
      {specialZone === 'XIANGQI_RIVER' && (
        <div
          data-testid="xiangqi-river-marker"
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(56, 189, 248, 0.12) 0%, rgba(14, 165, 233, 0.22) 50%, rgba(56, 189, 248, 0.12) 100%)',
            boxShadow: 'inset 0 0 0 1px rgba(56, 189, 248, 0.25)',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.62rem',
            color: 'rgba(56, 189, 248, 0.75)',
            zIndex: 1,
          }}
        >
          {rowNumber === 5 && colLetter === 'e' && (
            <span style={{ fontWeight: 800, letterSpacing: '2px', fontSize: '0.65rem' }}>楚河 · 漢界</span>
          )}
        </div>
      )}

      {/* Spell Chess: Dimensional Portal Vortex */}
      {hasPortal && (
        <div
          data-testid="portal-marker"
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: '3px',
            borderRadius: '50%',
            border: '2.5px dashed #c084fc',
            background: 'radial-gradient(circle, rgba(168, 85, 247, 0.38) 0%, rgba(56, 189, 248, 0.2) 100%)',
            boxShadow: '0 0 12px rgba(168, 85, 247, 0.75), inset 0 0 10px rgba(56, 189, 248, 0.65)',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2,
          }}
        >
          <IconPortal size={18} color="#c084fc" style={{ filter: 'drop-shadow(0 0 6px #c084fc)' }} />
        </div>
      )}

      {/* Spell Chess: Stealth Trap Rune */}
      {hasTrap && (
        <div
          data-testid="stealth-trap-marker"
          aria-hidden="true"
          style={{
            position: 'absolute',
            bottom: '2px',
            left: '3px',
            pointerEvents: 'none',
            zIndex: 3,
            filter: 'drop-shadow(0 0 4px rgba(244, 63, 94, 0.85))',
          }}
        >
          <IconTrap size={13} color="#f43f5e" />
        </div>
      )}

      {/* Chess Piece with Spell Skins / Enchantments */}
      {isPiecePresent ? (
        <div
          className="piece-wrapper"
          data-testid={
            hasJump
              ? 'jump-buff-marker'
              : isShielded
                ? 'shield-buff-marker'
                : isInvisible
                  ? 'invisible-buff-marker'
                  : undefined
          }
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            zIndex: 2,
            opacity: isInvisible ? 0.48 : 1,
            transform: hasJump
              ? 'translateY(-3px) scale(1.06)'
              : isSelected
              ? 'translateY(-2px) scale(1.08)'
              : 'none',
            filter: hasJump
              ? 'drop-shadow(0 0 8px rgba(168, 85, 247, 0.95))'
              : isShielded
                ? 'drop-shadow(0 0 8px rgba(56, 189, 248, 0.95))'
                : isArcaneSkin
                  ? 'drop-shadow(0 0 5px rgba(139, 92, 246, 0.65))'
                  : isSelected
                  ? 'drop-shadow(0 6px 12px rgba(0, 0, 0, 0.55))'
                  : 'none',
            transition: 'transform 140ms cubic-bezier(0.2, 0.8, 0.2, 1), filter 140ms ease',
          }}
        >
          <PieceRenderer
            variantId={piece.name}
            ownerId={
              pieceOwnerId === 'P1' ||
              (typeof pieceOwnerId === 'string' &&
                ['P1', 'WHITE', 'PLAYER1', 'W'].includes(pieceOwnerId.toUpperCase())) ||
              piece.ownerId === 'P1' ||
              (typeof piece.ownerId === 'string' &&
                ['P1', 'WHITE', 'PLAYER1', 'W'].includes(piece.ownerId.toUpperCase())) ||
              piece.color?.toLowerCase() === 'white'
                ? 'P1'
                : (pieceOwnerId as 'P1' | 'P2' | undefined) ?? (piece.ownerId as 'P1' | 'P2' | undefined) ?? 'P2'
            }
            pieceSet={pieceSet}
          />
          {hasJump && (
            <span
              style={{
                position: 'absolute',
                top: '1px',
                right: '2px',
                lineHeight: 1,
                pointerEvents: 'none',
                filter: 'drop-shadow(0 0 3px #c084fc)',
              }}
            >
              <IconJump size={10} color="#c084fc" />
            </span>
          )}
          {isShielded && (
            <span
              style={{
                position: 'absolute',
                top: '1px',
                left: '2px',
                lineHeight: 1,
                pointerEvents: 'none',
                filter: 'drop-shadow(0 0 3px #38bdf8)',
              }}
            >
              <IconShield size={10} color="#38bdf8" />
            </span>
          )}
        </div>
      ) : null}

      {/* Spell Chess: frozen square overlay */}
      {isFrozen && (
        <div
          data-testid="frozen-square-overlay"
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(6, 182, 212, 0.28)',
            boxShadow: 'inset 0 0 0 2px #06b6d4, inset 0 0 14px rgba(103, 232, 249, 0.6)',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
      )}

      {/* Duck Chess: neutral blocking duck */}
      {hasDuck && (
        <span
          data-testid="duck-marker"
          role="img"
          aria-label="Pato (bloqueia a casa)"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 3,
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.65))',
          }}
        >
          <IconDuck size={30} color="#f59e0b" />
        </span>
      )}

      {/* Interactive Spell, Duck & Drop Hover Preview Overlay */}
      {hoverPreview && (
        <div
          data-testid={`hover-preview-${hoverPreview.type.toLowerCase()}`}
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.1s ease',
            ...(hoverPreview.type === 'FREEZE'
              ? {
                  backgroundColor: hoverPreview.isCenter
                    ? 'rgba(6, 182, 212, 0.45)'
                    : 'rgba(6, 182, 212, 0.25)',
                  boxShadow: hoverPreview.isCenter
                    ? 'inset 0 0 12px #06b6d4, 0 0 12px #06b6d4'
                    : 'inset 0 0 6px #06b6d4',
                  border: hoverPreview.isCenter ? '2px dashed #38bdf8' : '1px dashed #06b6d4',
                }
              : hoverPreview.type === 'JUMP'
              ? {
                  backgroundColor: hoverPreview.isValid
                    ? 'rgba(168, 85, 247, 0.35)'
                    : 'rgba(239, 68, 68, 0.25)',
                  boxShadow: hoverPreview.isValid ? 'inset 0 0 12px #a855f7' : 'none',
                  border: hoverPreview.isValid ? '2px solid #c084fc' : '1px solid #ef4444',
                }
              : hoverPreview.type === 'DUCK'
              ? {
                  backgroundColor: hoverPreview.isValid
                    ? 'rgba(234, 179, 8, 0.35)'
                    : 'rgba(239, 68, 68, 0.25)',
                  boxShadow: hoverPreview.isValid ? 'inset 0 0 12px #eab308' : 'none',
                  border: hoverPreview.isValid ? '2px dashed #facc15' : '1px solid #ef4444',
                }
              : hoverPreview.type === 'DROP'
              ? {
                  backgroundColor: hoverPreview.isValid
                    ? 'rgba(34, 197, 94, 0.35)'
                    : 'rgba(239, 68, 68, 0.25)',
                  boxShadow: hoverPreview.isValid ? 'inset 0 0 12px #22c55e' : 'none',
                  border: hoverPreview.isValid ? '2px dashed #4ade80' : '1px solid #ef4444',
                }
              : hoverPreview.type === 'PORTAL'
              ? {
                  backgroundColor: hoverPreview.isValid
                    ? 'rgba(217, 70, 239, 0.35)'
                    : 'rgba(239, 68, 68, 0.25)',
                  boxShadow: hoverPreview.isValid ? 'inset 0 0 12px #d946ef' : 'none',
                  border: hoverPreview.isValid ? '2px dashed #e879f9' : '1px solid #ef4444',
                }
              : hoverPreview.type === 'ATOMIC_EPICENTER'
              ? {
                  backgroundColor: 'rgba(239, 68, 68, 0.45)',
                  boxShadow: 'inset 0 0 16px #ef4444, 0 0 16px #ef4444',
                  border: '2px solid #f87171',
                }
              : hoverPreview.type === 'ATOMIC_BLAST'
              ? {
                  backgroundColor: 'rgba(249, 115, 22, 0.28)',
                  boxShadow: 'inset 0 0 8px #f97316',
                  border: '1px dashed #fb923c',
                }
              : hoverPreview.type === 'ATOMIC_IMMUNE'
              ? {
                  backgroundColor: 'rgba(16, 185, 129, 0.22)',
                  boxShadow: 'inset 0 0 8px #10b981',
                  border: '1.5px dashed #34d399',
                }
              : {
                  backgroundColor: hoverPreview.isValid
                    ? 'rgba(245, 158, 11, 0.35)'
                    : 'rgba(239, 68, 68, 0.25)',
                  boxShadow: hoverPreview.isValid ? 'inset 0 0 12px #f59e0b' : 'none',
                  border: hoverPreview.isValid ? '2px dashed #fbbf24' : '1px solid #ef4444',
                }),
          }}
        >
          {hoverPreview.type === 'ATOMIC_EPICENTER' && (
            <IconExplosion size={26} color="#ef4444" style={{ filter: 'drop-shadow(0 0 8px #ef4444)' }} />
          )}
          {hoverPreview.type === 'ATOMIC_BLAST' && (
            <IconAlertTriangle size={15} color="#f97316" style={{ opacity: 0.9, filter: 'drop-shadow(0 0 4px #f97316)' }} />
          )}
          {hoverPreview.type === 'ATOMIC_IMMUNE' && (
            <IconShield size={16} color="#10b981" style={{ opacity: 0.95, filter: 'drop-shadow(0 0 4px #10b981)' }} />
          )}
          {hoverPreview.type === 'FREEZE' && hoverPreview.isCenter && (
            <IconFreeze size={24} color="#38bdf8" style={{ filter: 'drop-shadow(0 0 6px #38bdf8)' }} />
          )}
          {hoverPreview.type === 'FREEZE' && !hoverPreview.isCenter && (
            <IconFreeze size={14} color="#38bdf8" style={{ opacity: 0.75 }} />
          )}
          {hoverPreview.type === 'JUMP' && hoverPreview.isValid && (
            <IconJump size={22} color="#c084fc" style={{ filter: 'drop-shadow(0 0 6px #c084fc)' }} />
          )}
          {hoverPreview.type === 'DUCK' && hoverPreview.isValid && (
            <IconDuck size={24} color="#facc15" style={{ opacity: 0.9, filter: 'drop-shadow(0 0 6px #facc15)' }} />
          )}
          {hoverPreview.type === 'DROP' && hoverPreview.isValid && (
            <span style={{ fontSize: '1.4rem', opacity: 0.85, filter: 'drop-shadow(0 0 6px #4ade80)' }}>
              {hoverPreview.symbol ?? 'P'}
            </span>
          )}
          {hoverPreview.type === 'PORTAL' && hoverPreview.isValid && (
            <IconPortal size={22} color="#e879f9" style={{ filter: 'drop-shadow(0 0 6px #e879f9)' }} />
          )}
          {hoverPreview.type === 'TRAP' && hoverPreview.isValid && (
            <IconTrap size={20} color="#fbbf24" style={{ filter: 'drop-shadow(0 0 6px #fbbf24)' }} />
          )}
          {hoverPreview.type === 'SHIELD' && hoverPreview.isValid && (
            <IconShield size={22} color="#38bdf8" style={{ filter: 'drop-shadow(0 0 6px #38bdf8)' }} />
          )}
          {hoverPreview.type === 'INVISIBILITY' && hoverPreview.isValid && (
            <IconShield size={22} color="#8b5cf6" style={{ filter: 'drop-shadow(0 0 6px #8b5cf6)', opacity: 0.7 }} />
          )}
          {hoverPreview.type === 'RESURRECTION' && hoverPreview.isValid && (
            <IconCrown size={22} color="#f59e0b" style={{ filter: 'drop-shadow(0 0 6px #f59e0b)' }} />
          )}
        </div>
      )}
    </div>
  );
};

export default BoardSquare;
