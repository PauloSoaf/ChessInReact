// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stauntonGeometries } from '../mesh/StauntonPieceGeometries';

describe('StauntonPieceGeometries Suite (Spec 07 § 4, § 5, RF-01, RF-07)', () => {
  it('generates and caches universal turned pedestal geometry via LatheGeometry', () => {
    const geom1 = stauntonGeometries.getBasePedestal();
    const geom2 = stauntonGeometries.getBasePedestal();

    expect(geom1).toBeInstanceOf(THREE.BufferGeometry);
    expect(geom1).toBe(geom2); // Verify singleton caching (Spec 07 § 6)
    expect(geom1.attributes.position.count).toBeGreaterThan(0);
  });

  it('generates and caches Pawn, Rook, Knight, Bishop, Queen, King geometries', () => {
    const pawn = stauntonGeometries.getPawnStemHead();
    const rook = stauntonGeometries.getRookBody();
    const merlon = stauntonGeometries.getRookMerlon();
    const knightHead = stauntonGeometries.getKnightHead();
    const knightMane = stauntonGeometries.getKnightMane();
    const bishopMitre = stauntonGeometries.getBishopMitre();
    const bishopOrb = stauntonGeometries.getBishopOrb();
    const queenBody = stauntonGeometries.getQueenBody();
    const queenCoronet = stauntonGeometries.getQueenCoronet();
    const queenOrb = stauntonGeometries.getQueenOrb();
    const kingBody = stauntonGeometries.getKingBody();
    const kingCrown = stauntonGeometries.getKingCrown();
    const kingCrossV = stauntonGeometries.getKingCrossVertical();
    const kingCrossH = stauntonGeometries.getKingCrossHorizontal();

    expect(pawn).toBeInstanceOf(THREE.BufferGeometry);
    expect(rook).toBeInstanceOf(THREE.BufferGeometry);
    expect(merlon).toBeInstanceOf(THREE.BufferGeometry);
    expect(knightHead).toBeInstanceOf(THREE.BufferGeometry);
    expect(knightMane).toBeInstanceOf(THREE.BufferGeometry);
    expect(bishopMitre).toBeInstanceOf(THREE.BufferGeometry);
    expect(bishopOrb).toBeInstanceOf(THREE.BufferGeometry);
    expect(queenBody).toBeInstanceOf(THREE.BufferGeometry);
    expect(queenCoronet).toBeInstanceOf(THREE.BufferGeometry);
    expect(queenOrb).toBeInstanceOf(THREE.BufferGeometry);
    expect(kingBody).toBeInstanceOf(THREE.BufferGeometry);
    expect(kingCrown).toBeInstanceOf(THREE.BufferGeometry);
    expect(kingCrossV).toBeInstanceOf(THREE.BufferGeometry);
    expect(kingCrossH).toBeInstanceOf(THREE.BufferGeometry);
  });

  it('generates Duck, Cannon and Fairy geometries', () => {
    const duckBody = stauntonGeometries.getDuckBody();
    const duckHead = stauntonGeometries.getDuckHead();
    const duckBeak = stauntonGeometries.getDuckBeak();
    const cannon = stauntonGeometries.getCannonBarrel();
    const crystal = stauntonGeometries.getFairyCrystal();

    expect(duckBody).toBeInstanceOf(THREE.BufferGeometry);
    expect(duckHead).toBeInstanceOf(THREE.BufferGeometry);
    expect(duckBeak).toBeInstanceOf(THREE.BufferGeometry);
    expect(cannon).toBeInstanceOf(THREE.BufferGeometry);
    expect(crystal).toBeInstanceOf(THREE.BufferGeometry);
  });
});

