import React, { useEffect, useRef, useState } from 'react';

export interface IMoveItem {
  turnNumber: number;
  white?: string;
  black?: string;
  timestamp?: number;
}

export interface IMoveHistoryListProps {
  moves: IMoveItem[];
  onSelectMoveIndex?: (moveIndex: number) => void;
  activeMoveIndex?: number;
  maxHeight?: string;
  onExportPGN?: () => string;
}

export const MoveHistoryList: React.FC<IMoveHistoryListProps> = ({
  moves,
  onSelectMoveIndex,
  activeMoveIndex,
  maxHeight = '180px',
  onExportPGN,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  // Auto-scroll to bottom whenever moves update
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [moves]);

  // Format PGN string for clipboard export
  const exportPgnString = (): string => {
    if (onExportPGN) return onExportPGN();
    if (moves.length === 0) return '';
    return moves
      .map((m) => {
        const whiteStr = m.white ? ` ${m.white}` : '';
        const blackStr = m.black ? ` ${m.black}` : '';
        return `${m.turnNumber}.${whiteStr}${blackStr}`;
      })
      .join(' ');
  };

  const handleCopyPgn = async () => {
    const pgn = exportPgnString();
    if (!pgn) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(pgn);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.warn('[MoveHistoryList] Failed to copy PGN to clipboard:', err);
    }
  };

  return (
    <div
      data-testid="move-history-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 'var(--radius-md, 8px)',
        backgroundColor: 'var(--bg-sunken, #090d13)',
        border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.1))',
        overflow: 'hidden',
        width: '100%',
      }}
    >
      {/* Header with Title and Copy PGN action */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.45rem 0.75rem',
          backgroundColor: 'var(--bg-card, #141c2b)',
          borderBottom: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 800,
              fontFamily: 'var(--font-mono, monospace)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-secondary, #94a3b8)',
            }}
          >
            Notação da Partida
          </span>
          <span
            data-testid="move-count-badge"
            style={{
              fontSize: '0.65rem',
              fontWeight: 700,
              padding: '1px 5px',
              borderRadius: '4px',
              backgroundColor: 'rgba(59, 130, 246, 0.15)',
              color: 'var(--color-accent, #60a5fa)',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            {moves.length} {moves.length === 1 ? 'lance' : 'lances'}
          </span>
        </div>

        <button
          type="button"
          id="btn-copy-pgn"
          data-testid="btn-copy-pgn"
          onClick={handleCopyPgn}
          disabled={moves.length === 0}
          title="Copiar notação em formato PGN"
          style={{
            background: 'transparent',
            border: 'none',
            color: copied ? 'var(--color-success, #10b981)' : 'var(--text-secondary, #94a3b8)',
            fontSize: '0.72rem',
            fontWeight: 700,
            cursor: moves.length === 0 ? 'default' : 'pointer',
            opacity: moves.length === 0 ? 0.4 : 1,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            padding: '2px 6px',
            borderRadius: '4px',
            transition: 'all 0.15s ease',
          }}
        >
          {copied ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
          <span>{copied ? 'Copiado!' : 'Copiar PGN'}</span>
        </button>
      </div>

      {/* Scrollable Move Rows */}
      <div
        ref={scrollRef}
        data-testid="move-history-scroll"
        style={{
          maxHeight,
          overflowY: 'auto',
          padding: '0.4rem 0.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
        }}
      >
        {moves.length === 0 ? (
          <div
            data-testid="move-history-empty"
            style={{
              padding: '1.25rem 0.5rem',
              textAlign: 'center',
              color: 'var(--text-muted, #64748b)',
              fontSize: '0.75rem',
              fontStyle: 'italic',
            }}
          >
            Nenhum lance efetuado ainda. Mova uma peça para registrar o histórico.
          </div>
        ) : (
          <table
            data-testid="move-history-table"
            role="table"
            aria-label="Histórico de Lances da Partida"
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.78rem',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            <tbody>
              {moves.map((item, idx) => {
                const isSelected = activeMoveIndex === idx;
                return (
                  <tr
                    key={`${item.turnNumber}-${idx}`}
                    data-testid={`move-row-${item.turnNumber}`}
                    onClick={() => onSelectMoveIndex?.(idx)}
                    style={{
                      cursor: onSelectMoveIndex ? 'pointer' : 'default',
                      backgroundColor: isSelected
                        ? 'rgba(59, 130, 246, 0.2)'
                        : idx % 2 === 1
                          ? 'rgba(255, 255, 255, 0.02)'
                          : 'transparent',
                      borderRadius: '4px',
                      transition: 'background-color 0.1s ease',
                    }}
                  >
                    {/* Turn Number */}
                    <td
                      style={{
                        width: '32px',
                        padding: '3px 6px',
                        color: 'var(--text-muted, #64748b)',
                        fontWeight: 700,
                        textAlign: 'right',
                        userSelect: 'none',
                      }}
                    >
                      {item.turnNumber}.
                    </td>

                    {/* White Move */}
                    <td
                      data-testid={`move-white-${item.turnNumber}`}
                      style={{
                        padding: '3px 8px',
                        color: 'var(--text-primary, #f8fafc)',
                        fontWeight: 600,
                      }}
                    >
                      {item.white ?? '...'}
                    </td>

                    {/* Black Move */}
                    <td
                      data-testid={`move-black-${item.turnNumber}`}
                      style={{
                        padding: '3px 8px',
                        color: item.black ? 'var(--text-secondary, #cbd5e1)' : 'var(--text-muted, #64748b)',
                        fontWeight: 600,
                      }}
                    >
                      {item.black ?? ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Step Navigation Bar (Spec 06 & Spec 09 PGN Navigation) */}
      {moves.length > 0 && onSelectMoveIndex && (
        <div
          data-testid="move-history-nav-bar"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem',
            padding: '0.35rem 0.5rem',
            backgroundColor: 'var(--bg-card, #141c2b)',
            borderTop: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
          }}
        >
          <button
            type="button"
            data-testid="btn-move-first"
            aria-label="Primeiro lance"
            title="Ir para o primeiro lance (Início)"
            disabled={activeMoveIndex === 0}
            onClick={() => onSelectMoveIndex(0)}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.1))',
              borderRadius: '4px',
              padding: '2px 8px',
              fontSize: '0.72rem',
              fontWeight: 800,
              fontFamily: 'var(--font-mono, monospace)',
              color: 'var(--text-secondary, #94a3b8)',
              cursor: activeMoveIndex === 0 ? 'default' : 'pointer',
              opacity: activeMoveIndex === 0 ? 0.35 : 1,
              transition: 'all 0.12s ease',
            }}
          >
            |◀
          </button>
          <button
            type="button"
            data-testid="btn-move-prev"
            aria-label="Lance anterior"
            title="Ir para o lance anterior"
            disabled={activeMoveIndex !== undefined && activeMoveIndex <= 0}
            onClick={() => {
              const current = activeMoveIndex ?? moves.length - 1;
              onSelectMoveIndex(Math.max(0, current - 1));
            }}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.1))',
              borderRadius: '4px',
              padding: '2px 8px',
              fontSize: '0.72rem',
              fontWeight: 800,
              fontFamily: 'var(--font-mono, monospace)',
              color: 'var(--text-secondary, #94a3b8)',
              cursor: activeMoveIndex !== undefined && activeMoveIndex <= 0 ? 'default' : 'pointer',
              opacity: activeMoveIndex !== undefined && activeMoveIndex <= 0 ? 0.35 : 1,
              transition: 'all 0.12s ease',
            }}
          >
            ◀
          </button>
          <button
            type="button"
            data-testid="btn-move-next"
            aria-label="Próximo lance"
            title="Ir para o próximo lance"
            disabled={activeMoveIndex !== undefined && activeMoveIndex >= moves.length - 1}
            onClick={() => {
              const current = activeMoveIndex ?? moves.length - 1;
              onSelectMoveIndex(Math.min(moves.length - 1, current + 1));
            }}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.1))',
              borderRadius: '4px',
              padding: '2px 8px',
              fontSize: '0.72rem',
              fontWeight: 800,
              fontFamily: 'var(--font-mono, monospace)',
              color: 'var(--text-secondary, #94a3b8)',
              cursor: activeMoveIndex !== undefined && activeMoveIndex >= moves.length - 1 ? 'default' : 'pointer',
              opacity: activeMoveIndex !== undefined && activeMoveIndex >= moves.length - 1 ? 0.35 : 1,
              transition: 'all 0.12s ease',
            }}
          >
            ▶
          </button>
          <button
            type="button"
            data-testid="btn-move-last"
            aria-label="Último lance"
            title="Ir para o último lance (Ao vivo)"
            disabled={activeMoveIndex === undefined || activeMoveIndex === moves.length - 1}
            onClick={() => onSelectMoveIndex(moves.length - 1)}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.1))',
              borderRadius: '4px',
              padding: '2px 8px',
              fontSize: '0.72rem',
              fontWeight: 800,
              fontFamily: 'var(--font-mono, monospace)',
              color: 'var(--text-secondary, #94a3b8)',
              cursor: activeMoveIndex === undefined || activeMoveIndex === moves.length - 1 ? 'default' : 'pointer',
              opacity: activeMoveIndex === undefined || activeMoveIndex === moves.length - 1 ? 0.35 : 1,
              transition: 'all 0.12s ease',
            }}
          >
            ▶|
          </button>
        </div>
      )}
    </div>
  );
};
