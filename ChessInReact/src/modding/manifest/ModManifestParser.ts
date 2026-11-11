import { 
  ICommunityVariantManifest, 
  ICustomPieceDefinition, 
  IValidationResult 
} from '../interfaces/IModdingContracts';
import { BetzaValidatorSandbox } from '../sandbox/BetzaValidatorSandbox';

export class ModManifestParser {
  public static readonly MAX_CUSTOM_PIECES = 10;
  public static readonly VALID_TOPOLOGIES = ['SQUARE', 'HEXAGONAL', 'TRIANGULAR', 'VORONOI'] as const;
  public static readonly VALID_PLAYER_COUNTS = [2, 3, 4, 6, 8] as const;

  /**
   * Sanitizes a plain text string by stripping unsafe HTML/script tags.
   */
  public static sanitizeText(text: string): string {
    return text
      .replace(/<[^>]*>?/gm, '')
      .replace(/[&<>"']/g, '')
      .trim();
  }

  /**
   * Parses and validates a Community Variant Manifest (Spec 10 § 15 RF-04, RF-05, § 19).
   * Strictly enforces unranked taint (`isRanked: false`) on all custom modded variants.
   */
  public static parseAndValidate(raw: unknown): {
    manifest?: ICommunityVariantManifest;
    validation: IValidationResult;
  } {
    const startTime = performance.now();
    const errors: string[] = [];

    if (!raw || typeof raw !== 'object') {
      return {
        validation: {
          isValid: false,
          errors: ['Manifesto inválido: payload deve ser um objeto JSON.'],
          executionTimeMs: performance.now() - startTime,
        },
      };
    }

    const payload = raw as Record<string, unknown>;

    // Title validation
    const rawTitle = typeof payload.title === 'string' ? payload.title : '';
    const title = this.sanitizeText(rawTitle);
    if (title.length < 3 || title.length > 50) {
      errors.push('Título da variante deve possuir entre 3 e 50 caracteres.');
    }

    // Description validation
    const rawDesc = typeof payload.description === 'string' ? payload.description : '';
    const description = this.sanitizeText(rawDesc);
    if (description.length > 500) {
      errors.push('Descrição da variante não pode exceder 500 caracteres.');
    }

    // Topology validation
    const topology = String(payload.topology ?? 'SQUARE') as ICommunityVariantManifest['topology'];
    if (!this.VALID_TOPOLOGIES.includes(topology)) {
      errors.push(`Topologia '${topology}' inválida. Esperada: ${this.VALID_TOPOLOGIES.join(', ')}.`);
    }

    // Player count validation
    const playerCount = Number(payload.playerCount ?? 2);
    const validCount = this.VALID_PLAYER_COUNTS.find(c => c === playerCount);
    if (!validCount) {
      errors.push(`Número de jogadores '${playerCount}' inválido. Esperado: ${this.VALID_PLAYER_COUNTS.join(', ')}.`);
    }

    // Custom pieces validation
    const rawPieces = Array.isArray(payload.customPieces) ? payload.customPieces : [];
    if (rawPieces.length > this.MAX_CUSTOM_PIECES) {
      errors.push(`Máximo de ${this.MAX_CUSTOM_PIECES} peças customizadas excedido (recebido: ${rawPieces.length}).`);
    }

    const validCustomPieces: ICustomPieceDefinition[] = [];
    for (let i = 0; i < rawPieces.length; i++) {
      const p = rawPieces[i] as Record<string, unknown>;
      const pieceCode = String(p.pieceCode ?? '').toUpperCase().trim();
      const betzaString = String(p.betzaString ?? '').trim();
      const modelGlbUrl = String(p.modelGlbUrl ?? '').trim();

      if (!/^[A-Z0-9_]{2,10}$/.test(pieceCode)) {
        errors.push(`Peça customizada #${i + 1}: código '${pieceCode}' deve ter entre 2 e 10 letras maiúsculas/números.`);
      }

      const betzaCheck = BetzaValidatorSandbox.validate(betzaString);
      if (!betzaCheck.isValid) {
        errors.push(`Peça customizada '${pieceCode}': ${betzaCheck.errors.join('; ')}`);
      }

      validCustomPieces.push({
        pieceCode,
        betzaString,
        modelGlbUrl,
      });
    }

    const executionTimeMs = performance.now() - startTime;
    if (errors.length > 0) {
      return {
        validation: {
          isValid: false,
          errors,
          executionTimeMs,
        },
      };
    }

    const rawModifiers = (payload.modifiers && typeof payload.modifiers === 'object') 
      ? payload.modifiers as Record<string, unknown> 
      : {};

    const manifest: ICommunityVariantManifest = {
      variantId: String(payload.variantId ?? `var_${Date.now()}`),
      title,
      description,
      topology,
      playerCount,
      boardRadius: Number(payload.boardRadius ?? 4),
      customPieces: validCustomPieces,
      modifiers: {
        atomic: Boolean(rawModifiers.atomic),
        crazyhouse: Boolean(rawModifiers.crazyhouse),
        antichess: Boolean(rawModifiers.antichess),
        fogOfWar: Boolean(rawModifiers.fogOfWar),
      },
      totalPlays: Number(payload.totalPlays ?? 0),
      ratingStarsAverage: Number(payload.ratingStarsAverage ?? 0),
      authorDisplayName: this.sanitizeText(String(payload.authorDisplayName ?? 'Comunidade')),
      publishedAtTimestamp: Number(payload.publishedAtTimestamp ?? Date.now()),
      // Spec 10 § 10.2 / RF-05 Invariant: custom modded variants can NEVER be ranked
      isRanked: false,
    };

    return {
      manifest,
      validation: {
        isValid: true,
        errors: [],
        executionTimeMs,
      },
    };
  }
}
