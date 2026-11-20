import React from 'react';
import { IPieceEntity } from '../../../core/entities/types';
import { PlayerId } from '../../../core/coordinates/types';
import { chessPieces } from '../../../constants/chessPieces';

export interface IReserveDropsBarProps {
  activePlayer: PlayerId;
  reservePieces: readonly IPieceEntity[];
  selectedPieceVariant: string | null;
  onSelectDropPiece: (variantId: string | null) => void;
  playerLabel: string;
  isShogi?: boolean;
}

export const ReserveDropsBar: React.FC<IReserveDropsBarProps> = ({
  reservePieces,
  selectedPieceVariant,
  onSelectDropPiece,
  playerLabel,
  isShogi = false,
}) => {
  if (reservePieces.length === 0) return null;

  // Group by variantId
  const counts = new Map<string, number>();
  for (const p of reservePieces) {
    const key = p.variantId.toUpperCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return (
    <div
      data-testid="reserve-drops-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 12px',
        borderRadius: 'var(--radius-md, 8px)',
        backgroundColor: 'var(--bg-card, #1e293b)',
        border: '1px solid var(--border-prominent, #475569)',
        margin: '6px 0',
      }}
    >
      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary, #94a3b8)' }}>
        Reserva ({playerLabel}):
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {Array.from(counts.entries()).map(([variant, count]) => {
          const isSelected = selectedPieceVariant === variant;
          const vUpper = variant.toUpperCase();
          let displaySymbol = '';
          if (isShogi) {
            if (vUpper === 'PAWN') displaySymbol = '歩';
            else if (vUpper === 'LANCE') displaySymbol = '香';
            else if (vUpper === 'KNIGHT') displaySymbol = '桂';
            else if (vUpper === 'SILVER') displaySymbol = '銀';
            else if (vUpper === 'GOLD') displaySymbol = '金';
            else if (vUpper === 'BISHOP') displaySymbol = '角';
            else if (vUpper === 'ROOK') displaySymbol = '飛';
          }
          if (!displaySymbol) {
            const pieceInfo = chessPieces[variant.toLowerCase()] ?? { symbol: variant[0] };
            displaySymbol = pieceInfo?.symbol ?? variant[0];
          }
          const hotkey = variant[0].toUpperCase();
          return (
            <button
              key={`drop-btn-${variant}`}
              data-testid={`drop-btn-${variant.toLowerCase()}`}
              aria-pressed={isSelected}
              onClick={() => onSelectDropPiece(isSelected ? null : variant)}
              title={`Clique para selecionar e depois clique na casa de destino (Atalho: tecla ${hotkey})`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 10px',
                fontSize: '0.85rem',
                borderRadius: 'var(--radius-sm, 6px)',
                border: isSelected ? '2px solid #10b981' : '1px solid var(--border-subtle, #334155)',
                backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.28)' : 'var(--bg-secondary, #0f172a)',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 600,
                boxShadow: isSelected ? '0 0 10px rgba(16, 185, 129, 0.5)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <kbd
                style={{
                  fontSize: '0.62rem',
                  padding: '1px 4px',
                  borderRadius: '3px',
                  backgroundColor: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  fontFamily: 'monospace',
                }}
              >
                {hotkey}
              </kbd>
              <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>{displaySymbol}</span>
              <span>{variant}</span>
              {count > 1 && (
                <span
                  style={{
                    fontSize: '0.7rem',
                    backgroundColor: 'rgba(255,255,255,0.2)',
                    padding: '1px 5px',
                    borderRadius: '10px',
                    fontWeight: 700,
                  }}
                >
                  ×{count}
                </span>
              )}
            </button>
          );
        })}
        {selectedPieceVariant && (
          <button
            id="btn-cancel-drop"
            data-testid="btn-cancel-drop"
            type="button"
            onClick={() => onSelectDropPiece(null)}
            title="Cancelar drop de peça (Esc)"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '3px 8px',
              fontSize: '0.75rem',
              borderRadius: 'var(--radius-sm, 4px)',
              border: '1px solid #ef4444',
              backgroundColor: 'rgba(239, 68, 68, 0.22)',
              color: '#fca5a5',
              cursor: 'pointer',
              fontWeight: 800,
              marginLeft: '4px',
            }}
          >
            ✕ Cancelar Drop (Esc)
          </button>
        )}
      </div>
    </div>
  );
};

