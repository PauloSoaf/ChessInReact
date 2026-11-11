import { IStorageDriver, MemoryStorageDriver } from '../StorageAdapter';

export interface ISavedMatchRecord {
  readonly id: string;
  readonly title: string;
  readonly date: string;
  readonly result: string;
  readonly pgn: string;
  readonly plyCount: number;
}

/**
 * Spec 09 § 1 & RF-01: Persistent PGN Match Archive Manager.
 * Stores match replays in browser local storage and facilitates file download export.
 */
export class PGNStorage {
  public static readonly STORAGE_KEY = 'chess_saved_pgn_matches';
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

  /**
   * Retrieves all saved match records.
   */
  public listMatches(): ISavedMatchRecord[] {
    const raw = this.driver.getItem(PGNStorage.STORAGE_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as ISavedMatchRecord[];
    } catch {
      return [];
    }
  }

  /**
   * Saves or updates a match record in the archive.
   */
  public saveMatch(record: ISavedMatchRecord): void {
    const list = this.listMatches().filter((m) => m.id !== record.id);
    list.unshift(record);
    this.driver.setItem(PGNStorage.STORAGE_KEY, JSON.stringify(list));
  }

  /**
   * Deletes a match from the archive by ID.
   */
  public deleteMatch(id: string): void {
    const list = this.listMatches().filter((m) => m.id !== id);
    this.driver.setItem(PGNStorage.STORAGE_KEY, JSON.stringify(list));
  }

  /**
   * Clears the entire local match archive.
   */
  public clearAll(): void {
    this.driver.removeItem(PGNStorage.STORAGE_KEY);
  }
}

