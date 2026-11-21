import React from 'react';
import {
  IMatchConfiguration,
  ParticipantRole,
  IBotSlotConfig,
} from '../../../matchmaking/config/IMatchConfiguration';
import { MatchConfigurationManager } from '../../../matchmaking/config/MatchConfigurationManager';
import { TimeControlManager, ITimeControlPreset } from '../../../matchmaking/config/TimeControlManager';
import { VariantCatalog } from '../../../engine/variants/catalog/VariantCatalog';
import { ActionButton } from '../primitives/ActionButton';
import { Card } from '../primitives/Card';

export interface IPreMatchStagingModalProps {
  readonly isOpen: boolean;
  readonly variantId: string;
  readonly initialParticipantsCount?: number;
  readonly onClose: () => void;
  readonly onLaunchMatch: (config: IMatchConfiguration) => void;
}

export const PreMatchStagingModal: React.FC<IPreMatchStagingModalProps> = ({
  isOpen,
  variantId,
  initialParticipantsCount = 2,
  onClose,
  onLaunchMatch,
}) => {
  const [config, setConfig] = React.useState<IMatchConfiguration>(() =>
    MatchConfigurationManager.createDefaultMatch(variantId, initialParticipantsCount)
  );
  const [jsonImportText, setJsonImportText] = React.useState('');
  const [showImportBox, setShowImportBox] = React.useState(false);
  const [copyFeedback, setCopyFeedback] = React.useState<string | null>(null);

  // Time control and ranked state
  const [selectedPresetId, setSelectedPresetId] = React.useState<string>('blitz_5_0');
  const [isCustomTime, setIsCustomTime] = React.useState<boolean>(false);
  const [customMinutes, setCustomMinutes] = React.useState<number>(10);
  const [customIncrement, setCustomIncrement] = React.useState<number>(0);
  const [isRanked, setIsRanked] = React.useState<boolean>(true);

  // Sync if variantId changes
  React.useEffect(() => {
    if (isOpen) {
      const initial = MatchConfigurationManager.createDefaultMatch(variantId, initialParticipantsCount);
      const withClock = TimeControlManager.applyTimeControl(initial, 300, 0); // 5 min default
      setConfig({ ...withClock, isRanked: true });
      setSelectedPresetId('blitz_5_0');
      setIsCustomTime(false);
      setIsRanked(true);
      setCopyFeedback(null);
    }
  }, [isOpen, variantId, initialParticipantsCount]);

  if (!isOpen) return null;

  const variantDef = VariantCatalog.getById(variantId);
  const variantTitle = variantDef?.name ?? variantId;

  const handleSelectPreset = (preset: ITimeControlPreset) => {
    setSelectedPresetId(preset.id);
    setIsCustomTime(false);
    const updated = TimeControlManager.applyTimeControl(config, preset.initialSeconds, preset.incrementSeconds);
    setConfig({ ...updated, isRanked });
  };

  const handleApplyCustomTime = (mins: number, inc: number) => {
    setCustomMinutes(mins);
    setCustomIncrement(inc);
    setIsCustomTime(true);
    setSelectedPresetId('custom');
    const initialSec = Math.max(1, mins) * 60;
    const incSec = Math.max(0, inc);
    const updated = TimeControlManager.applyTimeControl(config, initialSec, incSec);
    setConfig({ ...updated, isRanked });
  };

  const handleToggleRanked = (ranked: boolean) => {
    setIsRanked(ranked);
    setConfig({ ...config, isRanked: ranked });
  };

  const handleQuickVsBot = () => {
    let updated = MatchConfigurationManager.updateSlotRole(config, 0, 'HUMAN_LOCAL');
    for (let i = 1; i < updated.slots.length; i++) {
      updated = MatchConfigurationManager.updateSlotRole(updated, i, 'AI_BOT', {
        difficultyLevel: 3,
        archetype: 'TACTICAL',
        thinkTimeMs: 900,
      });
    }
    setConfig(updated);
  };

  const handleQuickVsHuman = () => {
    let updated = config;
    for (let i = 0; i < updated.slots.length; i++) {
      updated = MatchConfigurationManager.updateSlotRole(updated, i, 'HUMAN_LOCAL');
    }
    setConfig(updated);
  };

  const handleQuickBotVsBot = () => {
    let updated = config;
    for (let i = 0; i < updated.slots.length; i++) {
      updated = MatchConfigurationManager.updateSlotRole(updated, i, 'AI_BOT', {
        difficultyLevel: 4,
        archetype: 'POSITIONAL',
        thinkTimeMs: 1200,
      });
    }
    setConfig(updated);
  };

  const handleRoleChange = (slotIndex: number, newRole: ParticipantRole) => {
    const updated = MatchConfigurationManager.updateSlotRole(config, slotIndex, newRole);
    setConfig(updated);
  };

  const handleBotDifficultyChange = (slotIndex: number, level: 1 | 2 | 3 | 4 | 5) => {
    const currentSlot = config.slots[slotIndex];
    const newBotConfig: IBotSlotConfig = {
      difficultyLevel: level,
      archetype: currentSlot?.botConfig?.archetype ?? 'TACTICAL',
      thinkTimeMs: level * 300,
    };
    const updated = MatchConfigurationManager.updateSlotRole(
      config,
      slotIndex,
      'AI_BOT',
      newBotConfig
    );
    setConfig(updated);
  };

  const handleCopyJson = async () => {
    const jsonStr = MatchConfigurationManager.exportToJson(config);
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(jsonStr);
        setCopyFeedback('Copiado para o Clipboard!');
      } else {
        setCopyFeedback('JSON gerado no console.');
      }
    } catch {
      setCopyFeedback('Não foi possível copiar.');
    }
    setTimeout(() => setCopyFeedback(null), 3000);
  };

  const handleImportJson = () => {
    try {
      const imported = MatchConfigurationManager.importFromJson(jsonImportText);
      setConfig(imported);
      setShowImportBox(false);
      setJsonImportText('');
      setCopyFeedback('Configuração carregada com sucesso!');
      setTimeout(() => setCopyFeedback(null), 3000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setCopyFeedback(`Erro: ${msg}`);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="staging-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '860px',
          maxHeight: '90vh',
          backgroundColor: 'var(--color-surface, #1e293b)',
          border: '1px solid var(--border-prominent, #475569)',
          borderRadius: 'var(--radius-lg, 12px)',
          overflowY: 'auto',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          color: 'var(--color-text-main, #f8fafc)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <h2 id="staging-modal-title" style={{ margin: 0, fontSize: '1.4rem' }}>
                Sala de Pré-Jogo: {variantTitle}
              </h2>
              {variantDef?.badge && (
                <span
                  style={{
                    backgroundColor: 'var(--color-primary-subtle, rgba(59, 130, 246, 0.2))',
                    color: 'var(--color-primary, #60a5fa)',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                  }}
                >
                  {variantDef.badge}
                </span>
              )}
            </div>
            <p style={{ margin: '0.35rem 0 0 0', color: 'var(--color-text-muted, #94a3b8)', fontSize: '0.85rem' }}>
              {variantDef?.description ?? 'Configure os participantes, níveis de IA e regras da partida.'}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar modal de pré-jogo"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-text-muted, #94a3b8)',
              fontSize: '1.5rem',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {/* 2D/3D Board Representation & Slots */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          {/* Left: Graphical Representation */}
          <Card
            variant="flat"
            style={{
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(15, 23, 42, 0.6)',
              borderRadius: '8px',
              border: '1px dashed var(--border-subtle, #334155)',
            }}
          >
            <div
              style={{
                width: '180px',
                height: '180px',
                display: 'grid',
                gridTemplateColumns: `repeat(${config.slots.length > 4 ? 4 : 2}, 1fr)`,
                gap: '4px',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px',
                backgroundColor: '#0f172a',
                borderRadius: '8px',
              }}
            >
              {config.slots.map((s) => (
                <div
                  key={s.slotIndex}
                  style={{
                    width: '100%',
                    height: '100%',
                    minHeight: '36px',
                    backgroundColor: s.hexColor,
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    color: s.colorName === 'White' || s.colorName === 'Yellow' ? '#0f172a' : '#ffffff',
                  }}
                >
                  P{s.slotIndex + 1}
                </div>
              ))}
            </div>
            <span style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--color-text-muted, #94a3b8)' }}>
              Arena {config.totalParticipants} Jogadores • Topologia {variantDef?.topologyType ?? 'SQUARE'}
            </span>
          </Card>

          {/* Right: Quick Match Settings */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                Política de Eliminação:
              </label>
              <select
                value={config.eliminationPolicy}
                onChange={(e) =>
                  setConfig({ ...config, eliminationPolicy: e.target.value as IMatchConfiguration['eliminationPolicy'] })
                }
                style={{
                  width: '100%',
                  padding: '0.45rem',
                  borderRadius: '4px',
                  backgroundColor: '#0f172a',
                  color: '#f8fafc',
                  border: '1px solid #475569',
                }}
              >
                <option value="EVAPORATION">Evaporação (Peças Varridas +20pts)</option>
                <option value="GREY_OBSTACLES">Obstáculos Cinzas Neutros</option>
                <option value="CONQUEST">Conquista (Herança pelo Autor do Mate)</option>
                <option value="ZOMBIE_BOT">Zombie Bot (IA Assume Imediatamente)</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
              <input
                type="checkbox"
                id="auto-standin-chk"
                checked={config.autoStandinOnDisconnect}
                onChange={(e) => setConfig({ ...config, autoStandinOnDisconnect: e.target.checked })}
              />
              <label htmlFor="auto-standin-chk" style={{ fontSize: '0.8rem', cursor: 'pointer' }}>
                Assunção automática por Bot em caso de queda (Auto Stand-in)
              </label>
            </div>

            {copyFeedback && (
              <div
                style={{
                  padding: '0.4rem 0.6rem',
                  backgroundColor: 'rgba(34, 197, 94, 0.2)',
                  color: '#4ade80',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                }}
              >
                {copyFeedback}
              </div>
            )}
          </div>
        </div>

        {/* Universal Time Controls & Clock Presets (Bullet, Blitz, Rapid, Classical, Custom, Unlimited) */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem',
            padding: '0.85rem 1rem',
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
            border: '1px solid #334155',
            borderRadius: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f8fafc' }}>
              ⏱️ Ritmo de Jogo e Relógio
            </span>
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => handleToggleRanked(true)}
                style={{
                  padding: '0.25rem 0.6rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  borderRadius: '4px',
                  border: isRanked ? '1px solid #3b82f6' : '1px solid #475569',
                  backgroundColor: isRanked ? 'rgba(59, 130, 246, 0.25)' : 'transparent',
                  color: isRanked ? '#60a5fa' : '#94a3b8',
                  cursor: 'pointer',
                }}
              >
                🏆 Ranqueada (Rating)
              </button>
              <button
                type="button"
                onClick={() => handleToggleRanked(false)}
                style={{
                  padding: '0.25rem 0.6rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  borderRadius: '4px',
                  border: !isRanked ? '1px solid #10b981' : '1px solid #475569',
                  backgroundColor: !isRanked ? 'rgba(16, 185, 129, 0.25)' : 'transparent',
                  color: !isRanked ? '#34d399' : '#94a3b8',
                  cursor: 'pointer',
                }}
              >
                ☕ Casual (Sem Rating)
              </button>
            </div>
          </div>

          {/* Quick preset buttons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {TimeControlManager.PRESETS.map((preset) => {
              const isSelected = !isCustomTime && selectedPresetId === preset.id;
              const icon =
                preset.category === 'BULLET'
                  ? '⚡'
                  : preset.category === 'BLITZ'
                  ? '🔥'
                  : preset.category === 'RAPID'
                  ? '⏱️'
                  : preset.category === 'CLASSICAL'
                  ? '⏳'
                  : '♾️';

              return (
                <button
                  key={preset.id}
                  type="button"
                  title={preset.description}
                  onClick={() => handleSelectPreset(preset)}
                  style={{
                    padding: '0.35rem 0.6rem',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: isSelected ? 700 : 500,
                    backgroundColor: isSelected ? 'var(--color-primary, #2563eb)' : '#1e293b',
                    color: isSelected ? '#ffffff' : '#cbd5e1',
                    border: isSelected ? '1px solid #60a5fa' : '1px solid #334155',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {icon} {preset.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => handleApplyCustomTime(customMinutes, customIncrement)}
              style={{
                padding: '0.35rem 0.6rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: isCustomTime ? 700 : 500,
                backgroundColor: isCustomTime ? 'var(--color-primary, #2563eb)' : '#1e293b',
                color: isCustomTime ? '#ffffff' : '#cbd5e1',
                border: isCustomTime ? '1px solid #60a5fa' : '1px solid #334155',
                cursor: 'pointer',
              }}
            >
              ⚙️ Customizado
            </button>
          </div>

          {/* Custom Time inputs */}
          {isCustomTime && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Minutos Iniciais:</label>
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={customMinutes}
                  onChange={(e) => handleApplyCustomTime(Number(e.target.value), customIncrement)}
                  style={{
                    width: '60px',
                    padding: '0.25rem 0.4rem',
                    backgroundColor: '#0f172a',
                    border: '1px solid #475569',
                    borderRadius: '4px',
                    color: '#f8fafc',
                    fontSize: '0.8rem',
                  }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Acréscimo (segundos):</label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={customIncrement}
                  onChange={(e) => handleApplyCustomTime(customMinutes, Number(e.target.value))}
                  style={{
                    width: '60px',
                    padding: '0.25rem 0.4rem',
                    backgroundColor: '#0f172a',
                    border: '1px solid #475569',
                    borderRadius: '4px',
                    color: '#f8fafc',
                    fontSize: '0.8rem',
                  }}
                />
              </div>
            </div>
          )}

          {/* Quick preset vs Bot / Human */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Configuração Rápida:</span>
            <button
              type="button"
              onClick={handleQuickVsBot}
              style={{
                padding: '0.2rem 0.5rem',
                fontSize: '0.72rem',
                borderRadius: '4px',
                backgroundColor: '#1e293b',
                color: '#e2e8f0',
                border: '1px solid #475569',
                cursor: 'pointer',
              }}
            >
              👤 vs 🤖 Você vs Bot
            </button>
            <button
              type="button"
              onClick={handleQuickVsHuman}
              style={{
                padding: '0.2rem 0.5rem',
                fontSize: '0.72rem',
                borderRadius: '4px',
                backgroundColor: '#1e293b',
                color: '#e2e8f0',
                border: '1px solid #475569',
                cursor: 'pointer',
              }}
            >
              👤 vs 👤 2 Jogadores (Local)
            </button>
            <button
              type="button"
              onClick={handleQuickBotVsBot}
              style={{
                padding: '0.2rem 0.5rem',
                fontSize: '0.72rem',
                borderRadius: '4px',
                backgroundColor: '#1e293b',
                color: '#e2e8f0',
                border: '1px solid #475569',
                cursor: 'pointer',
              }}
            >
              🤖 vs 🤖 Duelo de Bots
            </button>
          </div>
        </div>

        {/* Participant Slots Table */}
        <div>
          <h3 style={{ fontSize: '0.95rem', margin: '0 0 0.5rem 0' }}>Participantes da Arena (Slots)</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {config.slots.map((slot) => (
              <div
                key={slot.slotIndex}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.6rem 0.8rem',
                  backgroundColor: 'rgba(15, 23, 42, 0.5)',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span
                    style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      backgroundColor: slot.hexColor,
                      border: '1px solid #94a3b8',
                    }}
                  />
                  <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                    Assento {slot.slotIndex + 1} ({slot.colorName})
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <select
                    value={slot.role}
                    onChange={(e) => handleRoleChange(slot.slotIndex, e.target.value as ParticipantRole)}
                    style={{
                      padding: '0.35rem',
                      borderRadius: '4px',
                      backgroundColor: '#1e293b',
                      color: '#f8fafc',
                      border: '1px solid #475569',
                      fontSize: '0.8rem',
                    }}
                  >
                    <option value="HUMAN_LOCAL">Humano Local</option>
                    <option value="AI_BOT">Bot IA</option>
                    <option value="HUMAN_REMOTE">Humano Remoto</option>
                    <option value="BOT_STANDIN">Bot Substituto</option>
                  </select>

                  {slot.role === 'AI_BOT' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Dificuldade:</span>
                      <select
                        value={slot.botConfig?.difficultyLevel ?? 3}
                        onChange={(e) =>
                          handleBotDifficultyChange(slot.slotIndex, Number(e.target.value) as 1 | 2 | 3 | 4 | 5)
                        }
                        style={{
                          padding: '0.35rem',
                          borderRadius: '4px',
                          backgroundColor: '#1e293b',
                          color: '#f8fafc',
                          border: '1px solid #475569',
                          fontSize: '0.8rem',
                        }}
                      >
                        <option value="1">Nível 1 (Iniciante)</option>
                        <option value="2">Nível 2 (Casual)</option>
                        <option value="3">Nível 3 (Tático)</option>
                        <option value="4">Nível 4 (Forte)</option>
                        <option value="5">Nível 5 (Mestre)</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* JSON Import/Export Drawer */}
        {showImportBox && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <textarea
              rows={4}
              value={jsonImportText}
              onChange={(e) => setJsonImportText(e.target.value)}
              placeholder="Cole a string de configuração JSON aqui..."
              style={{
                width: '100%',
                padding: '0.5rem',
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                backgroundColor: '#0f172a',
                color: '#f8fafc',
                border: '1px solid #475569',
                borderRadius: '4px',
              }}
            />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <ActionButton variant="primary" size="sm" onClick={handleImportJson}>
                Aplicar JSON
              </ActionButton>
              <ActionButton variant="secondary" size="sm" onClick={() => setShowImportBox(false)}>
                Cancelar
              </ActionButton>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '0.5rem',
            borderTop: '1px solid #334155',
          }}
        >
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <ActionButton variant="ghost" size="sm" onClick={handleCopyJson}>
              📋 Copiar JSON
            </ActionButton>
            <ActionButton
              variant="ghost"
              size="sm"
              onClick={() => setShowImportBox(!showImportBox)}
            >
              📥 Importar JSON
            </ActionButton>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <ActionButton variant="secondary" onClick={onClose}>
              Cancelar
            </ActionButton>
            <ActionButton variant="primary" onClick={() => onLaunchMatch(config)}>
              ⚔️ Iniciar Arena
            </ActionButton>
          </div>
        </div>
      </div>
    </div>
  );
};
