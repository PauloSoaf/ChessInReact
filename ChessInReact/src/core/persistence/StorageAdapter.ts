import { SnapshotSerializer } from '../serialization/SnapshotSerializer';
import { IDomainState } from '../state/gameState';

export interface IStorageDriver {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStorageDriver implements IStorageDriver {
  private store = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  public removeItem(key: string): void {
    this.store.delete(key);
  }
}

/**
 * StorageAdapter manages local game state persistence, schema migration, and invalidation.
 */
export class StorageAdapter {
  public static readonly STORAGE_KEY = 'chess_session_state';
  private driver: IStorageDriver;

  constructor(driver?: IStorageDriver) {
    if (driver) {
      this.driver = driver;
    } else if (typeof window !== 'undefined' && window.localStorage) {
      this.driver = window.localStorage;
    } else {
      this.driver = new MemoryStorageDriver();
    }
  }

  public save(domain: IDomainState): void {
    const serialized = SnapshotSerializer.serialize(domain);
    this.driver.setItem(StorageAdapter.STORAGE_KEY, serialized);
  }

  public load(): IDomainState | null {
    const raw = this.driver.getItem(StorageAdapter.STORAGE_KEY);
    if (!raw) return null;

    try {
      return SnapshotSerializer.deserialize(raw);
    } catch (err) {
      console.warn('[StorageAdapter] Failed to hydrate stored session. Invalidating corrupt state.', err);
      this.clear();
      return null;
    }
  }

  public clear(): void {
    this.driver.removeItem(StorageAdapter.STORAGE_KEY);
  }
}
