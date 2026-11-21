import React from 'react';
import { IBoardSquare } from '../../Interfaces/Interfaces';
import { useTheme } from '../../ui/theme/ThemeContext';
import { PieceRenderer } from '../../ui/components/pieces/PieceRenderer';

const BoardSquare: React.FC<IBoardSquare> = ({
  piece,
  backgroundColor,
  handleClick,
  squareInfo,
  isSelected,
  boardDisplay,
  testId,
  isMoveDestination,
  isCaptureDestination,
  isLastMove,
  isCheckWarning,
  isCheckKingError,
  isCheckSourceError,
  isCheckTargetError,
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
      nextSquare?.focus();
      return;
    } else if (e.key === 'End') {
      e.preventDefault();
      const targetCol = boardSize - 1;
      onFocusSquare?.(targetCol, squareInfo.row);
      const nextSquare = document.querySelector<HTMLElement>(
        `[data-square-col="${targetCol}"][data-square-row="${squareInfo.row}"]`
      );
      nextSquare?.focus();
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
      nextSquare?.focus();
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
        color: piece.color,
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

      {/* Legal Move Destination Indicator (Empty square dot) */}
      {isMoveDestination && (
        <div
          data-testid="legal-move-dot"
          style={{
            position: 'absolute',
            width: '28%',
            height: '28%',
            borderRadius: '50%',
            backgroundColor: activeBoardColors.legalMoveDot,
            pointerEvents: 'none',
            boxShadow: '0 0 8px rgba(0,0,0,0.32), inset 0 1px 1px rgba(255,255,255,0.28)',
          }}
        />
      )}

      {/* Legal Capture Indicator (Occupied square ring) */}
      {isCaptureDestination && (
        <div
          data-testid="legal-capture-ring"
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
          <span style={{ opacity: 0.78 }}>👑</span>
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
          <span style={{ opacity: 0.8 }}>🏁</span>
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
            fontSize: '0.95rem',
            zIndex: 2,
          }}
        >
          🌀
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
            fontSize: '0.72rem',
            pointerEvents: 'none',
            zIndex: 3,
            filter: 'drop-shadow(0 0 4px rgba(244, 63, 94, 0.85))',
          }}
        >
          💣
        </div>
      )}

      {/* Chess Piece with Spell Skins / Enchantments */}
      {isPiecePresent ? (
        <div
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
            transform: hasJump ? 'translateY(-3px) scale(1.06)' : 'none',
            filter: hasJump
              ? 'drop-shadow(0 0 8px rgba(168, 85, 247, 0.95))'
              : isShielded
                ? 'drop-shadow(0 0 8px rgba(56, 189, 248, 0.95))'
                : isArcaneSkin
                  ? 'drop-shadow(0 0 5px rgba(139, 92, 246, 0.65))'
                  : 'none',
          }}
        >
          <PieceRenderer
            variantId={piece.name}
            ownerId={(piece.ownerId as 'P1' | 'P2' | undefined) ?? (piece.color === 'white' ? 'P1' : 'P2')}
            pieceSet={pieceSet}
          />
          {hasJump && (
            <span
              style={{
                position: 'absolute',
                top: '1px',
                right: '2px',
                fontSize: '0.62rem',
                lineHeight: 1,
                pointerEvents: 'none',
              }}
            >
              ⚡
            </span>
          )}
          {isShielded && (
            <span
              style={{
                position: 'absolute',
                top: '1px',
                left: '2px',
                fontSize: '0.62rem',
                lineHeight: 1,
                pointerEvents: 'none',
              }}
            >
              🛡️
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
            fontSize: '1.5rem',
            pointerEvents: 'none',
            zIndex: 3,
            filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.5))',
          }}
        >
          🦆
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
            <span style={{ fontSize: '1.5rem', filter: 'drop-shadow(0 0 8px #ef4444)' }}>💥</span>
          )}
          {hoverPreview.type === 'ATOMIC_BLAST' && (
            <span style={{ fontSize: '0.85rem', opacity: 0.85, filter: 'drop-shadow(0 0 4px #f97316)' }}>⚠️</span>
          )}
          {hoverPreview.type === 'FREEZE' && hoverPreview.isCenter && (
            <span style={{ fontSize: '1.4rem', filter: 'drop-shadow(0 0 6px #38bdf8)' }}>❄️</span>
          )}
          {hoverPreview.type === 'FREEZE' && !hoverPreview.isCenter && (
            <span style={{ fontSize: '0.85rem', opacity: 0.7 }}>❄️</span>
          )}
          {hoverPreview.type === 'JUMP' && hoverPreview.isValid && (
            <span style={{ fontSize: '1.4rem', filter: 'drop-shadow(0 0 6px #c084fc)' }}>⚡</span>
          )}
          {hoverPreview.type === 'DUCK' && hoverPreview.isValid && (
            <span style={{ fontSize: '1.4rem', opacity: 0.85, filter: 'drop-shadow(0 0 6px #facc15)' }}>🦆</span>
          )}
          {hoverPreview.type === 'DROP' && hoverPreview.isValid && (
            <span style={{ fontSize: '1.4rem', opacity: 0.85, filter: 'drop-shadow(0 0 6px #4ade80)' }}>
              {hoverPreview.symbol ?? '♟'}
            </span>
          )}
          {hoverPreview.type === 'PORTAL' && hoverPreview.isValid && (
            <span style={{ fontSize: '1.4rem', filter: 'drop-shadow(0 0 6px #e879f9)' }}>🌀</span>
          )}
          {hoverPreview.type === 'TRAP' && hoverPreview.isValid && (
            <span style={{ fontSize: '1.4rem', filter: 'drop-shadow(0 0 6px #fbbf24)' }}>💣</span>
          )}
        </div>
      )}
    </div>
  );
};

export default BoardSquare;
