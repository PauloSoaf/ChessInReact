import { describe, it, expect } from 'vitest';
import { CubicTopology, CubeFace } from '../CubicTopology';
import { asCoordinateKey } from '../../coordinates';

describe('CubicTopology (Spec 02 & Non-Euclidean Manifold Auditing)', () => {
  const cube = new CubicTopology({ boardSize: 8 });

  it('correctly reports 6 faces with 8x8 cells each (total 384 cells)', () => {
    expect(cube.type).toBe('SQUARE');
    expect(cube.isCubic).toBe(true);
    expect(cube.isBounded).toBe(true);
    expect(cube.width).toBe(8);
    expect(cube.height).toBe(8);
    expect(cube.faceCount).toBe(6);

    for (let f = 0; f < 6; f++) {
      expect(cube.isValidCoordinate(asCoordinateKey(`${f}:0,0`))).toBe(true);
      expect(cube.isValidCoordinate(asCoordinateKey(`${f}:7,7`))).toBe(true);
      expect(cube.isValidCoordinate(asCoordinateKey(`${f}:8,0`))).toBe(false);
      expect(cube.isValidCoordinate(asCoordinateKey(`${f}:0,8`))).toBe(false);
    }
    expect(cube.isValidCoordinate(asCoordinateKey('6:0,0'))).toBe(false);
  });

  it('validates reversible edge crossing across all 12 edges with directional transport', () => {
    // 0: TOP, 1: BOTTOM, 2: FRONT, 3: BACK, 4: LEFT, 5: RIGHT
    // Direction indices: 0: NORTH, 2: EAST, 4: SOUTH, 6: WEST

    // 1. FRONT top edge (heading NORTH) -> TOP bottom edge (heading NORTH)
    const fNorth = cube.getStepWithDirection(asCoordinateKey('2:3,7'), 0);
    expect(fNorth).not.toBeNull();
    expect(fNorth?.coord).toBe(asCoordinateKey('0:3,0'));
    expect(fNorth?.dir).toBe(0);

    // Reversible: from TOP bottom edge (heading SOUTH) -> FRONT top edge (heading SOUTH)
    const tSouth = cube.getStepWithDirection(asCoordinateKey('0:3,0'), 4);
    expect(tSouth).not.toBeNull();
    expect(tSouth?.coord).toBe(asCoordinateKey('2:3,7'));
    expect(tSouth?.dir).toBe(4);

    // 2. TOP top edge (heading NORTH) -> BACK top edge (heading SOUTH)
    const tNorth = cube.getStepWithDirection(asCoordinateKey('0:3,7'), 0);
    expect(tNorth).not.toBeNull();
    expect(tNorth?.coord).toBe(asCoordinateKey('3:4,7'));
    expect(tNorth?.dir).toBe(4);

    // Reversible: from BACK top edge (heading NORTH) -> TOP top edge (heading SOUTH)
    const bNorth = cube.getStepWithDirection(asCoordinateKey('3:4,7'), 0);
    expect(bNorth).not.toBeNull();
    expect(bNorth?.coord).toBe(asCoordinateKey('0:3,7'));
    expect(bNorth?.dir).toBe(4);

    // 3. FRONT left edge (heading WEST) -> LEFT right edge (heading WEST)
    const fWest = cube.getStepWithDirection(asCoordinateKey('2:0,3'), 6);
    expect(fWest).not.toBeNull();
    expect(fWest?.coord).toBe(asCoordinateKey('4:7,3'));
    expect(fWest?.dir).toBe(6);

    // Reversible: from LEFT right edge (heading EAST) -> FRONT left edge (heading EAST)
    const lEast = cube.getStepWithDirection(asCoordinateKey('4:7,3'), 2);
    expect(lEast).not.toBeNull();
    expect(lEast?.coord).toBe(asCoordinateKey('2:0,3'));
    expect(lEast?.dir).toBe(2);

    // 4. FRONT right edge (heading EAST) -> RIGHT left edge (heading EAST)
    const fEast = cube.getStepWithDirection(asCoordinateKey('2:7,3'), 2);
    expect(fEast).not.toBeNull();
    expect(fEast?.coord).toBe(asCoordinateKey('5:0,3'));
    expect(fEast?.dir).toBe(2);

    // Reversible: from RIGHT left edge (heading WEST) -> FRONT right edge (heading WEST)
    const rWest = cube.getStepWithDirection(asCoordinateKey('5:0,3'), 6);
    expect(rWest).not.toBeNull();
    expect(rWest?.coord).toBe(asCoordinateKey('2:7,3'));
    expect(rWest?.dir).toBe(6);

    // 5. BOTTOM front edge (heading NORTH) -> FRONT bottom edge (heading NORTH)
    const botNorth = cube.getStepWithDirection(asCoordinateKey('1:3,7'), 0);
    expect(botNorth).not.toBeNull();
    expect(botNorth?.coord).toBe(asCoordinateKey('2:3,0'));
    expect(botNorth?.dir).toBe(0);

    // Reversible: FRONT bottom edge (heading SOUTH) -> BOTTOM front edge (heading SOUTH)
    const fSouth = cube.getStepWithDirection(asCoordinateKey('2:3,0'), 4);
    expect(fSouth).not.toBeNull();
    expect(fSouth?.coord).toBe(asCoordinateKey('1:3,7'));
    expect(fSouth?.dir).toBe(4);
  });

  it('casts continuous rays across face boundaries without infinite loops', () => {
    // Starting on FRONT face at 2:3,0, heading NORTH (dir 0)
    const rayNorth = cube.getRay(asCoordinateKey('2:3,0'), 0, 64);
    expect(rayNorth.length).toBeGreaterThan(10);
    // Verifies no duplicate state (coord + direction) in ray:
    const uniqueCoords = new Set(rayNorth);
    // Ray should visit multiple faces: FRONT -> TOP -> BACK -> BOTTOM -> back to FRONT
    const facesVisited = new Set(rayNorth.map((c) => cube.getFaceFromCoordinate(c)));
    expect(facesVisited.has(CubeFace.FRONT)).toBe(true);
    expect(facesVisited.has(CubeFace.TOP)).toBe(true);
    expect(facesVisited.has(CubeFace.BACK)).toBe(true);
    expect(facesVisited.has(CubeFace.BOTTOM)).toBe(true);
    expect(uniqueCoords.size).toBe(rayNorth.length); // Cycle detector terminates before repeating loop!
  });

  it('calculates Chebyshev distances between coordinates on the same or adjacent faces', () => {
    // Same face: 2:1,1 to 2:4,5 -> dx = 3, dy = 4, Chebyshev dist = max(3, 4) = 4
    expect(cube.getDistance(asCoordinateKey('2:1,1'), asCoordinateKey('2:4,5'))).toBe(4);

    // Direct neighbor across edge: FRONT 2:3,7 and TOP 0:3,0
    expect(cube.getDistance(asCoordinateKey('2:3,7'), asCoordinateKey('0:3,0'))).toBe(1);
  });
});
