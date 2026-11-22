/**
 * StauntonPieceGeometries.ts
 *
 * Procedural high-fidelity Staunton 3D chess piece geometries and cache.
 * Conforms to Spec 07 § 4, § 5, RF-01, RF-07 & Spec 12 RNF-01 / RNF-13:
 * - 100% offline procedural construction via THREE.LatheGeometry and THREE.ExtrudeGeometry.
 * - Thousands of polygons per piece with mathematical Catmull-Rom spline curvature and 64 radial segments.
 * - Zero network egress, zero heavy external GLTF assets, instantaneous loading.
 * - Shared static geometry caching prevents GC pressure and memory leaks (Spec 07 § 6).
 */

import * as THREE from 'three';

/**
 * Samples a continuous SplineCurve smoothly with high vertex density.
 */
function sampleSpline(points: [number, number][], subdivisions: number = 60): THREE.Vector2[] {
  const vPoints = points.map(([x, y]) => new THREE.Vector2(x, y));
  const curve = new THREE.SplineCurve(vPoints);
  return curve.getPoints(subdivisions);
}

class StauntonGeometriesCache {
  private basePedestal: THREE.BufferGeometry | null = null;
  private pawnStemHead: THREE.BufferGeometry | null = null;
  private rookBodyTurret: THREE.BufferGeometry | null = null;
  private rookMerlons: THREE.BufferGeometry | null = null;
  private knightHead: THREE.BufferGeometry | null = null;
  private knightMane: THREE.BufferGeometry | null = null;
  private knightEye: THREE.BufferGeometry | null = null;
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
   * Universal Turned Championship Pedestal (High-Poly LatheGeometry)
   * Multi-tiered championship tournament pedestal:
   * - Bottom felt pad recess
   * - Stepped lower plinth
   * - Gracefully swept concave scotia cove
   * - Dual beaded torus collar with crisp under-cut shelf
   */
  public getBasePedestal(): THREE.BufferGeometry {
    if (!this.basePedestal) {
      const splinePoints = sampleSpline(
        [
          [0.0, 0.0],
          [0.42, 0.0],
          [0.425, 0.018],
          [0.41, 0.038],
          [0.38, 0.06],
          [0.34, 0.09],
          [0.30, 0.13],
          [0.27, 0.165],
          [0.28, 0.185],
          [0.315, 0.20],
          [0.32, 0.215],
          [0.285, 0.228],
          [0.325, 0.24],
          [0.31, 0.25],
          [0.25, 0.25],
          [0.0, 0.25],
        ],
        64
      );
      const geom = new THREE.LatheGeometry(splinePoints, 64);
      geom.computeVertexNormals();
      this.basePedestal = geom;
    }
    return this.basePedestal;
  }

  /**
   * Staunton Pawn: Slender tapering concave stem, crisp collar groove, and polished spherical head.
   */
  public getPawnStemHead(): THREE.BufferGeometry {
    if (!this.pawnStemHead) {
      const splinePoints = sampleSpline(
        [
          [0.0, 0.25],
          [0.23, 0.25],
          [0.19, 0.31],
          [0.15, 0.38],
          [0.125, 0.46],
          [0.12, 0.52],
          [0.135, 0.56],
          [0.17, 0.59],
          [0.22, 0.61],
          [0.225, 0.625],
          [0.15, 0.638],
          // Spherical head profile
          [0.16, 0.665],
          [0.195, 0.71],
          [0.215, 0.77],
          [0.218, 0.82],
          [0.20, 0.87],
          [0.16, 0.92],
          [0.10, 0.955],
          [0.04, 0.975],
          [0.0, 0.98],
        ],
        70
      );
      const geom = new THREE.LatheGeometry(splinePoints, 64);
      geom.computeVertexNormals();
      this.pawnStemHead = geom;
    }
    return this.pawnStemHead;
  }

  /**
   * Staunton Rook Body: Tapered castle tower with entasis, flared capital, and hollow parapet.
   */
  public getRookBody(): THREE.BufferGeometry {
    if (!this.rookBodyTurret) {
      const splinePoints = sampleSpline(
        [
          [0.0, 0.25],
          [0.25, 0.25],
          [0.23, 0.34],
          [0.215, 0.45],
          [0.21, 0.55],
          [0.22, 0.63],
          [0.245, 0.67],
          [0.285, 0.70],
          [0.32, 0.73],
          [0.32, 0.86],
          [0.24, 0.86],
          [0.24, 0.78],
          [0.0, 0.78],
        ],
        60
      );
      const geom = new THREE.LatheGeometry(splinePoints, 64);
      geom.computeVertexNormals();
      this.rookBodyTurret = geom;
    }
    return this.rookBodyTurret;
  }

  /**
   * Staunton Rook Merlons: Castellated battlements on the top rim.
   */
  public getRookMerlon(): THREE.BufferGeometry {
    if (!this.rookMerlons) {
      const geom = new THREE.BoxGeometry(0.11, 0.09, 0.09);
      this.rookMerlons = geom;
    }
    return this.rookMerlons;
  }

  /**
   * Staunton Knight: Master Sculpted Horse Head with anatomical dorsal arch, alert ears,
   * curved muzzle, defined nostrils, and parted mouth.
   */
  public getKnightHead(): THREE.BufferGeometry {
    if (!this.knightHead) {
      const shape = new THREE.Shape();
      shape.moveTo(-0.25, 0.25);
      // Muscular arched dorsal neck
      shape.bezierCurveTo(-0.37, 0.44, -0.37, 0.72, -0.24, 0.94);
      // Alert pointed ear crest
      shape.bezierCurveTo(-0.19, 1.05, -0.09, 1.14, -0.02, 1.11);
      // Ear notch down to crown
      shape.bezierCurveTo(0.03, 1.09, 0.07, 1.00, 0.14, 0.97);
      // Brow ridge and nasal bridge
      shape.bezierCurveTo(0.22, 0.94, 0.33, 0.83, 0.41, 0.71);
      // Nostril flare and upper lip
      shape.bezierCurveTo(0.46, 0.64, 0.45, 0.58, 0.39, 0.56);
      // Mouth cleft
      shape.bezierCurveTo(0.32, 0.55, 0.26, 0.58, 0.20, 0.60);
      // Lower jaw and chin
      shape.bezierCurveTo(0.14, 0.61, 0.09, 0.55, 0.12, 0.49);
      // Proud arched chest down to pedestal
      shape.bezierCurveTo(0.23, 0.41, 0.28, 0.33, 0.24, 0.25);
      shape.closePath();

      const depth = 0.19;
      const extrudeSettings: THREE.ExtrudeGeometryOptions = {
        depth,
        bevelEnabled: true,
        bevelSegments: 8,
        steps: 3,
        bevelSize: 0.052,
        bevelThickness: 0.052,
      };

      const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      geom.translate(0, 0, -depth / 2);
      geom.computeVertexNormals();
      this.knightHead = geom;
    }
    return this.knightHead;
  }

  /**
   * Staunton Knight Dorsal Mane: Multi-tufted flowing spine carved in relief.
   */
  public getKnightMane(): THREE.BufferGeometry {
    if (!this.knightMane) {
      const mane = new THREE.Shape();
      mane.moveTo(-0.22, 0.28);
      mane.bezierCurveTo(-0.35, 0.46, -0.40, 0.65, -0.32, 0.82);
      mane.lineTo(-0.27, 0.85);
      mane.bezierCurveTo(-0.31, 0.94, -0.26, 1.02, -0.16, 1.06);
      mane.lineTo(-0.09, 1.04);
      mane.bezierCurveTo(-0.21, 0.84, -0.23, 0.54, -0.15, 0.28);
      mane.closePath();

      const depth = 0.085;
      const geom = new THREE.ExtrudeGeometry(mane, {
        depth,
        bevelEnabled: true,
        bevelSegments: 6,
        steps: 2,
        bevelSize: 0.026,
        bevelThickness: 0.032,
      });
      geom.translate(0, 0, -depth / 2);
      geom.computeVertexNormals();
      this.knightMane = geom;
    }
    return this.knightMane;
  }

  /**
   * Knight Eye: Sculpted almond sphere for lifelike expression.
   */
  public getKnightEye(): THREE.BufferGeometry {
    if (!this.knightEye) {
      const geom = new THREE.SphereGeometry(0.026, 16, 16);
      geom.scale(1.3, 0.8, 0.8);
      this.knightEye = geom;
    }
    return this.knightEye;
  }

  /**
   * Staunton Bishop Mitre: Slender waist, graceful collar and flame-shaped mitre bulb.
   */
  public getBishopMitre(): THREE.BufferGeometry {
    if (!this.bishopMitre) {
      const splinePoints = sampleSpline(
        [
          [0.0, 0.25],
          [0.24, 0.25],
          [0.18, 0.34],
          [0.145, 0.45],
          [0.13, 0.55],
          [0.15, 0.64],
          [0.19, 0.69],
          [0.235, 0.71],
          [0.24, 0.73],
          [0.17, 0.745],
          // Mitre flame bulb
          [0.18, 0.77],
          [0.225, 0.85],
          [0.235, 0.93],
          [0.215, 1.01],
          [0.165, 1.09],
          [0.09, 1.15],
          [0.03, 1.18],
          [0.0, 1.19],
        ],
        70
      );
      const geom = new THREE.LatheGeometry(splinePoints, 64);
      geom.computeVertexNormals();
      this.bishopMitre = geom;
    }
    return this.bishopMitre;
  }

  public getBishopOrb(): THREE.BufferGeometry {
    if (!this.bishopOrb) {
      const geom = new THREE.SphereGeometry(0.054, 32, 32);
      this.bishopOrb = geom;
    }
    return this.bishopOrb;
  }

  /**
   * Staunton Queen Body: Majestic curved hourglass column with dual royal collar.
   */
  public getQueenBody(): THREE.BufferGeometry {
    if (!this.queenBody) {
      const splinePoints = sampleSpline(
        [
          [0.0, 0.25],
          [0.27, 0.25],
          [0.22, 0.36],
          [0.175, 0.49],
          [0.155, 0.63],
          [0.18, 0.73],
          [0.235, 0.77],
          [0.255, 0.80],
          [0.19, 0.82],
          [0.22, 0.85],
          [0.265, 0.94],
          [0.295, 1.02],
          [0.23, 1.05],
          [0.11, 1.07],
          [0.0, 1.07],
        ],
        70
      );
      const geom = new THREE.LatheGeometry(splinePoints, 64);
      geom.computeVertexNormals();
      this.queenBody = geom;
    }
    return this.queenBody;
  }

  public getQueenCoronet(): THREE.BufferGeometry {
    if (!this.queenCoronet) {
      const geom = new THREE.CylinderGeometry(0.30, 0.23, 0.12, 48);
      this.queenCoronet = geom;
    }
    return this.queenCoronet;
  }

  public getQueenOrb(): THREE.BufferGeometry {
    if (!this.queenOrb) {
      const geom = new THREE.SphereGeometry(0.07, 32, 32);
      this.queenOrb = geom;
    }
    return this.queenOrb;
  }

  /**
   * Staunton King Body: Imperial thick column with majestic stepped capital.
   */
  public getKingBody(): THREE.BufferGeometry {
    if (!this.kingBody) {
      const splinePoints = sampleSpline(
        [
          [0.0, 0.25],
          [0.29, 0.25],
          [0.24, 0.38],
          [0.195, 0.53],
          [0.185, 0.68],
          [0.205, 0.80],
          [0.26, 0.85],
          [0.285, 0.89],
          [0.22, 0.91],
          [0.25, 0.95],
          [0.295, 1.04],
          [0.31, 1.12],
          [0.22, 1.15],
          [0.0, 1.15],
        ],
        70
      );
      const geom = new THREE.LatheGeometry(splinePoints, 64);
      geom.computeVertexNormals();
      this.kingBody = geom;
    }
    return this.kingBody;
  }

  public getKingCrown(): THREE.BufferGeometry {
    if (!this.kingCrown) {
      const geom = new THREE.CylinderGeometry(0.29, 0.22, 0.13, 48);
      this.kingCrown = geom;
    }
    return this.kingCrown;
  }

  public getKingCrossVertical(): THREE.BufferGeometry {
    if (!this.kingCrossV) {
      const geom = new THREE.BoxGeometry(0.052, 0.23, 0.052);
      this.kingCrossV = geom;
    }
    return this.kingCrossV;
  }

  public getKingCrossHorizontal(): THREE.BufferGeometry {
    if (!this.kingCrossH) {
      const geom = new THREE.BoxGeometry(0.17, 0.052, 0.052);
      this.kingCrossH = geom;
    }
    return this.kingCrossH;
  }

  /**
   * Duck Chess: Rubber Duck Body, Head and Beak.
   */
  public getDuckBody(): THREE.BufferGeometry {
    if (!this.duckBody) {
      const geom = new THREE.SphereGeometry(0.28, 24, 24);
      geom.scale(1.0, 0.75, 1.25);
      this.duckBody = geom;
    }
    return this.duckBody;
  }

  public getDuckHead(): THREE.BufferGeometry {
    if (!this.duckHead) {
      const geom = new THREE.SphereGeometry(0.18, 24, 24);
      this.duckHead = geom;
    }
    return this.duckHead;
  }

  public getDuckBeak(): THREE.BufferGeometry {
    if (!this.duckBeak) {
      const geom = new THREE.ConeGeometry(0.09, 0.18, 16);
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
      const geom = new THREE.CylinderGeometry(0.12, 0.16, 0.65, 24);
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
      const geom = new THREE.OctahedronGeometry(0.22, 1);
      this.fairyCrystal = geom;
    }
    return this.fairyCrystal;
  }
}

export const stauntonGeometries = new StauntonGeometriesCache();
