import { describe, expect, it } from 'vitest';
import { asCoordinateKey, asEntityId } from '../../../coordinates';
import { IPieceEntity } from '../../../entities/types';
import { SquareTopology } from '../../';
import { FogOfWarManager } from '../FogOfWarManager';

describe('RF-13: Fog of War Logic Verification', () => {
  const square = new SquareTopology({ width: null, height: null });
  const p1King: IPieceEntity = {
    id: asEntityId('p1-king'),
    type: 'PIECE',
    ownerId: 'P1',
    variantId: 'KING',
    position: asCoordinateKey('0,0'),
    hasMoved: false,
    isCaptured: false,
  };

  const p2Ninja: IPieceEntity = {
    id: asEntityId('p2-ninja'),
    type: 'PIECE',
    ownerId: 'P2',
    variantId: 'KNIGHT',
    position: asCoordinateKey('10,10'),
    hasMoved: false,
    isCaptured: false,
  };

  it('initializes coordinates as FOG_HIDDEN and reveals cells as VISIBLE around player pieces', () => {
    const fow = new FogOfWarManager();
    expect(fow.getVisibility('P1', asCoordinateKey('0,0'))).toBe('FOG_HIDDEN');
    expect(fow.getVisibility('P1', asCoordinateKey('1,0'))).toBe('FOG_HIDDEN');

    // Update visibility with vision radius 2
    fow.updateVisibility('P1', [p1King, p2Ninja], square, { defaultVisionRadius: 2 });

    expect(fow.getVisibility('P1', asCoordinateKey('0,0'))).toBe('VISIBLE');
    expect(fow.getVisibility('P1', asCoordinateKey('1,0'))).toBe('VISIBLE');
    expect(fow.getVisibility('P1', asCoordinateKey('2,0'))).toBe('VISIBLE');
    // Distance 3 should remain hidden
    expect(fow.getVisibility('P1', asCoordinateKey('3,0'))).toBe('FOG_HIDDEN');
    // Enemy position 10,10 is hidden for P1
    expect(fow.getVisibility('P1', asCoordinateKey('10,10'))).toBe('FOG_HIDDEN');
  });

  it('transitions previously visible tiles to FOG_EXPLORED when piece moves away', () => {
    const fow = new FogOfWarManager();
    fow.updateVisibility('P1', [p1King], square, { defaultVisionRadius: 1 });

    expect(fow.getVisibility('P1', asCoordinateKey('0,0'))).toBe('VISIBLE');
    expect(fow.getVisibility('P1', asCoordinateKey('1,0'))).toBe('VISIBLE');

    // Piece moves to 5,0
    const movedKing: IPieceEntity = {
      ...p1King,
      position: asCoordinateKey('5,0'),
    };
    fow.updateVisibility('P1', [movedKing], square, { defaultVisionRadius: 1 });

    // Old location is now explored, not visible
    expect(fow.getVisibility('P1', asCoordinateKey('0,0'))).toBe('FOG_EXPLORED');
    expect(fow.getVisibility('P1', asCoordinateKey('1,0'))).toBe('FOG_EXPLORED');

    // New location is visible
    expect(fow.getVisibility('P1', asCoordinateKey('5,0'))).toBe('VISIBLE');
    expect(fow.getVisibility('P1', asCoordinateKey('6,0'))).toBe('VISIBLE');
  });

  it('respects terrain occlusion (e.g. mountain blocks vision beyond)', () => {
    const fow = new FogOfWarManager();
    // Wall at 1,0 blocks vision to 2,0
    const isOccluding = (coord: string) => coord === '1,0';

    fow.updateVisibility('P1', [p1King], square, { defaultVisionRadius: 2, isOccluding });

    expect(fow.getVisibility('P1', asCoordinateKey('0,0'))).toBe('VISIBLE');
    expect(fow.getVisibility('P1', asCoordinateKey('1,0'))).toBe('VISIBLE'); // Wall itself is visible
    expect(fow.getVisibility('P1', asCoordinateKey('2,0'))).toBe('FOG_HIDDEN'); // Blocked by wall!
  });

  it('filters out hidden opponent pieces to prevent accidental client information leakage', () => {
    const fow = new FogOfWarManager();
    fow.updateVisibility('P1', [p1King], square, { defaultVisionRadius: 2 });

    const allEntities = [p1King, p2Ninja];
    const visibleForP1 = fow.filterVisibleEntities('P1', allEntities);

    // P1 sees own piece, but does NOT see hidden p2Ninja at 10,10
    expect(visibleForP1.map((e) => e.id)).toContain(p1King.id);
    expect(visibleForP1.map((e) => e.id)).not.toContain(p2Ninja.id);
  });

  it('exports and restores fog of war state losslessly', () => {
    const fow1 = new FogOfWarManager();
    fow1.updateVisibility('P1', [p1King], square, { defaultVisionRadius: 2 });

    const snapshot = fow1.exportState();
    const fow2 = new FogOfWarManager(snapshot);

    expect(fow2.getVisibility('P1', asCoordinateKey('0,0'))).toBe('VISIBLE');
    expect(fow2.getVisibility('P1', asCoordinateKey('1,1'))).toBe('VISIBLE');
    expect(fow2.getVisibility('P1', asCoordinateKey('9,9'))).toBe('FOG_HIDDEN');
  });
});
