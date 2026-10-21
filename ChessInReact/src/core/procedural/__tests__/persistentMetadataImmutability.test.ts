import { describe, expect, it } from 'vitest';
import { asCoordinateKey } from '../../coordinates';
import { SquareTopology } from '../../topology/SquareTopology';
import { ChunkManager } from '../ChunkManager';
import { ProceduralLayoutCodec } from '../ProceduralLayoutCodec';

describe('PATCH-23: Deep Immutability of Persistent Metadata and Defensive Isolation', () => {
  it('T23-01: mutating original nested object after setPersistentModification() does not alter internal state', () => {
    const topology = new SquareTopology({ width: null, height: null });
    const manager = new ChunkManager(topology, { seed: 'immut-test-seed' });
    const coord = asCoordinateKey('4,4');

    const nested = { region: { owner: 'P1', tags: ['ancient', 'mystic'] } };
    manager.setPersistentModification(coord, {
      biome: 'FOREST',
      metadata: nested,
    });

    // Mutate the external original object
    nested.region.owner = 'P2';
    nested.region.tags.push('corrupted');

    // Internal state MUST remain unaffected
    const retrieved = manager.getPersistentModifications()[coord];
    expect(retrieved?.metadata).toEqual({
      region: { owner: 'P1', tags: ['ancient', 'mystic'] },
    });
  });

  it('T23-02: mutating object returned by getPersistentModifications() does not alter internal state', () => {
    const topology = new SquareTopology({ width: null, height: null });
    const manager = new ChunkManager(topology, { seed: 'immut-test-seed' });
    const coord = asCoordinateKey('2,2');

    manager.setPersistentModification(coord, {
      biome: 'WATER',
      metadata: { shrine: { level: 1, properties: { active: true } } },
    });

    const retrieved1 = manager.getPersistentModifications();
    const shrine = retrieved1[coord]?.metadata?.shrine as Record<string, unknown>;
    shrine.level = 99;
    (shrine.properties as Record<string, unknown>).active = false;

    // Second retrieval must still reflect the unmutated state
    const retrieved2 = manager.getPersistentModifications();
    expect((retrieved2[coord]?.metadata?.shrine as Record<string, unknown>).level).toBe(1);
    expect(((retrieved2[coord]?.metadata?.shrine as Record<string, unknown>).properties as Record<string, unknown>).active).toBe(true);
  });

  it('T23-03: mutating metadata returned by getCell() does not alter persisted modifications or internal cell state', () => {
    const topology = new SquareTopology({ width: null, height: null });
    const manager = new ChunkManager(topology, { seed: 'cell-immut-seed' });
    const coord = asCoordinateKey('5,5');

    manager.setPersistentModification(coord, {
      biome: 'PLAINS',
      metadata: { lore: { chapter: 1, author: 'Scribe' } },
    });

    const cell1 = manager.getCell(coord);
    expect(cell1).not.toBeNull();
    const lore = cell1?.metadata?.lore as Record<string, unknown>;
    lore.chapter = 42;

    const cell2 = manager.getCell(coord);
    expect((cell2?.metadata?.lore as Record<string, unknown>).chapter).toBe(1);

    const persisted = manager.getPersistentModifications()[coord];
    expect((persisted?.metadata?.lore as Record<string, unknown>).chapter).toBe(1);
  });

  it('T23-04: nested arrays remain deeply isolated and independent', () => {
    const topology = new SquareTopology({ width: null, height: null });
    const manager = new ChunkManager(topology, { seed: 'array-immut-seed' });
    const coord = asCoordinateKey('1,1');

    const list = [[1, 2], [3, 4]];
    manager.setPersistentModification(coord, {
      metadata: { matrix: list },
    });

    list[0].push(999);
    list.push([5, 6]);

    const persisted = manager.getPersistentModifications()[coord];
    expect(persisted?.metadata?.matrix).toEqual([[1, 2], [3, 4]]);
  });

  it('T23-05: non-serializable values (functions, symbols, NaN, Infinity, class instances, prototype keys) are rejected', () => {
    const topology = new SquareTopology({ width: null, height: null });
    const manager = new ChunkManager(topology, { seed: 'rejection-seed' });
    const coord = asCoordinateKey('0,0');

    // Function
    expect(() => {
      manager.setPersistentModification(coord, {
        metadata: { fn: () => {} },
      });
    }).toThrow(/not JSON-serializable/);

    // Symbol
    expect(() => {
      manager.setPersistentModification(coord, {
        metadata: { sym: Symbol('bad') },
      });
    }).toThrow(/not JSON-serializable/);

    // NaN
    expect(() => {
      manager.setPersistentModification(coord, {
        metadata: { val: NaN },
      });
    }).toThrow(/finite number/);

    // Infinity
    expect(() => {
      manager.setPersistentModification(coord, {
        metadata: { val: Infinity },
      });
    }).toThrow(/finite number/);

    // Complex class instance (Date or Map)
    expect(() => {
      manager.setPersistentModification(coord, {
        metadata: { date: new Date() },
      });
    }).toThrow(/complex class instances/);

    // Forbidden prototype keys (constructor and JSON-parsed __proto__)
    expect(() => {
      manager.setPersistentModification(coord, {
        metadata: { constructor: { polluted: true } },
      });
    }).toThrow(/forbidden object prototype key/);

    expect(() => {
      manager.setPersistentModification(coord, {
        metadata: JSON.parse('{"__proto__": {"polluted": true}}'),
      });
    }).toThrow(/forbidden object prototype key/);
  });

  it('T23-06: circular references are rejected with a controlled descriptive error', () => {
    const topology = new SquareTopology({ width: null, height: null });
    const manager = new ChunkManager(topology, { seed: 'circular-seed' });
    const coord = asCoordinateKey('3,3');

    const circularObj: Record<string, unknown> = { name: 'ouroboros' };
    circularObj.self = circularObj;

    expect(() => {
      manager.setPersistentModification(coord, {
        metadata: circularObj,
      });
    }).toThrow(/circular reference detected/);
  });

  it('T23-07: layout export and import preserves valid JSON metadata with deep isolation', () => {
    const coord = asCoordinateKey('7,7');
    const encoded = ProceduralLayoutCodec.encodeLayout({
      seed: 'export-import-seed',
      topologyType: 'SQUARE',
      persistentModifications: {
        [coord]: {
          biome: 'MOUNTAIN',
          elevation: 2.5,
          metadata: {
            quest: { id: 'dragon_peak', reward: 500, active: true, empty: {}, items: [] },
          },
        },
      },
    });

    const decoded = ProceduralLayoutCodec.decodeLayout(encoded);
    const mod = decoded.persistentModifications?.[coord];
    expect(mod?.biome).toBe('MOUNTAIN');
    expect(mod?.elevation).toBe(2.5);
    expect(mod?.metadata).toEqual({
      quest: { id: 'dragon_peak', reward: 500, active: true, empty: {}, items: [] },
    });

    // Mutating decoded structure must not affect future re-decodes
    (mod?.metadata?.quest as Record<string, unknown>).reward = 0;
    const decodedAgain = ProceduralLayoutCodec.decodeLayout(encoded);
    expect((decodedAgain.persistentModifications?.[coord]?.metadata?.quest as Record<string, unknown>).reward).toBe(500);
  });

  it('T23-08: repeated export of the same world produces identical canonical payload and hash', () => {
    const input = {
      seed: 'idempotent-seed-123',
      topologyType: 'SQUARE' as const,
      persistentModifications: {
        [asCoordinateKey('1,1')]: {
          biome: 'FOREST' as const,
          metadata: { biomeTag: 'dense', count: 10 },
        },
        [asCoordinateKey('2,2')]: {
          biome: 'WATER' as const,
          metadata: { depth: 15, frozen: false },
        },
      },
    };

    const export1 = ProceduralLayoutCodec.encodeLayout(input);
    const export2 = ProceduralLayoutCodec.encodeLayout(input);

    expect(export1).toBe(export2);

    const hash1 = ProceduralLayoutCodec.computeHash({
      seed: input.seed,
      generatorVersion: '2.0.0',
      topologyType: input.topologyType,
      chunkSize: 16,
      config: { seed: input.seed, chunkSize: 16 },
      persistentModifications: input.persistentModifications,
    });

    const hash2 = ProceduralLayoutCodec.computeHash({
      seed: input.seed,
      generatorVersion: '2.0.0',
      topologyType: input.topologyType,
      chunkSize: 16,
      config: { seed: input.seed, chunkSize: 16 },
      persistentModifications: input.persistentModifications,
    });

    expect(hash1).toBe(hash2);
  });
});
