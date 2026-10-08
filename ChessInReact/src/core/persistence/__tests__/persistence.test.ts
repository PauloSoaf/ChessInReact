import { beforeEach, describe, expect, it } from 'vitest';
import { asCoordinateKey, asEntityId } from '../../coordinates';
import { IPieceEntity } from '../../entities/types';
import { createDefaultDomainState } from '../../state/initialState';
import { MemoryStorageDriver, StorageAdapter } from '../StorageAdapter';

describe('StorageAdapter (Session Persistence & Hydration)', () => {
  let driver: MemoryStorageDriver;
  let adapter: StorageAdapter;

  beforeEach(() => {
    driver = new MemoryStorageDriver();
    adapter = new StorageAdapter(driver);
  });

  it('saves and loads domain state accurately', () => {
    const domain = createDefaultDomainState('saved-match-123');
    const piece: IPieceEntity = {
      id: asEntityId('w-pawn-0'),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'PAWN',
      position: asCoordinateKey('0,1'),
      hasMoved: false,
      isCaptured: false,
    };
    domain.boardEntities[piece.id] = piece;
    domain.occupancy[piece.position] = piece.id;

    adapter.save(domain);

    const loaded = adapter.load();
    expect(loaded).toBeDefined();
    expect(loaded?.matchId).toBe('saved-match-123');
    expect(loaded?.boardEntities[piece.id]).toEqual(piece);
  });

  it('handles corrupted storage data safely by clearing and returning null', () => {
    driver.setItem(StorageAdapter.STORAGE_KEY, 'invalid-non-json-content');

    const loaded = adapter.load();
    expect(loaded).toBeNull();
    // Corrupted item was purged
    expect(driver.getItem(StorageAdapter.STORAGE_KEY)).toBeNull();
  });

  it('clears persisted session state', () => {
    const domain = createDefaultDomainState();
    adapter.save(domain);
    expect(driver.getItem(StorageAdapter.STORAGE_KEY)).not.toBeNull();

    adapter.clear();
    expect(driver.getItem(StorageAdapter.STORAGE_KEY)).toBeNull();
  });
});
