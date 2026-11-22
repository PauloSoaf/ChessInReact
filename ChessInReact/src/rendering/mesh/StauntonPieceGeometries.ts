/**
 * StauntonPieceGeometries.ts
 *
 * Procedural high-fidelity Staunton 3D chess piece geometries and cache.
 * Conforms to Spec 07 § 4, § 5, RF-01, RF-07 & Spec 12 RNF-01 / RNF-13:
 * - 100% offline procedural construction via THREE.LatheGeometry and THREE.ExtrudeGeometry.
 * - Zero network egress, zero heavy external GLTF assets, instantaneous loading.
 * - Shared static geometry caching prevents GC pressure and memory leaks (Spec 07 § 6).
 */

import * as THREE from 'three';

class StauntonGeometriesCache {
  private basePedestal: THREE.BufferGeometry | null = null;
  private pawnStemHead: THREE.BufferGeometry | null = null;
  private rookBodyTurret: THREE.BufferGeometry | null = null;
  private rookMerlons: THREE.BufferGeometry | null = null;
  private knightHead: THREE.BufferGeometry | null = null;
  private knightMane: THREE.BufferGeometry | null = null;
  private bishopMitre: THREE.BufferGeometry | null = null;
  private bishopOrb: THREE.BufferGeometry | null = null;
  private queenBody: THREE.BufferGeometry | null = null;
  private queenCoronet: THREE.BufferGeometry | null = null;
  private queenOrb: THREE.BufferGeometry | null = null;
  private kingBody: THREE.BufferGeometry | null = null;
  private kingCrown: THREE.BufferGeometry | null = null;
  private kingCrossV: THREE.BufferGeometry | null = null;
  private kingCrossH: THREE.BufferGeometry | null = null;
  private duckBody: THREE.BufferGeometry | null = null;
  private duckHead: THREE.BufferGeometry | null = null;
  private duckBeak: THREE.BufferGeometry | null = null;
  private cannonBarrel: THREE.BufferGeometry | null = null;
  private fairyCrystal: THREE.BufferGeometry | null = null;

  /**
   * Universal Turned Championship Pedestal (LatheGeometry)
   * High-definition multi-tiered championship pedestal with bottom felt recess,
   * smooth concave scotia waist, and dual beaded torus collar.
   */
  public getBasePedestal(): THREE.BufferGeometry {
    if (!this.basePedestal) {
      const points: THREE.Vector2[] = [
        new THREE.Vector2(0.0, 0.0),
        new THREE.Vector2(0.40, 0.0),
        new THREE.Vector2(0.41, 0.015),
        new THREE.Vector2(0.40, 0.035),
        new THREE.Vector2(0.38, 0.05),
        new THREE.Vector2(0.35, 0.07),
        new THREE.Vector2(0.32, 0.09),
        new THREE.Vector2(0.29, 0.12),
        new THREE.Vector2(0.27, 0.15),
        new THREE.Vector2(0.26, 0.18),
        new THREE.Vector2(0.28, 0.20),
        new THREE.Vector2(0.31, 0.215),
        new THREE.Vector2(0.32, 0.23),
        new THREE.Vector2(0.29, 0.245),
        new THREE.Vector2(0.25, 0.25),
        new THREE.Vector2(0.0, 0.25),
      ];
      const geom = new THREE.LatheGeometry(points, 48);
      geom.computeVertexNormals();
      this.basePedestal = geom;
    }
    return this.basePedestal;
  }

  /**
   * Staunton Pawn: Slender concave stem, pronounced collar groove, and polished spherical head.
   */
  public getPawnStemHead(): THREE.BufferGeometry {
    if (!this.pawnStemHead) {
      const points: THREE.Vector2[] = [
        new THREE.Vector2(0.0, 0.25),
        new THREE.Vector2(0.23, 0.25),
        new THREE.Vector2(0.19, 0.30),
        new THREE.Vector2(0.15, 0.36),
        new THREE.Vector2(0.13, 0.43),
        new THREE.Vector2(0.12, 0.49),
        new THREE.Vector2(0.13, 0.54),
        new THREE.Vector2(0.16, 0.58),
        new THREE.Vector2(0.21, 0.60),
        new THREE.Vector2(0.22, 0.62),
        new THREE.Vector2(0.15, 0.635),
        // Spherical head profile
        new THREE.Vector2(0.16, 0.66),
        new THREE.Vector2(0.19, 0.70),
        new THREE.Vector2(0.21, 0.75),
        new THREE.Vector2(0.215, 0.80),
        new THREE.Vector2(0.20, 0.85),
        new THREE.Vector2(0.16, 0.90),
        new THREE.Vector2(0.11, 0.94),
        new THREE.Vector2(0.05, 0.965),
        new THREE.Vector2(0.0, 0.97),
      ];
      const geom = new THREE.LatheGeometry(points, 48);
      geom.computeVertexNormals();
      this.pawnStemHead = geom;
    }
    return this.pawnStemHead;
  }

  /**
   * Staunton Rook Body: Tapered castle tower, flared upper capital, and hollow parapet.
   */
  public getRookBody(): THREE.BufferGeometry {
    if (!this.rookBodyTurret) {
      const points: THREE.Vector2[] = [
        new THREE.Vector2(0.0, 0.25),
        new THREE.Vector2(0.25, 0.25),
        new THREE.Vector2(0.23, 0.32),
        new THREE.Vector2(0.21, 0.42),
        new THREE.Vector2(0.20, 0.52),
        new THREE.Vector2(0.21, 0.60),
        new THREE.Vector2(0.23, 0.65),
        new THREE.Vector2(0.27, 0.68),
        new THREE.Vector2(0.31, 0.70),
        new THREE.Vector2(0.31, 0.84),
        new THREE.Vector2(0.23, 0.84),
        new THREE.Vector2(0.23, 0.76),
        new THREE.Vector2(0.0, 0.76),
      ];
      const geom = new THREE.LatheGeometry(points, 48);
      geom.computeVertexNormals();
      this.rookBodyTurret = geom;
    }
    return this.rookBodyTurret;
  }

  /**
   * Staunton Rook Merlons: 4 castellated embrasures on the top rim.
   */
  public getRookMerlon(): THREE.BufferGeometry {
    if (!this.rookMerlons) {
      const geom = new THREE.BoxGeometry(0.1, 0.08, 0.08);
      this.rookMerlons = geom;
    }
    return this.rookMerlons;
  }

  /**
   * Staunton Knight: Master Sculpted Horse Head with arched neck, jaw, muzzle, and ears.
   */
  public getKnightHead(): THREE.BufferGeometry {
    if (!this.knightHead) {
      const shape = new THREE.Shape();
      shape.moveTo(-0.24, 0.25);
      // Muscular arched dorsal neck
      shape.bezierCurveTo(-0.35, 0.45, -0.34, 0.72, -0.22, 0.94);
      // Crown behind ears
      shape.bezierCurveTo(-0.16, 1.02, -0.08, 1.06, 0.0, 1.05);
      // Nasal bridge & muzzle slope
      shape.bezierCurveTo(0.10, 1.02, 0.22, 0.90, 0.36, 0.78);
      // Nostril flare & upper lip
      shape.bezierCurveTo(0.44, 0.72, 0.48, 0.66, 0.46, 0.61);
      shape.bezierCurveTo(0.44, 0.56, 0.38, 0.54, 0.32, 0.55);
      // Mouth cleft & lower jaw
      shape.lineTo(0.26, 0.58);
      shape.bezierCurveTo(0.20, 0.54, 0.14, 0.55, 0.10, 0.59);
      // Deep throat undercut
      shape.bezierCurveTo(0.06, 0.62, 0.05, 0.56, 0.10, 0.50);
      // Proud arched chest down to pedestal
      shape.bezierCurveTo(0.20, 0.42, 0.25, 0.34, 0.22, 0.25);
      shape.closePath();

      const depth = 0.18;
      const extrudeSettings: THREE.ExtrudeGeometryOptions = {
        depth,
        bevelEnabled: true,
        bevelSegments: 6,
        steps: 2,
        bevelSize: 0.052,
        bevelThickness: 0.055,
      };

      const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      geom.translate(0, 0, -depth / 2);
      geom.computeVertexNormals();
      this.knightHead = geom;
    }
    return this.knightHead;
  }

  /**
   * Staunton Knight Dorsal Mane: 3D carved relief spine.
   */
  public getKnightMane(): THREE.BufferGeometry {
    if (!this.knightMane) {
      const mane = new THREE.Shape();
      mane.moveTo(-0.21, 0.28);
      mane.bezierCurveTo(-0.34, 0.46, -0.38, 0.64, -0.31, 0.80);
      mane.lineTo(-0.26, 0.83);
      mane.bezierCurveTo(-0.30, 0.92, -0.25, 1.00, -0.16, 1.04);
      mane.lineTo(-0.09, 1.02);
      mane.bezierCurveTo(-0.20, 0.82, -0.22, 0.52, -0.14, 0.28);
      mane.closePath();

      const depth = 0.08;
      const geom = new THREE.ExtrudeGeometry(mane, {
        depth,
        bevelEnabled: true,
        bevelSegments: 5,
        steps: 2,
        bevelSize: 0.025,
        bevelThickness: 0.03,
      });
      geom.translate(0, 0, -depth / 2);
      geom.computeVertexNormals();
      this.knightMane = geom;
    }
    return this.knightMane;
  }

  /**
   * Staunton Bishop Mitre: Slender waist, graceful collar and flame-shaped mitre bulb.
   */
  public getBishopMitre(): THREE.BufferGeometry {
    if (!this.bishopMitre) {
      const points: THREE.Vector2[] = [
        new THREE.Vector2(0.0, 0.25),
        new THREE.Vector2(0.24, 0.25),
        new THREE.Vector2(0.18, 0.33),
        new THREE.Vector2(0.15, 0.44),
        new THREE.Vector2(0.13, 0.54),
        new THREE.Vector2(0.15, 0.63),
        new THREE.Vector2(0.19, 0.68),
        new THREE.Vector2(0.23, 0.70),
        new THREE.Vector2(0.24, 0.72),
        new THREE.Vector2(0.17, 0.735),
        // Mitre flame bulb
        new THREE.Vector2(0.18, 0.76),
        new THREE.Vector2(0.22, 0.84),
        new THREE.Vector2(0.23, 0.92),
        new THREE.Vector2(0.21, 1.00),
        new THREE.Vector2(0.16, 1.08),
        new THREE.Vector2(0.09, 1.14),
        new THREE.Vector2(0.03, 1.17),
        new THREE.Vector2(0.0, 1.18),
      ];
      const geom = new THREE.LatheGeometry(points, 48);
      geom.computeVertexNormals();
      this.bishopMitre = geom;
    }
    return this.bishopMitre;
  }

  public getBishopOrb(): THREE.BufferGeometry {
    if (!this.bishopOrb) {
      const geom = new THREE.SphereGeometry(0.052, 24, 24);
      this.bishopOrb = geom;
    }
    return this.bishopOrb;
  }

  /**
   * Staunton Queen Body: Majestic curved column with dual royal collar.
   */
  public getQueenBody(): THREE.BufferGeometry {
    if (!this.queenBody) {
      const points: THREE.Vector2[] = [
        new THREE.Vector2(0.0, 0.25),
        new THREE.Vector2(0.27, 0.25),
        new THREE.Vector2(0.22, 0.35),
        new THREE.Vector2(0.18, 0.48),
        new THREE.Vector2(0.16, 0.62),
        new THREE.Vector2(0.18, 0.72),
        new THREE.Vector2(0.23, 0.76),
        new THREE.Vector2(0.25, 0.79),
        new THREE.Vector2(0.19, 0.81),
        new THREE.Vector2(0.22, 0.84),
        new THREE.Vector2(0.26, 0.93),
        new THREE.Vector2(0.29, 1.01),
        new THREE.Vector2(0.23, 1.04),
        new THREE.Vector2(0.11, 1.06),
        new THREE.Vector2(0.0, 1.06),
      ];
      const geom = new THREE.LatheGeometry(points, 48);
      geom.computeVertexNormals();
      this.queenBody = geom;
    }
    return this.queenBody;
  }

  public getQueenCoronet(): THREE.BufferGeometry {
    if (!this.queenCoronet) {
      const geom = new THREE.CylinderGeometry(0.29, 0.23, 0.12, 32);
      this.queenCoronet = geom;
    }
    return this.queenCoronet;
  }

  public getQueenOrb(): THREE.BufferGeometry {
    if (!this.queenOrb) {
      const geom = new THREE.SphereGeometry(0.068, 24, 24);
      this.queenOrb = geom;
    }
    return this.queenOrb;
  }

  /**
   * Staunton King Body: Imperial thick column with majestic capital.
   */
  public getKingBody(): THREE.BufferGeometry {
    if (!this.kingBody) {
      const points: THREE.Vector2[] = [
        new THREE.Vector2(0.0, 0.25),
        new THREE.Vector2(0.29, 0.25),
        new THREE.Vector2(0.24, 0.37),
        new THREE.Vector2(0.20, 0.52),
        new THREE.Vector2(0.19, 0.67),
        new THREE.Vector2(0.21, 0.79),
        new THREE.Vector2(0.26, 0.84),
        new THREE.Vector2(0.28, 0.88),
        new THREE.Vector2(0.22, 0.90),
        new THREE.Vector2(0.25, 0.94),
        new THREE.Vector2(0.29, 1.03),
        new THREE.Vector2(0.30, 1.11),
        new THREE.Vector2(0.22, 1.14),
        new THREE.Vector2(0.0, 1.14),
      ];
      const geom = new THREE.LatheGeometry(points, 48);
      geom.computeVertexNormals();
      this.kingBody = geom;
    }
    return this.kingBody;
  }

  public getKingCrown(): THREE.BufferGeometry {
    if (!this.kingCrown) {
      const geom = new THREE.CylinderGeometry(0.28, 0.22, 0.13, 32);
      this.kingCrown = geom;
    }
    return this.kingCrown;
  }

  public getKingCrossVertical(): THREE.BufferGeometry {
    if (!this.kingCrossV) {
      const geom = new THREE.BoxGeometry(0.05, 0.22, 0.05);
      this.kingCrossV = geom;
    }
    return this.kingCrossV;
  }

  public getKingCrossHorizontal(): THREE.BufferGeometry {
    if (!this.kingCrossH) {
      const geom = new THREE.BoxGeometry(0.16, 0.05, 0.05);
      this.kingCrossH = geom;
    }
    return this.kingCrossH;
  }

  /**
   * Duck Chess: Rubber Duck Body, Head and Beak.
   */
  public getDuckBody(): THREE.BufferGeometry {
    if (!this.duckBody) {
      const geom = new THREE.SphereGeometry(0.28, 16, 16);
      geom.scale(1.0, 0.75, 1.25);
      this.duckBody = geom;
    }
    return this.duckBody;
  }

  public getDuckHead(): THREE.BufferGeometry {
    if (!this.duckHead) {
      const geom = new THREE.SphereGeometry(0.18, 16, 16);
      this.duckHead = geom;
    }
    return this.duckHead;
  }

  public getDuckBeak(): THREE.BufferGeometry {
    if (!this.duckBeak) {
      const geom = new THREE.ConeGeometry(0.09, 0.18, 12);
      geom.rotateX(Math.PI / 2);
      this.duckBeak = geom;
    }
    return this.duckBeak;
  }

  /**
   * Xiangqi / Mod Cannon: Bronze Lathed Barrel.
   */
  public getCannonBarrel(): THREE.BufferGeometry {
    if (!this.cannonBarrel) {
      const geom = new THREE.CylinderGeometry(0.12, 0.16, 0.65, 16);
      geom.rotateZ(Math.PI / 2);
      this.cannonBarrel = geom;
    }
    return this.cannonBarrel;
  }

  /**
   * Fairy Crystal for Exotic / Mythical Variants.
   */
  public getFairyCrystal(): THREE.BufferGeometry {
    if (!this.fairyCrystal) {
      const geom = new THREE.OctahedronGeometry(0.22, 0);
      this.fairyCrystal = geom;
    }
    return this.fairyCrystal;
  }
}

export const stauntonGeometries = new StauntonGeometriesCache();

