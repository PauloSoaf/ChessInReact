/** Choice of the colour the human plays against the AI. */
import React, { useSyncExternalStore } from 'react';
import type { HumanColorChoice } from '../../../matchmaking/config/participants';
import { getPreferredColor, setPreferredColor, subscribePreferredColor } from './humanColorPreference';

const OPTIONS: ReadonlyArray<{ value: HumanColorChoice; label: string }> = [
  { value: 'WHITE', label: 'Brancas' },
  { value: 'BLACK', label: 'Pretas' },
  { value: 'RANDOM', label: 'Aleatória' },
];

export const ColorChoiceButtons: React.FC<{
  value: HumanColorChoice | null;
  onChange: (choice: HumanColorChoice) => void;
  idPrefix: string;
}> = ({ value, onChange, idPrefix }) => (
  <div className="color-picker" role="radiogroup" aria-label="Sua cor contra a IA">
    <span className="color-picker__label">Jogar de</span>
    {OPTIONS.map((option) => (
      <button key={option.value} type="button" role="radio" aria-checked={value === option.value}
        className="color-picker__option" data-testid={`${idPrefix}-color-${option.value.toLowerCase()}`}
        onClick={() => onChange(option.value)}>
        {option.label}
      </button>
    ))}
  </div>
);

export const HumanColorPicker: React.FC<{ idPrefix: string }> = ({ idPrefix }) => {
  const value = useSyncExternalStore(subscribePreferredColor, getPreferredColor, getPreferredColor);
  return <ColorChoiceButtons value={value} onChange={setPreferredColor} idPrefix={idPrefix} />;
};
