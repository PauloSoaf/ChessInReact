/**
 * Local guest identity (PATCH-17). It only organises data stored on this device. It proves
 * nothing to a server and must never be used as authorisation for a remote database.
 */
export interface GuestIdentity {
  readonly userId: string;
  readonly displayName: string;
  readonly isGuest: boolean;
  readonly createdAt: string;
  readonly lastSeenAt: string;
}

export const GUEST_STORAGE_KEY = 'chessinreact:guest-identity';

export function randomId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Insecure (non-HTTPS) contexts lack randomUUID but still provide a CSPRNG.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isIdentity(value: unknown): value is GuestIdentity {
  const v = value as Partial<GuestIdentity> | null;
  return Boolean(v && typeof v.userId === 'string' && v.userId.length >= 16 &&
    typeof v.displayName === 'string' && typeof v.createdAt === 'string');
}

export function getOrCreateGuestIdentity(
  storage: Pick<Storage, 'getItem' | 'setItem'>, now: () => Date = () => new Date(),
): GuestIdentity {
  const timestamp = now().toISOString();
  const raw = storage.getItem(GUEST_STORAGE_KEY);
  if (raw) {
    try {
      const stored = JSON.parse(raw) as unknown;
      if (isIdentity(stored)) {
        const seen = { ...stored, lastSeenAt: timestamp };
        storage.setItem(GUEST_STORAGE_KEY, JSON.stringify(seen));
        return seen;
      }
    } catch {
      // Handled below: the unreadable value is preserved before a new identity is created.
    }
    storage.setItem(`${GUEST_STORAGE_KEY}:unreadable`, raw);
  }
  const userId = randomId();
  const identity: GuestIdentity = {
    userId, displayName: `Convidado ${userId.slice(0, 4).toUpperCase()}`, isGuest: true,
    createdAt: timestamp, lastSeenAt: timestamp,
  };
  storage.setItem(GUEST_STORAGE_KEY, JSON.stringify(identity));
  return identity;
}
