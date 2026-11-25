import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { stauntonGeometries } from '../StauntonPieceGeometries';

describe('Spec 07 § 4, § 5, § 6 - StauntonPieceGeometries Procedural Cache', () => {
  beforeEach(() => {
    stauntonGeometries.dispose();
  });

  it('procedurally generates universal base pedestal with vertex normals', () => {
    const pedestal = stauntonGeometries.getBasePedestal();
    expect(pedestal).toBeInstanceOf(THREE.BufferGeometry);
    expect(pedestal.getAttribute('position')).toBeDefined();
    expect(pedestal.getAttribute('normal')).toBeDefined();
    expect(pedestal.getAttribute('position').count).toBeGreaterThan(100);

    // Verifies cache returns identical reference
    const cached = stauntonGeometries.getBasePedestal();
    expect(cached).toBe(pedestal);
  });

  it('generates pawn stem and head with smooth Catmull-Rom lathe curves', () => {
    const pawnGeom = stauntonGeometries.getPawnStemHead();
    expect(pawnGeom).toBeInstanceOf(THREE.BufferGeometry);
    expect(pawnGeom.getAttribute('position').count).toBeGreaterThan(200);

    const cached = stauntonGeometries.getPawnStemHead();
    expect(cached).toBe(pawnGeom);
  });

  it('generates rook body and crenellated merlons', () => {
    const rookBody = stauntonGeometries.getRookBody();
    const rookMerlons = stauntonGeometries.getRookMerlon();

    expect(rookBody).toBeInstanceOf(THREE.BufferGeometry);
    expect(rookMerlons).toBeInstanceOf(THREE.BufferGeometry);
    expect(rookBody.getAttribute('position').count).toBeGreaterThan(100);
    expect(rookMerlons.getAttribute('position').count).toBeGreaterThan(20);
  });

  it('generates knight extruded head, mane, and eye geometries', () => {
    const head = stauntonGeometries.getKnightHead();
    const mane = stauntonGeometries.getKnightMane();
    const eye = stauntonGeometries.getKnightEye();

    expect(head).toBeInstanceOf(THREE.BufferGeometry);
    expect(mane).toBeInstanceOf(THREE.BufferGeometry);
    expect(eye).toBeInstanceOf(THREE.BufferGeometry);

    expect(head.getAttribute('position').count).toBeGreaterThan(100);
  });

  it('generates bishop mitre and finial orb', () => {
    const mitre = stauntonGeometries.getBishopMitre();
    const orb = stauntonGeometries.getBishopOrb();

    expect(mitre).toBeInstanceOf(THREE.BufferGeometry);
    expect(orb).toBeInstanceOf(THREE.BufferGeometry);
  });

  it('generates queen fluted body, coronet, and pearl finial orb', () => {
    const body = stauntonGeometries.getQueenBody();
    const coronet = stauntonGeometries.getQueenCoronet();
    const orb = stauntonGeometries.getQueenOrb();

    expect(body).toBeInstanceOf(THREE.BufferGeometry);
    expect(coronet).toBeInstanceOf(THREE.BufferGeometry);
    expect(orb).toBeInstanceOf(THREE.BufferGeometry);
  });

  it('generates king imperial body, crown, and cross finials', () => {
    const body = stauntonGeometries.getKingBody();
    const crown = stauntonGeometries.getKingCrown();
    const crossV = stauntonGeometries.getKingCrossVertical();
    const crossH = stauntonGeometries.getKingCrossHorizontal();

    expect(body).toBeInstanceOf(THREE.BufferGeometry);
    expect(crown).toBeInstanceOf(THREE.BufferGeometry);
    expect(crossV).toBeInstanceOf(THREE.BufferGeometry);
    expect(crossH).toBeInstanceOf(THREE.BufferGeometry);
  });

  it('generates variant geometries: duck body, head, beak, cannon, and fairy crystal', () => {
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

  it('disposes all cached geometries and regenerates cleanly on demand', () => {
    const firstPedestal = stauntonGeometries.getBasePedestal();
    const firstPawn = stauntonGeometries.getPawnStemHead();

    stauntonGeometries.dispose();

    const secondPedestal = stauntonGeometries.getBasePedestal();
    const secondPawn = stauntonGeometries.getPawnStemHead();

    expect(secondPedestal).not.toBe(firstPedestal);
    expect(secondPawn).not.toBe(firstPawn);
    expect(secondPedestal).toBeInstanceOf(THREE.BufferGeometry);
    expect(secondPawn).toBeInstanceOf(THREE.BufferGeometry);
  });
});
