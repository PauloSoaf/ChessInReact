/** Preferred colour against the AI. A random pick is drawn only when a match starts. */
import type { HumanColorChoice } from '../../../matchmaking/config/participants';

const STORAGE_KEY = 'chessinreact:human-color';
const listeners = new Set<() => void>();
let memoryChoice: HumanColorChoice = 'WHITE';

export function getPreferredColor(): HumanColorChoice {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'BLACK' || stored === 'RANDOM' || stored === 'WHITE' ? stored : memoryChoice;
  } catch {
    return memoryChoice;
  }
}

export function setPreferredColor(choice: HumanColorChoice): void {
  memoryChoice = choice;
  try { window.localStorage.setItem(STORAGE_KEY, choice); } catch { /* private mode: keep in memory */ }
  for (const listener of listeners) listener();
}

export const subscribePreferredColor = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
