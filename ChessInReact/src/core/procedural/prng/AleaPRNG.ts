/**
 * Johannes Baagøe's Alea PRNG algorithm.
 * Deterministic pseudo-random number generator parameterized by a seed string (Spec 02 Section 8.2).
 * Guarantees identical sequence generation across all JavaScript engines and CPU architectures.
 */
export class AleaPRNG {
  private s0: number;
  private s1: number;
  private s2: number;
  private c: number;

  constructor(seed: string | number = 'chess-seed-0') {
    const seedStr = String(seed);
    let n = 0xefc8249d;

    const mash = (data: string): number => {
      for (let i = 0; i < data.length; i++) {
        n += data.charCodeAt(i);
        let h = 0.02519603282416938 * n;
        n = h >>> 0;
        h -= n;
        h *= n;
        n = h >>> 0;
        h -= n;
        n += h * 0x100000000; // 2^32
      }
      return (n >>> 0) * 2.3283064365386963e-10; // 2^-32
    };

    this.c = 1;
    this.s0 = mash(' ');
    this.s1 = mash(' ');
    this.s2 = mash(' ');

    this.s0 -= mash(seedStr);
    if (this.s0 < 0) this.s0 += 1;
    this.s1 -= mash(seedStr);
    if (this.s1 < 0) this.s1 += 1;
    this.s2 -= mash(seedStr);
    if (this.s2 < 0) this.s2 += 1;
  }

  /** Returns deterministic float in [0, 1) */
  public next(): number {
    const t = 2091639 * this.s0 + this.c * 2.3283064365386963e-10; // 2^-32
    this.s0 = this.s1;
    this.s1 = this.s2;
    this.c = t | 0;
    this.s2 = t - this.c;
    return this.s2;
  }

  /** Returns integer in range [min, max] inclusive */
  public nextInt(min: number, max: number): number {
    return Math.floor(min + this.next() * (max - min + 1));
  }
}
