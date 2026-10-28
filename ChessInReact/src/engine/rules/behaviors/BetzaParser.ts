import { IMoveBehavior } from './IMoveBehavior';
import { LeaperBehavior } from './LeaperBehavior';
import { SliderBehavior, SliderAxisType } from './SliderBehavior';
import { HopperBehavior } from './HopperBehavior';

/**
 * Cache for compiled Betza behaviors to guarantee < 0.1ms execution (RNF-10).
 */
const BEHAVIOR_CACHE = new Map<string, IMoveBehavior[]>();

export class BetzaParser {
  /**
   * Translates a standard or fairy piece name/notation into discrete movement behaviors.
   */
  public static parse(notation: string): IMoveBehavior[] {
    if (!notation || typeof notation !== 'string') {
      return [];
    }

    const trimmed = notation.trim();
    if (trimmed.length === 0 || trimmed.length > 100) {
      // Guard against abnormal length / DOS
      return [];
    }

    const cached = BEHAVIOR_CACHE.get(trimmed);
    if (cached) {
      return cached;
    }

    const normalizedUpper = trimmed.toUpperCase();

    // 1. Standard named piece shortcuts
    if (normalizedUpper === 'PAWN') {
      const pawnBehaviors = [
        new LeaperBehavior(0, 1, { canMove: true, canCapture: false, forwardOnly: true }),
        new LeaperBehavior(1, 1, { canMove: false, canCapture: true, forwardOnly: true }),
      ];
      BEHAVIOR_CACHE.set(trimmed, pawnBehaviors);
      return pawnBehaviors;
    }

    if (normalizedUpper === 'KNIGHT' || normalizedUpper === 'N') {
      const knight = [new LeaperBehavior(1, 2)];
      BEHAVIOR_CACHE.set(trimmed, knight);
      return knight;
    }

    if (normalizedUpper === 'BISHOP' || normalizedUpper === 'B') {
      const bishop = [new SliderBehavior(['DIAGONAL'])];
      BEHAVIOR_CACHE.set(trimmed, bishop);
      return bishop;
    }

    if (normalizedUpper === 'ROOK' || normalizedUpper === 'R') {
      const rook = [new SliderBehavior(['ORTHOGONAL'])];
      BEHAVIOR_CACHE.set(trimmed, rook);
      return rook;
    }

    if (normalizedUpper === 'QUEEN' || normalizedUpper === 'Q') {
      const queen = [new SliderBehavior(['ORTHOGONAL', 'DIAGONAL'])];
      BEHAVIOR_CACHE.set(trimmed, queen);
      return queen;
    }

    if (normalizedUpper === 'KING' || normalizedUpper === 'K') {
      const king = [new LeaperBehavior(1, 0), new LeaperBehavior(1, 1)];
      BEHAVIOR_CACHE.set(trimmed, king);
      return king;
    }

    if (normalizedUpper === 'AMAZON' || normalizedUpper === 'QN') {
      const amazon = [new SliderBehavior(['ORTHOGONAL', 'DIAGONAL']), new LeaperBehavior(1, 2)];
      BEHAVIOR_CACHE.set(trimmed, amazon);
      return amazon;
    }

    if (normalizedUpper === 'CHANCELLOR' || normalizedUpper === 'RN') {
      const chancellor = [new SliderBehavior(['ORTHOGONAL']), new LeaperBehavior(1, 2)];
      BEHAVIOR_CACHE.set(trimmed, chancellor);
      return chancellor;
    }

    if (normalizedUpper === 'ARCHBISHOP' || normalizedUpper === 'BN') {
      const archbishop = [new SliderBehavior(['DIAGONAL']), new LeaperBehavior(1, 2)];
      BEHAVIOR_CACHE.set(trimmed, archbishop);
      return archbishop;
    }

    if (normalizedUpper === 'WAZIR' || normalizedUpper === 'W') {
      const wazir = [new LeaperBehavior(1, 0)];
      BEHAVIOR_CACHE.set(trimmed, wazir);
      return wazir;
    }

    if (normalizedUpper === 'FERZ' || normalizedUpper === 'F') {
      const ferz = [new LeaperBehavior(1, 1)];
      BEHAVIOR_CACHE.set(trimmed, ferz);
      return ferz;
    }

    if (normalizedUpper === 'CAMEL' || normalizedUpper === 'C') {
      const camel = [new LeaperBehavior(1, 3)];
      BEHAVIOR_CACHE.set(trimmed, camel);
      return camel;
    }

    if (normalizedUpper === 'ZEBRA' || normalizedUpper === 'Z') {
      const zebra = [new LeaperBehavior(2, 3)];
      BEHAVIOR_CACHE.set(trimmed, zebra);
      return zebra;
    }

    if (normalizedUpper === 'GRASSHOPPER') {
      const grasshopper = [new HopperBehavior(['ORTHOGONAL', 'DIAGONAL'], 64, { immediateLandingOnly: true })];
      BEHAVIOR_CACHE.set(trimmed, grasshopper);
      return grasshopper;
    }

    // 2. Structural tokenization of Betza string
    // Token structure: [prefixes]* (Letter | (m,n)) [range]?
    const behaviors: IMoveBehavior[] = [];
    const tokenRegex = /([a-z]*)(?:\((\d+),(\d+)\)|([A-Z]))(\d*)/g;
    let match: RegExpExecArray | null;

    while ((match = tokenRegex.exec(trimmed)) !== null) {
      const rawPrefixes = match[1] || '';
      const explicitX = match[2];
      const explicitY = match[3];
      const baseLetter = match[4];
      const rangeStr = match[5];
      const maxRange = rangeStr ? parseInt(rangeStr, 10) : 64;

      const isHopper = rawPrefixes.includes('p');
      const canMove = !rawPrefixes.includes('c'); // 'c' = capture only
      const canCapture = !rawPrefixes.includes('m'); // 'm' = move only
      const forwardOnly = rawPrefixes.includes('f');
      const backwardOnly = rawPrefixes.includes('b');
      const sidewaysOnly = rawPrefixes.includes('s');
      const verticalOnly = rawPrefixes.includes('v');
      const rightOnly = rawPrefixes.includes('r');
      const leftOnly = rawPrefixes.includes('l');

      // Explicit tuple (dx, dy)
      if (explicitX !== undefined && explicitY !== undefined) {
        const dx = parseInt(explicitX, 10);
        const dy = parseInt(explicitY, 10);
        behaviors.push(
          new LeaperBehavior(dx, dy, {
            canMove,
            canCapture,
            forwardOnly,
            backwardOnly,
            sidewaysOnly,
            verticalOnly,
            rightOnly,
            leftOnly,
          })
        );
        continue;
      }

      if (!baseLetter) continue;

      if (isHopper) {
        const axes: SliderAxisType[] = [];
        if (['R', 'W', 'Q'].includes(baseLetter)) axes.push('ORTHOGONAL');
        if (['B', 'F', 'Q'].includes(baseLetter)) axes.push('DIAGONAL');
        if (axes.length > 0) {
          behaviors.push(
            new HopperBehavior(axes, maxRange, {
              canMove,
              canCapture,
              immediateLandingOnly: true,
            })
          );
        }
        continue;
      }

      switch (baseLetter) {
        case 'W': // Wazir (1, 0)
          behaviors.push(
            new LeaperBehavior(1, 0, {
              canMove,
              canCapture,
              forwardOnly,
              backwardOnly,
              sidewaysOnly,
              verticalOnly,
              rightOnly,
              leftOnly,
            })
          );
          break;

        case 'F': // Ferz (1, 1)
          behaviors.push(
            new LeaperBehavior(1, 1, {
              canMove,
              canCapture,
              forwardOnly,
              backwardOnly,
              sidewaysOnly,
              verticalOnly,
              rightOnly,
              leftOnly,
            })
          );
          break;

        case 'D': // Dabbaba (2, 0)
          behaviors.push(
            new LeaperBehavior(2, 0, {
              canMove,
              canCapture,
              forwardOnly,
              backwardOnly,
              sidewaysOnly,
              verticalOnly,
              rightOnly,
              leftOnly,
            })
          );
          break;

        case 'A': // Alfil (2, 2)
          behaviors.push(
            new LeaperBehavior(2, 2, {
              canMove,
              canCapture,
              forwardOnly,
              backwardOnly,
              sidewaysOnly,
              verticalOnly,
              rightOnly,
              leftOnly,
            })
          );
          break;

        case 'N': // Knight (1, 2)
          behaviors.push(
            new LeaperBehavior(1, 2, {
              canMove,
              canCapture,
              forwardOnly,
              backwardOnly,
              sidewaysOnly,
              verticalOnly,
              rightOnly,
              leftOnly,
            })
          );
          break;

        case 'C': // Camel (1, 3)
          behaviors.push(
            new LeaperBehavior(1, 3, {
              canMove,
              canCapture,
              forwardOnly,
              backwardOnly,
              sidewaysOnly,
              verticalOnly,
              rightOnly,
              leftOnly,
            })
          );
          break;

        case 'Z': // Zebra (2, 3)
          behaviors.push(
            new LeaperBehavior(2, 3, {
              canMove,
              canCapture,
              forwardOnly,
              backwardOnly,
              sidewaysOnly,
              verticalOnly,
              rightOnly,
              leftOnly,
            })
          );
          break;

        case 'R': // Rook (Orthogonal Slider)
          behaviors.push(
            new SliderBehavior(['ORTHOGONAL'], maxRange, {
              canMove,
              canCapture,
              forwardOnly,
              backwardOnly,
            })
          );
          break;

        case 'B': // Bishop (Diagonal Slider)
          behaviors.push(
            new SliderBehavior(['DIAGONAL'], maxRange, {
              canMove,
              canCapture,
              forwardOnly,
              backwardOnly,
            })
          );
          break;

        case 'Q': // Queen (Orthogonal + Diagonal Slider)
          behaviors.push(
            new SliderBehavior(['ORTHOGONAL', 'DIAGONAL'], maxRange, {
              canMove,
              canCapture,
              forwardOnly,
              backwardOnly,
            })
          );
          break;

        case 'K': // King (W + F)
          behaviors.push(
            new LeaperBehavior(1, 0, {
              canMove,
              canCapture,
              forwardOnly,
              backwardOnly,
              sidewaysOnly,
              verticalOnly,
              rightOnly,
              leftOnly,
            }),
            new LeaperBehavior(1, 1, {
              canMove,
              canCapture,
              forwardOnly,
              backwardOnly,
              sidewaysOnly,
              verticalOnly,
              rightOnly,
              leftOnly,
            })
          );
          break;
      }
    }

    BEHAVIOR_CACHE.set(trimmed, behaviors);
    return behaviors;
  }

  /**
   * Clears compiled cache (useful for benchmarks or unit tests).
   */
  public static clearCache(): void {
    BEHAVIOR_CACHE.clear();
  }
}
