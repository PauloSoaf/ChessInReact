import React, { useEffect, useRef } from 'react';
import { PlayerId } from '../../../core/coordinates/types';
import { PieceRenderer } from '../pieces/PieceRenderer';
import { useTheme } from '../../theme/ThemeContext';

export interface IPromotionOption {
  variantId: string;
  name: string;
  nameEn: string;
  hotkey: string;
  keyAliases: string[];
}

const DEFAULT_PROMOTION_OPTIONS: IPromotionOption[] = [
  {
    variantId: 'QUEEN',
    name: 'Dama',
    nameEn: 'Queen',
    hotkey: 'Q',
    keyAliases: ['q', 'Q', '1', 'd', 'D'],
  },
  {
    variantId: 'KNIGHT',
    name: 'Cavalo',
    nameEn: 'Knight',
    hotkey: 'N',
    keyAliases: ['n', 'N', '2', 'c', 'C', 'k', 'K'],
  },
  {
    variantId: 'ROOK',
    name: 'Torre',
    nameEn: 'Rook',
    hotkey: 'R',
    keyAliases: ['r', 'R', '3', 't', 'T'],
  },
  {
    variantId: 'BISHOP',
    name: 'Bispo',
    nameEn: 'Bishop',
    hotkey: 'B',
    keyAliases: ['b', 'B', '4'],
  },
];

export interface IPromotionModalProps {
  isOpen: boolean;
  onSelectPromotion: (variantId: string) => void;
  onCancel: () => void;
  ownerId?: PlayerId;
  targetCoord?: string;
  allowedVariants?: string[];
}

export const PromotionModal: React.FC<IPromotionModalProps> = ({
  isOpen,
  onSelectPromotion,
  onCancel,
  ownerId = 'P1',
  targetCoord,
  allowedVariants,
}) => {
  const { preferences } = useTheme();
  const modalRef = useRef<HTMLDivElement>(null);
  const firstButtonRef = useRef<HTMLButtonElement>(null);

  // Compute options based on allowedVariants or standard classical set
  const options: IPromotionOption[] = React.useMemo(() => {
    if (!allowedVariants || allowedVariants.length === 0) {
      return DEFAULT_PROMOTION_OPTIONS;
    }
    return allowedVariants.map((v) => {
      const standard = DEFAULT_PROMOTION_OPTIONS.find((opt) => opt.variantId.toUpperCase() === v.toUpperCase());
      if (standard) return standard;
      const cleanName = v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
      const hotkey = v.charAt(0).toUpperCase();
      return {
        variantId: v.toUpperCase(),
        name: cleanName,
        nameEn: cleanName,
        hotkey,
        keyAliases: [hotkey.toLowerCase(), hotkey],
      };
    });
  }, [allowedVariants]);

  // Focus the first button (typically Queen) on open
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        firstButtonRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Global keyboard listener for hotkeys (Q, N, R, B, Esc)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Do not intercept if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
        return;
      }

      const pressedKey = e.key.toLowerCase();
      const matched = options.find((opt) =>
        opt.keyAliases.some((alias) => alias.toLowerCase() === pressedKey)
      );

      if (matched) {
        e.preventDefault();
        e.stopPropagation();
        onSelectPromotion(matched.variantId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, options, onSelectPromotion, onCancel]);

  if (!isOpen) return null;

  const targetLabel = targetCoord ? ` (${targetCoord})` : '';

  return (
    <div
      ref={modalRef}
      id="promotion-modal-overlay"
      data-testid="promotion-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="promotion-modal-title"
      aria-describedby="promotion-modal-description"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        backgroundColor: 'rgba(7, 11, 17, 0.78)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        animation: 'fadeIn 0.15s ease-out forwards',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        id="promotion-modal-content"
        data-testid="promotion-modal-content"
        style={{
          width: '100%',
          maxWidth: '520px',
          backgroundColor: 'var(--bg-surface-elevated, #1a2234)',
          borderRadius: 'var(--radius-lg, 14px)',
          border: '1px solid var(--border-active, #3b82f6)',
          boxShadow: '0 20px 48px rgba(0, 0, 0, 0.65), 0 0 24px rgba(59, 130, 246, 0.25)',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          color: 'var(--text-primary, #f8fafc)',
          userSelect: 'none',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2
              id="promotion-modal-title"
              data-testid="promotion-modal-title"
              style={{
                margin: 0,
                fontSize: '1.25rem',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                color: 'var(--text-primary, #ffffff)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span>👑 Promoção de Peão</span>
              <span
                style={{
                  fontSize: '0.8rem',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(59, 130, 246, 0.2)',
                  color: 'var(--color-accent, #60a5fa)',
                  fontWeight: 700,
                }}
              >
                {targetLabel}
              </span>
            </h2>
            <p
              id="promotion-modal-description"
              data-testid="promotion-modal-description"
              style={{
                margin: '0.35rem 0 0 0',
                fontSize: '0.825rem',
                color: 'var(--text-secondary, #94a3b8)',
              }}
            >
              Selecione a nova peça para substituir o peão que atingiu a última fileira.
            </p>
          </div>
          <button
            type="button"
            data-testid="btn-close-promotion-modal"
            aria-label="Cancelar promoção"
            onClick={onCancel}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary, #94a3b8)',
              fontSize: '1.25rem',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            ✕
          </button>
        </div>

        {/* Options Grid */}
        <div
          data-testid="promotion-options-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(options.length, 4)}, 1fr)`,
            gap: '0.75rem',
          }}
        >
          {options.map((opt, index) => {
            const isFirst = index === 0;
            return (
              <button
                key={opt.variantId}
                ref={isFirst ? firstButtonRef : undefined}
                type="button"
                id={`btn-promote-${opt.variantId.toLowerCase()}`}
                data-testid={`btn-promote-${opt.variantId.toLowerCase()}`}
                aria-label={`Promover para ${opt.name} (${opt.nameEn}) - Tecla ${opt.hotkey}`}
                onClick={() => onSelectPromotion(opt.variantId)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '1rem 0.5rem',
                  gap: '0.625rem',
                  borderRadius: 'var(--radius-md, 10px)',
                  backgroundColor: 'var(--bg-card, #0f172a)',
                  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.1))',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  outline: 'none',
                  position: 'relative',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-active, #3b82f6)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 20px rgba(59, 130, 246, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-subtle, rgba(255, 255, 255, 0.1))';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-active, #3b82f6)';
                  e.currentTarget.style.boxShadow = '0 0 0 2px var(--border-active, #3b82f6)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-subtle, rgba(255, 255, 255, 0.1))';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {/* Hotkey Badge */}
                <span
                  style={{
                    position: 'absolute',
                    top: '6px',
                    right: '6px',
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    padding: '1px 5px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(255, 255, 255, 0.12)',
                    color: 'var(--text-secondary, #94a3b8)',
                    fontFamily: 'monospace',
                  }}
                >
                  {opt.hotkey}
                </span>

                {/* Piece Vector Preview */}
                <div style={{ width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <PieceRenderer
                    variantId={opt.variantId}
                    ownerId={ownerId}
                    pieceSet={preferences.pieceSet}
                    size={52}
                  />
                </div>

                {/* Piece Labels */}
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontSize: '0.875rem',
                      fontWeight: 700,
                      color: 'var(--text-primary, #ffffff)',
                    }}
                  >
                    {opt.name}
                  </div>
                  <div
                    style={{
                      fontSize: '0.6875rem',
                      color: 'var(--text-secondary, #94a3b8)',
                    }}
                  >
                    {opt.nameEn}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer with Helper and Cancel Button */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '0.5rem',
            borderTop: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #94a3b8)' }}>
            💡 Dica: Pressione <kbd style={{ padding: '2px 5px', borderRadius: '3px', background: 'rgba(255,255,255,0.1)' }}>Q</kbd>, <kbd style={{ padding: '2px 5px', borderRadius: '3px', background: 'rgba(255,255,255,0.1)' }}>N</kbd>, <kbd style={{ padding: '2px 5px', borderRadius: '3px', background: 'rgba(255,255,255,0.1)' }}>R</kbd> ou <kbd style={{ padding: '2px 5px', borderRadius: '3px', background: 'rgba(255,255,255,0.1)' }}>B</kbd>
          </div>
          <button
            type="button"
            id="btn-cancel-promotion"
            data-testid="btn-cancel-promotion"
            onClick={onCancel}
            style={{
              padding: '6px 14px',
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: 'var(--radius-sm, 6px)',
              backgroundColor: 'transparent',
              border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.2))',
              color: 'var(--text-secondary, #94a3b8)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Cancelar lance (Esc)
          </button>
        </div>
      </div>
    </div>
  );
};
