import { describe, it, expect, beforeEach } from 'vitest';
import { BetzaValidatorSandbox } from '../sandbox/BetzaValidatorSandbox';
import { ModManifestParser } from '../manifest/ModManifestParser';
import { LiveOpsService } from '../liveops/LiveOpsService';

describe('Spec 10 - BetzaValidatorSandbox (RF-01, RF-02, § 3.1, § 6)', () => {
  it('validates canonical Betza strings and fairy piece notations', () => {
    const validNotations = ['W', 'F', 'D', 'N', 'B', 'R', 'Q', 'K', 'PAWN', 'KNIGHT', 'fW2N', 'N+bW'];
    for (const notation of validNotations) {
      const result = BetzaValidatorSandbox.validate(notation);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.executionTimeMs).toBeLessThan(BetzaValidatorSandbox.MAX_CPU_BUDGET_MS);
    }
  });

  it('rejects empty, whitespace-only, or null inputs', () => {
    expect(BetzaValidatorSandbox.validate('').isValid).toBe(false);
    expect(BetzaValidatorSandbox.validate('   ').isValid).toBe(false);
    expect(BetzaValidatorSandbox.validate(null as unknown as string).isValid).toBe(false);
  });

  it('rejects strings that exceed MAX_STRING_LENGTH (100 chars) (RF-02)', () => {
    const hugeString = 'N'.repeat(105);
    const result = BetzaValidatorSandbox.validate(hugeString);
    expect(result.isValid).toBe(false);
    expect(result.errors[0]).toContain('excede o limite máximo');
  });

  it('rejects malicious characters, HTML tags or code injections', () => {
    const injectionStrings = [
      '<script>alert(1)</script>',
      'DROP TABLE variants;',
      'N; while(true){}',
      'fW{evil}',
    ];
    for (const injection of injectionStrings) {
      const result = BetzaValidatorSandbox.validate(injection);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});

describe('Spec 10 - ModManifestParser (RF-04, RF-05, § 10.2, § 19)', () => {
  it('parses valid community variant manifests and strictly enforces isRanked: false (RF-05)', () => {
    const raw = {
      variantId: 'var_pegasus_hex',
      title: 'Xadrez Alado',
      description: 'Variante com cavalos alados Pégaso.',
      topology: 'HEXAGONAL',
      playerCount: 2,
      boardRadius: 4,
      customPieces: [
        {
          pieceCode: 'PEGASUS',
          betzaString: 'N+bW',
          modelGlbUrl: 'https://r2.cdn/pegasus.glb',
        },
      ],
      modifiers: {
        atomic: false,
        crazyhouse: false,
        antichess: false,
        fogOfWar: false,
      },
      // Attacker attempts to forge isRanked: true
      isRanked: true,
      authorDisplayName: 'MasterCreator',
    };

    const { manifest, validation } = ModManifestParser.parseAndValidate(raw);
    expect(validation.isValid).toBe(true);
    expect(manifest).toBeDefined();
    expect(manifest?.title).toBe('Xadrez Alado');
    expect(manifest?.topology).toBe('HEXAGONAL');
    expect(manifest?.customPieces).toHaveLength(1);
    // Invariant: Unranked taint enforced unconditionally
    expect(manifest?.isRanked).toBe(false);
  });

  it('sanitizes text fields and removes dangerous HTML tags', () => {
    const raw = {
      title: '<script>Hack</script>Variante Limpa',
      description: '<b onmouseover="evil()">Descrição</b> simples',
      topology: 'SQUARE',
      playerCount: 2,
      authorDisplayName: '<i>Admin</i>',
      customPieces: [],
    };

    const { manifest, validation } = ModManifestParser.parseAndValidate(raw);
    expect(validation.isValid).toBe(true);
    expect(manifest?.title).not.toContain('<script>');
    expect(manifest?.title).toBe('HackVariante Limpa');
    expect(manifest?.description).not.toContain('<b');
    expect(manifest?.authorDisplayName).toBe('Admin');
  });

  it('rejects manifests exceeding maximum 10 custom pieces', () => {
    const raw = {
      title: 'Excesso de Peças',
      topology: 'SQUARE',
      playerCount: 2,
      customPieces: Array.from({ length: 12 }).map((_, i) => ({
        pieceCode: `PIECE_${i}`,
        betzaString: 'N',
        modelGlbUrl: 'https://cdn/piece.glb',
      })),
    };

    const { validation } = ModManifestParser.parseAndValidate(raw);
    expect(validation.isValid).toBe(false);
    expect(validation.errors[0]).toContain('Máximo de 10 peças customizadas excedido');
  });

  it('rejects manifests with invalid custom piece Betza notations', () => {
    const raw = {
      title: 'Peça Quebrada',
      topology: 'SQUARE',
      playerCount: 2,
      customPieces: [
        {
          pieceCode: 'INVALID',
          betzaString: 'INVALID_SCRIPT_<evil>',
          modelGlbUrl: 'https://cdn/p.glb',
        },
      ],
    };

    const { validation } = ModManifestParser.parseAndValidate(raw);
    expect(validation.isValid).toBe(false);
    expect(validation.errors.some(e => e.includes('Peça customizada'))).toBe(true);
  });
});

describe('Spec 10 - LiveOpsService (RF-07, § 9.1)', () => {
  beforeEach(() => {
    LiveOpsService.resetToDefault();
  });

  it('retrieves active Message of the Day (MotD)', () => {
    const motd = LiveOpsService.getActiveMotd();
    expect(motd).toBeDefined();
    expect(motd?.headlineTitle).toBe('Torneio Hexagonal da Comunidade');
    expect(motd?.accentColorHex).toBe('#06b6d4');
  });

  it('updates MotD dynamically at runtime with zero client rebuild (Server-Driven UI)', () => {
    LiveOpsService.setActiveMotd({
      eventId: 'summer_tri_2026',
      headlineTitle: 'Festival Triangular de Verão',
      bannerImageUrl: '/assets/events/tri_summer.webp',
      accentColorHex: '#f59e0b',
      callToActionLabel: 'Entrar no Torneio',
      targetRoute: '/queue/triangular_festival',
      activeUntilTimestamp: Date.now() + 100000,
    });

    const active = LiveOpsService.getActiveMotd();
    expect(active?.eventId).toBe('summer_tri_2026');
    expect(active?.headlineTitle).toBe('Festival Triangular de Verão');
  });

  it('returns null when MotD activeUntilTimestamp has expired', () => {
    LiveOpsService.setActiveMotd({
      eventId: 'expired_event',
      headlineTitle: 'Evento Antigo',
      bannerImageUrl: '/old.webp',
      accentColorHex: '#888',
      callToActionLabel: 'Expirado',
      targetRoute: '/',
      activeUntilTimestamp: 500000,
    });

    const active = LiveOpsService.getActiveMotd(1000000);
    expect(active).toBeNull();
  });
});
