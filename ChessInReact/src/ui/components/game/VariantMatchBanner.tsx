import React from 'react';
import { VariantCatalog } from '../../../engine/variants/catalog/VariantCatalog';
import { ICheckCountState } from '../../../engine/variants/modifiers/ThreeCheckTracker';
import { IRacingKingsState } from '../../../engine/variants/modifiers/RacingKingsValidator';
import { ThreeCheckCounterBadge } from './ThreeCheckCounterBadge';

export interface IVariantMatchBannerProps {
  readonly variantId: string;
  readonly participantCount?: number;
  readonly activePlayerLabel?: string;
  readonly threeCheckState?: ICheckCountState | null;
  readonly racingKingsState?: IRacingKingsState | null;
}

export const VariantMatchBanner: React.FC<IVariantMatchBannerProps> = ({
  variantId,
  participantCount = 2,
  activePlayerLabel,
  threeCheckState,
  racingKingsState,
}) => {
  const normId = variantId.toUpperCase();
  const isStandard = normId === 'STANDARD' || normId === 'CLASSIC';

  const variantDef = VariantCatalog.getById(normId);

  // Variant metadata heuristics
  let title = variantDef?.name ?? normId.replace(/_/g, ' ');
  let subtitle = variantDef?.description ?? '';
  let badge = variantDef?.badge ?? 'Variante Ativa';
  let accentColor = '#3b82f6';

  if (normId.includes('SPELL') || normId === 'SPELL_CHESS_OFFICIAL') {
    title = 'Spell Chess (Regras Oficiais Chess.com)';
    badge = 'Freeze (5) & Jump (2)';
    subtitle = 'Opcionalmente lance 1 feitiço por rodada antes da sua jogada no tabuleiro.';
    accentColor = '#06b6d4';
  } else if (normId === 'SPELL_CHESS_EXPANDED') {
    title = 'Spell Chess (Expanded)';
    badge = '7 Feitiços & Mana';
    subtitle = 'Economia dinâmica de mana. Conjure feitiços arcanos na sua mão de cartas.';
    accentColor = '#9333ea';
  } else if (normId.includes('DUCK')) {
    title = 'Duck Chess';
    badge = 'Pato Neutro';
    subtitle = 'Sem xeque tradicional. Mova sua peça e reposicione o pato neutro para bloquear o adversário.';
    accentColor = '#eab308';
  } else if (normId.includes('BUGHOUSE')) {
    title = 'Bughouse (2v2)';
    badge = '2 Tabuleiros & Drops';
    subtitle = 'Peças capturadas vão para a reserva do seu parceiro na mesa vizinha.';
    accentColor = '#10b981';
  } else if (normId.includes('FOG')) {
    title = 'Fog of War';
    badge = 'Névoa de Guerra';
    subtitle = 'Você só enxerga as casas alcançadas pelas suas próprias peças.';
    accentColor = '#64748b';
  } else if (normId.includes('ATOMIC')) {
    title = 'Atomic Chess';
    badge = 'Explosão 3×3';
    subtitle = 'Toda captura gera uma explosão de raio 1 que elimina peças vizinhas exceto peões.';
    accentColor = '#ef4444';
  } else if (normId.includes('THREE_CHECK')) {
    title = 'Three-Check Chess';
    badge = '3 Xeques';
    subtitle = 'O primeiro jogador a aplicar 3 xeques no rei adversário vence a partida.';
    accentColor = '#f59e0b';
  } else if (normId.includes('KING_OF_THE_HILL')) {
    title = 'King of the Hill';
    badge = 'Centro d4/d5/e4/e5';
    subtitle = 'Leve seu rei a uma das quatro casas centrais para vencer imediatamente.';
    accentColor = '#d97706';
  } else if (normId.includes('RACING_KINGS')) {
    title = 'Racing Kings';
    badge = 'Corrida de Reis';
    subtitle = 'Corrida até a oitava fileira. O primeiro rei a alcançar a fileira 8 vence.';
    accentColor = '#8b5cf6';
  } else if (normId.includes('CAPABLANCA')) {
    title = 'Capablanca Chess (10×8)';
    badge = 'Arcebispo & Chanceler';
    subtitle = 'Tabuleiro expandido 10×8 com as peças compostas Arcebispo e Chanceler.';
    accentColor = '#0284c7';
  } else if (normId.includes('SHOGI')) {
    title = 'Shogi (Xadrez Japonês - 将棋)';
    badge = 'Drops & Komadai';
    subtitle = 'Peças capturadas passam a pertencer ao captor e podem ser reintroduzidas.';
    accentColor = '#d97706';
  } else if (normId.includes('XIANGQI')) {
    title = 'Xiangqi (Xadrez Chinês - 象棋)';
    badge = 'Palácio & Rio Celestial';
    subtitle = 'Canhões saltam para capturar; Generais confinados ao Palácio; Elefantes não cruzam o Rio.';
    accentColor = '#dc2626';
  } else if (normId.includes('ANTICHESS') || normId.includes('GIVEAWAY')) {
    title = 'Antichess';
    badge = 'Captura Obrigatória';
    subtitle = 'Perca todas as suas peças ou fique sem lances legais para triunfar.';
    accentColor = '#10b981';
  } else if (normId.includes('CRAZYHOUSE')) {
    title = 'Crazyhouse';
    badge = 'Drops';
    subtitle = 'Peças capturadas vão para seu inventário de reservas para serem recolocadas.';
    accentColor = '#a855f7';
  } else if (normId.includes('HORDE')) {
    title = 'Horde Chess';
    badge = '36 Peões';
    subtitle = 'Muralha assimétrica de 36 peões brancos marchando contra as peças tradicionais das pretas.';
    accentColor = '#e11d48';
  } else if (normId.includes('TORUS') || normId.includes('TOROIDAL')) {
    title = 'Toroidal Chess (Rosquinha 3D)';
    badge = 'Torus 3D';
    subtitle = 'Geometria não-euclidiana em um Torus 3D. Bordas opostas conectadas continuamente.';
    accentColor = '#f59e0b';
  } else if (normId.includes('CUBE') || normId.includes('CUBIC')) {
    title = 'Cubic Chess (Cubo 3D)';
    badge = 'Cubo 3D';
    subtitle = 'Batalha tridimensional contínua nas 6 faces de um Cubo 3D.';
    accentColor = '#06b6d4';
  } else if (normId.includes('PROCEDURAL') || normId.includes('ENDLESS')) {
    title = 'Endless Procedural Conquest';
    badge = 'Infinito';
    subtitle = 'Mundo aberto gerado continuamente por Simplex Noise.';
    accentColor = '#10b981';
  } else if (participantCount > 2) {
    title = `${participantCount} Jogadores - Arena Massiva`;
    badge = `FFA / ${participantCount} Factions`;
    subtitle = 'Disputa de múltiplos jogadores com eliminação, ordem cíclica de turnos e pontuação.';
    accentColor = '#ec4899';
  }

  // If standard 1v1 classic, render minimal badge
  if (isStandard && participantCount === 2) {
    return null;
  }

  return (
    <div
      id="variant-match-banner"
      role="banner"
      aria-label={`Modo de Jogo: ${title}`}
      data-testid="variant-match-banner"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        maxWidth: 'min(calc(100vh - 170px), 720px)',
        padding: '0.5rem 0.85rem',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--bg-elevated)',
        border: `1px solid ${accentColor}`,
        boxShadow: `0 2px 8px rgba(0, 0, 0, 0.15)`,
        marginBottom: '0.45rem',
        gap: '0.75rem',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '0.9rem',
                fontWeight: 900,
                color: 'var(--text-prominent)',
                letterSpacing: '0.01em',
              }}
            >
              {title}
            </span>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 800,
                color: accentColor,
                backgroundColor: 'var(--bg-sunken)',
                border: `1px solid ${accentColor}`,
                padding: '0.1rem 0.45rem',
                borderRadius: 'var(--radius-sm)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {badge}
            </span>
          </div>
          {subtitle && (
            <span
              style={{
                fontSize: '0.72rem',
                color: 'var(--text-subtle)',
                marginTop: '0.15rem',
                lineHeight: 1.3,
              }}
            >
              {subtitle}
            </span>
          )}

          {/* Three-Check / Five-Check Interactive Check Progress HUD */}
          {threeCheckState && (
            <div style={{ marginTop: '0.45rem' }}>
              <ThreeCheckCounterBadge state={threeCheckState} />
            </div>
          )}

          {/* Racing Kings Equalizing Turn Warning Banner */}
          {racingKingsState?.whiteReachedRank8 && !racingKingsState.isGameOver && (
            <div
              data-testid="racing-kings-equalizing-turn"
              style={{
                marginTop: '0.45rem',
                padding: '0.25rem 0.6rem',
                backgroundColor: 'rgba(245, 158, 11, 0.16)',
                border: '1px solid #f59e0b',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.74rem',
                fontWeight: 800,
                color: '#fbbf24',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <span>Turno de Equalização: Pretas precisam alcançar a 8ª fileira para empatar!</span>
            </div>
          )}
        </div>
      </div>

      {activePlayerLabel && (
        <div
          style={{
            fontSize: '0.72rem',
            fontWeight: 700,
            color: 'var(--text-muted)',
            backgroundColor: 'var(--bg-sunken)',
            padding: '0.2rem 0.5rem',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          Vez: <strong style={{ color: 'var(--text-prominent)' }}>{activePlayerLabel}</strong>
        </div>
      )}
    </div>
  );
};

