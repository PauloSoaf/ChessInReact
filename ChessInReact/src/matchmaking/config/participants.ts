/**
 * Who controls what in a match (PATCH-15). The match configuration is the single source of
 * truth: nothing here assumes that the human is P1 or that the bot is P2. Board orientation is
 * only a viewing preference and never changes a participant's identity.
 */
import { PlayerId } from '../../core/coordinates';
import { IMatchConfiguration, IParticipantSlot } from './IMatchConfiguration';

export type HumanColorChoice = 'WHITE' | 'BLACK' | 'RANDOM';

export const playerIdOfSlot = (slot: Pick<IParticipantSlot, 'slotIndex'>): PlayerId =>
  `P${slot.slotIndex + 1}` as PlayerId;

export function slotOfPlayer(config: IMatchConfiguration, playerId: PlayerId): IParticipantSlot | undefined {
  return config.slots.find((slot) => playerIdOfSlot(slot) === playerId);
}

export const isBotRole = (role: IParticipantSlot['role'] | undefined): boolean =>
  role === 'AI_BOT' || role === 'BOT_STANDIN';

export const isBotSeat = (config: IMatchConfiguration, playerId: PlayerId): boolean =>
  isBotRole(slotOfPlayer(config, playerId)?.role);

/** The only local human of the match, or null when there are none or several. */
export function singleLocalHuman(config: IMatchConfiguration): PlayerId | null {
  const humans = config.slots.filter((slot) => slot.role === 'HUMAN_LOCAL');
  return humans.length === 1 ? playerIdOfSlot(humans[0]) : null;
}

/** Initial perspective: Black at the bottom only when the sole local human of a duel is Black. */
export function defaultFlipped(config: IMatchConfiguration, spectatorPreference = false): boolean {
  if (config.totalParticipants !== 2) return false;
  const human = singleLocalHuman(config);
  if (human) return human === 'P2';
  return config.slots.every((slot) => isBotRole(slot.role)) ? spectatorPreference : false;
}

export interface IInteractionContext {
  readonly isGameOver: boolean;
  readonly isSpectator: boolean;
  readonly isReviewing: boolean;
  /** Role of whoever must act now (during duck placement, the player who just moved). */
  readonly actingRole: IParticipantSlot['role'] | undefined;
}

/** Only a local human, on their own turn, in a live match, may touch the board. */
export function canHumanInteract(context: IInteractionContext): boolean {
  return !context.isGameOver && !context.isSpectator && !context.isReviewing &&
    context.actingRole === 'HUMAN_LOCAL';
}

/** Who gives up when "resign" is pressed: the only local human, even during the bot's turn. */
export function resigningPlayer(config: IMatchConfiguration, activePlayer: PlayerId): PlayerId | null {
  const human = singleLocalHuman(config);
  if (human) return human;
  return slotOfPlayer(config, activePlayer)?.role === 'HUMAN_LOCAL' ? activePlayer : null;
}

/** The bot that difficulty and AI toggles refer to: the sole bot, else the one facing `viewer`. */
export function opponentBotSlot(config: IMatchConfiguration, viewer: PlayerId): IParticipantSlot | undefined {
  const bots = config.slots.filter((slot) => isBotRole(slot.role));
  if (bots.length <= 1) return bots[0];
  return bots.find((slot) => playerIdOfSlot(slot) !== viewer) ?? bots[0];
}

export const resolveColorChoice = (choice: HumanColorChoice, random: () => number = Math.random): 'P1' | 'P2' =>
  choice === 'WHITE' ? 'P1' : choice === 'BLACK' ? 'P2' : random() < 0.5 ? 'P1' : 'P2';

const SIDE_NAME: Record<'P1' | 'P2', string> = { P1: 'Brancas', P2: 'Pretas' };
export const sideName = (playerId: PlayerId): string => SIDE_NAME[playerId as 'P1' | 'P2'] ?? playerId;

/**
 * Seats the local human on `humanPlayer` in a 1v1 and the bot on the other side. P1 stays White
 * and P2 stays Black: only the roles move.
 */
export function seatHuman(
  config: IMatchConfiguration, humanPlayer: 'P1' | 'P2', botDifficulty?: 1 | 2 | 3 | 4 | 5,
): IMatchConfiguration {
  if (config.totalParticipants !== 2) return config;
  const currentBot = config.slots.find((slot) => isBotRole(slot.role))?.botConfig;
  const level = botDifficulty ?? currentBot?.difficultyLevel ?? 3;
  const slots = config.slots.map((slot) => {
    const clean = slot.displayName.replace(/\s*\(N[1-5]\)\s*$/, '');
    if (playerIdOfSlot(slot) === humanPlayer) {
      return { ...slot, role: 'HUMAN_LOCAL' as const, displayName: 'Você', botConfig: undefined };
    }
    return {
      ...slot,
      role: 'AI_BOT' as const,
      displayName: `${/^bot/i.test(clean) ? clean : `Bot ${slot.colorName}`} (N${level})`,
      botConfig: {
        ...(currentBot ?? { archetype: 'TACTICAL' as const, thinkTimeMs: 1000 }),
        difficultyLevel: level,
        thinkTimeMs: level === 5 ? 2500 : level === 4 ? 1500 : level === 3 ? 800 : level === 2 ? 350 : 150,
      },
    };
  });
  return { ...config, slots };
}
