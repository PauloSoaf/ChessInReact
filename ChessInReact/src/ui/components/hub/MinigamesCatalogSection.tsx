import React from 'react';
import { Card } from '../primitives/Card';
import { ActionButton } from '../primitives/ActionButton';
import {
  IconDuck,
  IconFreeze,
  IconSparkles,
  IconPuzzle,
  IconUsers,
  IconEye,
  IconFlame,
  IconRefresh,
  IconTarget,
  IconTrophy,
  IconCheck,
  IconBox,
  IconCastle,
  IconShield,
  IconGrid,
} from '../../icons/AppIcons';

export interface IMinigamesCatalogSectionProps {
  readonly onLaunchMinigame?: (minigameId: string) => void;
  readonly onStartBotMatch: (difficulty: number) => void;
  readonly botDifficulty: number;
  readonly onOpenStagingModal: (variantId: string, participants: number) => void;
}

const getMinigameVariantIcon = (id: string, size = 20): React.ReactElement => {
  const norm = id.toLowerCase();
  if (norm.includes('duck')) return <IconDuck size={size} color="#eab308" />;
  if (norm.includes('spell_chess_official') || norm === 'spell_chess') return <IconFreeze size={size} color="#06b6d4" />;
  if (norm.includes('spell_chess_expanded') || norm.includes('expanded')) return <IconSparkles size={size} color="#9333ea" />;
  if (norm.includes('puzzle')) return <IconPuzzle size={size} color="#ef4444" />;
  if (norm.includes('bughouse')) return <IconUsers size={size} color="#06b6d4" />;
  if (norm.includes('fog')) return <IconEye size={size} color="#94a3b8" />;
  if (norm.includes('atomic')) return <IconFlame size={size} color="#f97316" />;
  if (norm.includes('anti')) return <IconRefresh size={size} color="#10b981" />;
  if (norm.includes('hill')) return <IconTarget size={size} color="#d97706" />;
  if (norm.includes('racing')) return <IconTrophy size={size} color="#8b5cf6" />;
  if (norm.includes('three_check')) return <IconCheck size={size} color="#f59e0b" />;
  if (norm.includes('crazyhouse')) return <IconBox size={size} color="#a855f7" />;
  if (norm.includes('capablanca')) return <IconCastle size={size} color="#0284c7" />;
  if (norm.includes('horde')) return <IconShield size={size} color="#e11d48" />;
  return <IconGrid size={size} color="var(--color-accent, #638a75)" />;
};

const MINIGAMES_CATALOG = [
  {
    id: 'puzzle_rush',
    title: 'Puzzle Rush & Sobrevivência',
    badge: 'Pronto para Jogar',
    accentColor: '#ef4444',
    desc: 'Resolva o maior número de combinações táticas e problemas de mate contra o relógio em 3 ou 5 minutos antes de esgotar suas 3 vidas.',
    features: ['Modo 3 Minutos & 5 Minutos', 'Modo Sobrevivência Sem Limite', 'Catálogo Calibrado de Puzzles'],
    status: 'READY' as const,
    buttonText: 'Jogar Puzzle Rush',
    disabled: false,
  },
  {
    id: 'spell_chess_official',
    title: 'Spell Chess Oficial (Chess.com)',
    badge: 'Freeze & Jump (2 Cargas)',
    accentColor: '#06b6d4',
    desc: 'Regras Oficiais do Chess.com: 2 cargas de Freeze (congelamento 3×3) e 2 cargas de Jump (salto de peça) por jogador, com recarga de 3 turnos.',
    features: ['Freeze 3×3 (2 Cargas)', 'Jump sobre Peças (2 Cargas)', 'Recarga de 3 Turnos'],
    status: 'READY' as const,
    buttonText: 'Configurar / Jogar Spell Chess Oficial',
    disabled: false,
  },
  {
    id: 'spell_chess_expanded',
    title: 'Spell Chess RPG Expandido',
    badge: '7 Feitiços & Mana',
    accentColor: '#9333ea',
    desc: 'Cartas arcanas de magia com mana compartilhado: Congelamento em área (Freeze), Salto sobre peças (Jump), Camuflagem furtiva, Portais dimensionais e Ressurreição.',
    features: ['Deck de 7 Feitiços & Mana', 'Topologia Clássica & Hexagonal', 'Cartas Colecionáveis'],
    status: 'READY' as const,
    buttonText: 'Configurar / Jogar Spell Chess RPG',
    disabled: false,
  },
  {
    id: 'duck_chess',
    title: 'Duck Chess (Xadrez do Pato)',
    badge: 'Pronto para Jogar',
    accentColor: '#eab308',
    desc: 'Um pato de borracha neutro bloqueia uma casa após cada lance. O pato não pode ser capturado e impede a passagem de ambas as cores.',
    features: ['Pato Neutro Móvel', 'Sem Regra de Xeque Tradicional', 'Bloqueio Tático Total'],
    status: 'READY' as const,
    buttonText: 'Configurar / Jogar Duck Chess',
    disabled: false,
  },
  {
    id: 'bughouse',
    title: 'Bughouse (Xadrez Duplo 2v2)',
    badge: 'Pronto para Jogar',
    accentColor: '#06b6d4',
    desc: 'Disputa cooperativa em 2 tabuleiros paralelos. Peças capturadas pelo seu parceiro vão direto para o seu bolso de drops no tabuleiro vizinho.',
    features: ['Dois Tabuleiros Gêmeos', 'Repasse Imediato de Peças', 'Salas Síncronas Colyseus'],
    status: 'READY' as const,
    buttonText: 'Configurar / Jogar Bughouse',
    disabled: false,
  },
  {
    id: 'fog_of_war',
    title: 'Fog of War (Névoa de Guerra)',
    badge: 'Pronto para Jogar',
    accentColor: '#64748b',
    desc: 'Visão tática restrita: veja apenas as casas e peças dentro do raio de visão e ataque dos seus guerreiros. Surpreenda o adversário no escuro!',
    features: ['Campo de Visão Dinâmico', 'Emboscadas & Furtividade', 'Desafio Estratégico'],
    status: 'READY' as const,
    buttonText: 'Configurar / Jogar Fog of War',
    disabled: false,
  },
  {
    id: 'atomic',
    title: 'Atomic Chess (Xadrez Atômico)',
    badge: 'Pronto para Jogar',
    accentColor: '#f97316',
    desc: 'Cada captura explode em uma detonação de 3×3 casas, destruindo a peça capturada, a peça agressora e todas as peças adjacentes não-peões.',
    features: ['Explosões de Raio 1', 'Destruição em Cadeia', 'Risco Extremo ao Rei'],
    status: 'READY' as const,
    buttonText: 'Configurar / Jogar Atomic Chess',
    disabled: false,
  },
  {
    id: 'antichess',
    title: 'Antichess (Losing Chess)',
    badge: 'Pronto para Jogar',
    accentColor: '#10b981',
    desc: 'O objetivo é perder todas as suas peças ou ficar sem movimentos legais! Capturas são estritamente obrigatórias quando disponíveis.',
    features: ['Capturas Forçadas', 'Sem Xeque nem Roque', 'Vitória por Desarmamento'],
    status: 'READY' as const,
    buttonText: 'Configurar / Jogar Antichess',
    disabled: false,
  },
  {
    id: 'king_of_the_hill',
    title: 'King of the Hill',
    badge: 'Centro d4/e4/d5/e5',
    accentColor: '#d97706',
    desc: 'Guie seu Rei até uma das 4 casas do santuário central (d4, e4, d5, e5) para vencer instantaneamente a partida ou vença por mate!',
    features: ['Santuário Central 2×2', 'Vitória Instantânea de Rei', 'IA Especializada em Rush'],
    status: 'READY' as const,
    buttonText: 'Configurar / Jogar King of the Hill',
    disabled: false,
  },
  {
    id: 'racing_kings',
    title: 'Racing Kings',
    badge: 'Corrida até Fileira 8',
    accentColor: '#8b5cf6',
    desc: 'Corrida tática: o primeiro rei a alcançar a oitava fileira vence a partida! Xeques ao rei adversário são estritamente proibidos.',
    features: ['Proibição Total de Xeque', 'Corrida de Reis', 'Compensação de Lance Preto'],
    status: 'READY' as const,
    buttonText: 'Configurar / Jogar Racing Kings',
    disabled: false,
  },
  {
    id: 'three_check',
    title: 'Three-Check Chess',
    badge: '3 Xeques = Vitória',
    accentColor: '#f59e0b',
    desc: 'Disputa agressiva onde aplicar 3 xeques acumulados no rei adversário concede a vitória imediata antes do xeque-mate!',
    features: ['Contador de Xeques ao Vivo', 'Ataque Implacável', 'Finalizações Rápidas'],
    status: 'READY' as const,
    buttonText: 'Configurar / Jogar Three-Check',
    disabled: false,
  },
  {
    id: 'crazyhouse',
    title: 'Crazyhouse (Drops de Reserva)',
    badge: 'Drops de Peças',
    accentColor: '#a855f7',
    desc: 'Peças capturadas entram no seu bolso de reservas. No seu turno, faça o drop de qualquer peça em uma casa desocupada!',
    features: ['Bolso de Peças Capturadas', 'Drops Livres no Turno', 'Reviravoltas Constantes'],
    status: 'READY' as const,
    buttonText: 'Configurar / Jogar Crazyhouse',
    disabled: false,
  },
  {
    id: 'capablanca',
    title: 'Capablanca Chess (10×8)',
    badge: 'Arcebispo & Chanceler',
    accentColor: '#0284c7',
    desc: 'Tabuleiro expandido de 10×8 criado pelo campeão mundial José Raúl Capablanca, apresentando o Arcebispo (Bispo+Cavalo) e o Chanceler (Torre+Cavalo).',
    features: ['Grade 10×8 Expandida', 'Peças Compostas Lendárias', 'Domínio Espacial'],
    status: 'READY' as const,
    buttonText: 'Configurar / Jogar Capablanca',
    disabled: false,
  },
  {
    id: 'horde',
    title: 'Horde Chess (36 Peões vs Exército)',
    badge: 'Batalha Assimétrica',
    accentColor: '#e11d48',
    desc: 'Disputa assimétrica épica: uma legião de 36 peões brancos avançando em muralha contra as peças tradicionais das pretas!',
    features: ['Muralha de 36 Peões', 'Sem Rei Branco (Extinção)', 'Defesa vs Ofensiva Total'],
    status: 'READY' as const,
    buttonText: 'Configurar / Jogar Horde Chess',
    disabled: false,
  },
];

export const MinigamesCatalogSection: React.FC<IMinigamesCatalogSectionProps> = ({
  onLaunchMinigame,
  onStartBotMatch,
  botDifficulty,
  onOpenStagingModal,
}) => {
  return (
    <div
      id="hub-minigames-container"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))',
        gap: '1.25rem',
        alignItems: 'stretch',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {MINIGAMES_CATALOG.map((mg) => (
        <Card
          key={mg.id}
          id={`card-minigame-${mg.id}`}
          variant="interactive"
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '1rem',
            padding: '1.25rem',
            border: '1px solid var(--border-prominent)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  {getMinigameVariantIcon(mg.id, 24)}
                </span>
                <div>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: '1.05rem',
                      fontFamily: 'var(--font-display)',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {mg.title}
                  </h3>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontFamily: 'var(--font-mono)',
                      color: mg.accentColor,
                      fontWeight: 700,
                    }}
                  >
                    {mg.badge}
                  </span>
                </div>
              </div>
            </div>

            <p
              style={{
                margin: 0,
                fontSize: '0.84rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
              }}
            >
              {mg.desc}
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
              {mg.features.map((feat, fIdx) => (
                <span
                  key={fIdx}
                  style={{
                    fontSize: '0.68rem',
                    fontFamily: 'var(--font-mono)',
                    padding: '0.2rem 0.5rem',
                    borderRadius: 'var(--radius-xs)',
                    backgroundColor: 'var(--bg-sunken)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-muted)',
                  }}
                >
                  {feat}
                </span>
              ))}
            </div>
          </div>

          <ActionButton
            id={`hub-btn-play-${mg.id}`}
            variant={mg.disabled ? 'ghost' : 'primary'}
            size="sm"
            fullWidth
            disabled={mg.disabled}
            title={mg.disabled ? 'Variante em desenvolvimento' : `Jogar ${mg.title}`}
            onClick={() => {
              if (mg.disabled) return;
              if (mg.id === 'puzzle_rush' || mg.id === 'bughouse') {
                if (onLaunchMinigame) {
                  onLaunchMinigame(mg.id);
                } else {
                  onStartBotMatch(botDifficulty);
                }
              } else {
                const resolvedVariantId =
                  mg.id === 'spell_chess'
                    ? 'SPELL_CHESS_OFFICIAL'
                    : mg.id === 'atomic'
                      ? 'ATOMIC_CHESS'
                      : mg.id === 'capablanca'
                        ? 'CAPABLANCA_CHESS'
                        : mg.id === 'horde'
                          ? 'HORDE_CHESS'
                          : mg.id.toUpperCase();
                onOpenStagingModal(resolvedVariantId, 2);
              }
            }}
          >
            {mg.buttonText}
          </ActionButton>
        </Card>
      ))}
    </div>
  );
};

