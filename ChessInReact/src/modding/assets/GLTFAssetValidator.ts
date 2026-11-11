/**
 * ChessInReact - GLTF UGC 3D Asset Validator & Fallback Pipeline (Spec 10 § 6, RF-03, RF-14)
 *
 * Validates user-generated 3D piece models:
 * 1. Binary header inspection (Magic number 0x46546C67 "glTF").
 * 2. 2 MB size ceiling enforcement.
 * 3. SHA-256 fingerprint generation.
 * 4. Graceful Staunton fallback for failed or corrupt assets.
 */

import { createHash } from 'crypto';

export interface IAssetValidationResult {
  readonly isValid: boolean;
  readonly fileSizeBytes: number;
  readonly sha256Hash?: string;
  readonly gltfVersion?: number;
  readonly reason?: string;
}

export class GLTFAssetValidator {
  public static readonly MAX_ASSET_SIZE_BYTES = 2 * 1024 * 1024; // 2 Megabytes
  public static readonly GLTF_MAGIC_HEADER = 0x46546c67; // 'glTF' in ASCII little-endian

  /**
   * Validates raw binary buffer of a user-uploaded .glb asset.
   */
  public static validateBinaryGlb(buffer: Buffer | Uint8Array): IAssetValidationResult {
    const size = buffer.length;

    // 1. File size check
    if (size === 0) {
      return { isValid: false, fileSizeBytes: 0, reason: 'Arquivo de malha 3D vazio.' };
    }

    if (size > this.MAX_ASSET_SIZE_BYTES) {
      return {
        isValid: false,
        fileSizeBytes: size,
        reason: `Tamanho excede o limite estrito de 2 MB (tamanho: ${(size / (1024 * 1024)).toFixed(2)} MB).`,
      };
    }

    // 2. Minimum GLB header size (12 bytes: 4 magic + 4 version + 4 length)
    if (size < 12) {
      return {
        isValid: false,
        fileSizeBytes: size,
        reason: 'Cabeçalho binário truncado: menor que o mínimo de 12 bytes.',
      };
    }

    // 3. Magic number inspection
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const magic = view.getUint32(0, true);

    if (magic !== this.GLTF_MAGIC_HEADER) {
      return {
        isValid: false,
        fileSizeBytes: size,
        reason: `Assinatura de cabeçalho inválida (esperado 'glTF' 0x46546C67, recebido 0x${magic.toString(16).toUpperCase()}).`,
      };
    }

    const version = view.getUint32(4, true);
    if (version !== 2) {
      return {
        isValid: false,
        fileSizeBytes: size,
        gltfVersion: version,
        reason: `Versão GLTF não suportada: ${version} (apenas GLTF v2 é suportado).`,
      };
    }

    // 4. SHA-256 fingerprint
    const hash = createHash('sha256').update(buffer).digest('hex');

    return {
      isValid: true,
      fileSizeBytes: size,
      sha256Hash: hash,
      gltfVersion: version,
    };
  }

  /**
   * Resolves safe fallback geometry if custom UGC model fails to load (RF-14).
   */
  public static resolveFallbackGeometryId(pieceType: string): string {
    const canonicalType = pieceType.toLowerCase();
    switch (canonicalType) {
      case 'k':
      case 'king':
        return 'staunton_king_standard';
      case 'q':
      case 'queen':
        return 'staunton_queen_standard';
      case 'r':
      case 'rook':
        return 'staunton_rook_standard';
      case 'b':
      case 'bishop':
        return 'staunton_bishop_standard';
      case 'n':
      case 'knight':
        return 'staunton_knight_standard';
      case 'p':
      case 'pawn':
      default:
        return 'staunton_pawn_standard';
    }
  }
}
