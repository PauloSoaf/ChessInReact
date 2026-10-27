import { describe, it, expect } from 'vitest';
import { signAuthToken, verifyAuthToken, DEFAULT_JWT_CONFIG } from '../auth/jwtAuth';

describe('Spec 03 - JWT Authentication (RF-12, US03-D06)', () => {
  it('signs and verifies a valid player token successfully', () => {
    const user = { playerId: 'user-123', username: 'Alice', role: 'PLAYER' as const };
    const token = signAuthToken(user);

    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);

    const verified = verifyAuthToken(token);
    expect(verified.playerId).toBe('user-123');
    expect(verified.username).toBe('Alice');
    expect(verified.role).toBe('PLAYER');
  });

  it('signs and verifies a spectator token with spectator role preserved', () => {
    const spectator = { playerId: 'spec-456', username: 'BobViewer', role: 'SPECTATOR' as const };
    const token = signAuthToken(spectator);

    const verified = verifyAuthToken(token);
    expect(verified.playerId).toBe('spec-456');
    expect(verified.role).toBe('SPECTATOR');
  });

  it('rejects tokens signed with an invalid or untrusted secret', () => {
    const user = { playerId: 'user-789', username: 'Charlie' };
    const forgedToken = signAuthToken(user, {
      ...DEFAULT_JWT_CONFIG,
      secret: 'malicious-attacker-secret-key-9999',
    });

    expect(() => verifyAuthToken(forgedToken)).toThrow('Authentication failed: Cryptographic verification rejected.');
  });

  it('rejects tokens with mismatched audience or issuer', () => {
    const user = { playerId: 'user-999', username: 'David' };
    const wrongAudienceToken = signAuthToken(user, {
      ...DEFAULT_JWT_CONFIG,
      audience: 'wrong-audience',
    });

    expect(() => verifyAuthToken(wrongAudienceToken)).toThrow('Authentication failed: Cryptographic verification rejected.');
  });

  it('rejects expired tokens cleanly without leaking secrets', () => {
    const user = { playerId: 'user-old', username: 'Eve' };
    const expiredToken = signAuthToken(user, {
      ...DEFAULT_JWT_CONFIG,
      expiresInSeconds: -10, // Already expired
    });

    expect(() => verifyAuthToken(expiredToken)).toThrow('Authentication failed: Token has expired.');
  });

  it('rejects missing or malformed token inputs', () => {
    expect(() => verifyAuthToken('')).toThrow('Authentication failed: Missing or invalid token format.');
    expect(() => verifyAuthToken('not-a-valid-jwt-token')).toThrow('Authentication failed: Cryptographic verification rejected.');
  });
});
