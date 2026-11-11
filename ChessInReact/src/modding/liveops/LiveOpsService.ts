import { ILiveOpsMotdPayload } from '../interfaces/IModdingContracts';

export const DEFAULT_MOTD_FALLBACK: ILiveOpsMotdPayload = {
  eventId: 'event_winter_hex_2026',
  headlineTitle: 'Torneio Hexagonal da Comunidade',
  bannerImageUrl: '/assets/events/hex_winter_banner.webp',
  accentColorHex: '#06b6d4',
  callToActionLabel: 'Jogar Variante Especial',
  targetRoute: '/queue/hex_community',
  activeUntilTimestamp: 4102444800000, // 2100-01-01
};

export class LiveOpsService {
  private static currentMotd: ILiveOpsMotdPayload = DEFAULT_MOTD_FALLBACK;

  /**
   * Retrieves active Message of the Day (Spec 10 § 9.1, RF-07).
   */
  public static getActiveMotd(now: number = Date.now()): ILiveOpsMotdPayload | null {
    if (this.currentMotd.activeUntilTimestamp < now) {
      return null;
    }
    return this.currentMotd;
  }

  /**
   * Updates active MotD dynamically at runtime (Zero-Downtime Server-Driven UI).
   */
  public static setActiveMotd(payload: ILiveOpsMotdPayload): void {
    this.currentMotd = payload;
  }

  /**
   * Resets MotD to default seasonal event.
   */
  public static resetToDefault(): void {
    this.currentMotd = DEFAULT_MOTD_FALLBACK;
  }
}

