import { asCoordinateKey } from '../../core/coordinates';
import { IPieceDefinition, IVariantConfiguration, PieceVariantId } from './interfaces/IRulesContracts';
import { BetzaParser } from './behaviors/BetzaParser';

export interface IVariantDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly topologyType: 'SQUARE' | 'HEXAGONAL' | 'TRIANGULAR' | 'VORONOI_IRREGULAR';
  readonly config: IVariantConfiguration;
  readonly customPieces?: readonly IPieceDefinition[];
}

export class VariantRegistry {
  private static readonly pieces = new Map<PieceVariantId, IPieceDefinition>();
  private static readonly variants = new Map<string, IVariantDefinition>();

  static {
    // Standard pieces
    this.registerPiece({ variantId: 'PAWN', betzaNotation: 'fmWfcF', vectors: [] });
    this.registerPiece({ variantId: 'KNIGHT', betzaNotation: 'N', vectors: [] });
    this.registerPiece({ variantId: 'BISHOP', betzaNotation: 'B', vectors: [] });
    this.registerPiece({ variantId: 'ROOK', betzaNotation: 'R', vectors: [] });
    this.registerPiece({ variantId: 'QUEEN', betzaNotation: 'Q', vectors: [] });
    this.registerPiece({ variantId: 'KING', betzaNotation: 'K', vectors: [], isRoyal: true });

    // Fairy pieces
    this.registerPiece({ variantId: 'AMAZON', betzaNotation: 'QN', vectors: [] });
    this.registerPiece({ variantId: 'CHANCELLOR', betzaNotation: 'RN', vectors: [] });
    this.registerPiece({ variantId: 'ARCHBISHOP', betzaNotation: 'BN', vectors: [] });
    this.registerPiece({ variantId: 'WAZIR', betzaNotation: 'W', vectors: [] });
    this.registerPiece({ variantId: 'FERZ', betzaNotation: 'F', vectors: [] });
    this.registerPiece({ variantId: 'CAMEL', betzaNotation: 'C', vectors: [] });
    this.registerPiece({ variantId: 'ZEBRA', betzaNotation: 'Z', vectors: [] });
    this.registerPiece({ variantId: 'GRASSHOPPER', betzaNotation: 'GRASSHOPPER', vectors: [] });

    // Built-in variants
    this.registerVariant({
      id: 'CHESS_STANDARD',
      name: 'Standard Chess',
      description: 'Official FIDE 8x8 Chess',
      topologyType: 'SQUARE',
      config: { variantId: 'CHESS_STANDARD', enforceCheck: true },
    });

    this.registerVariant({
      id: 'ATOMIC',
      name: 'Atomic Chess',
      description: 'Captures trigger radius-1 detonations',
      topologyType: 'SQUARE',
      config: { variantId: 'ATOMIC', enforceCheck: true, captureExplosion: true },
    });

    this.registerVariant({
      id: 'CRAZYHOUSE',
      name: 'Crazyhouse',
      description: 'Captured pieces can be dropped onto the board',
      topologyType: 'SQUARE',
      config: { variantId: 'CRAZYHOUSE', enforceCheck: true, allowDrops: true },
    });

    this.registerVariant({
      id: 'ANTICHESS',
      name: 'Antichess (Giveaway)',
      description: 'Forced capture, no check, lose all pieces to win',
      topologyType: 'SQUARE',
      config: { variantId: 'ANTICHESS', enforceCheck: false },
    });

    this.registerVariant({
      id: 'KING_OF_THE_HILL',
      name: 'King of the Hill',
      description: 'Occupy the four central squares to win instantly',
      topologyType: 'SQUARE',
      config: {
        variantId: 'KING_OF_THE_HILL',
        enforceCheck: true,
        hillCenterCoords: [
          asCoordinateKey('3,3'),
          asCoordinateKey('4,3'),
          asCoordinateKey('3,4'),
          asCoordinateKey('4,4'),
        ],
      },
    });

    this.registerVariant({
      id: 'HEXAGONAL_GLINSKI',
      name: 'Gliński Hexagonal Chess',
      description: 'Hexagonal chess on 91-cell board with 3 bishop colors',
      topologyType: 'HEXAGONAL',
      config: { variantId: 'HEXAGONAL_GLINSKI', enforceCheck: true },
    });
  }

  public static registerPiece(piece: IPieceDefinition): void {
    this.pieces.set(piece.variantId.toUpperCase(), piece);
    if (piece.betzaNotation) {
      BetzaParser.parse(piece.betzaNotation);
    }
  }

  public static getPiece(variantId: string): IPieceDefinition | undefined {
    return this.pieces.get(variantId.toUpperCase());
  }

  public static registerVariant(variant: IVariantDefinition): void {
    this.variants.set(variant.id.toUpperCase(), variant);
    if (variant.customPieces) {
      for (const piece of variant.customPieces) {
        this.registerPiece(piece);
      }
    }
  }

  public static getVariant(variantId: string): IVariantDefinition | undefined {
    return this.variants.get(variantId.toUpperCase());
  }

  public static getAllVariants(): readonly IVariantDefinition[] {
    return Array.from(this.variants.values());
  }
}
