import jwt, { SignOptions, VerifyOptions } from 'jsonwebtoken';

export interface IAuthUser {
  readonly playerId: string;
  readonly username: string;
  readonly role?: 'PLAYER' | 'SPECTATOR';
}

export interface IJwtConfig {
  readonly secret: string;
  readonly issuer: string;
  readonly audience: string;
  readonly expiresInSeconds: number;
}

const TEST_SECRET_FALLBACK = 'test-isolated-jwt-secret-do-not-use-in-prod-min-32-chars-long';

/**
 * Resolves the JWT secret securely.
 * Fails fast and strictly in production if JWT_SECRET is missing or weak (< 32 chars).
 */
export function getActiveJwtSecret(): string {
  const envSecret = process.env.JWT_SECRET;
  const isTest = process.env.NODE_ENV === 'test' || typeof process.env.VITEST !== 'undefined';

  if (!envSecret) {
    if (isTest) {
      return TEST_SECRET_FALLBACK;
    }
    throw new Error('FATAL SECURITY ERROR: JWT_SECRET environment variable is missing. A cryptographically secure secret (>= 32 chars) is strictly required.');
  }

  if (envSecret.length < 32) {
    throw new Error('FATAL SECURITY ERROR: JWT_SECRET must be at least 32 characters long for cryptographic security.');
  }

  return envSecret;
}

/**
 * Validates JWT configuration at server bootstrap time.
 */
export function validateJwtBootstrap(): void {
  getActiveJwtSecret();
}

export function getJwtConfig(overrides?: Partial<IJwtConfig>): IJwtConfig {
  return {
    secret: overrides?.secret ?? getActiveJwtSecret(),
    issuer: overrides?.issuer ?? 'chessinreact-auth',
    audience: overrides?.audience ?? 'chessinreact-game-server',
    expiresInSeconds: overrides?.expiresInSeconds ?? 3600, // 1 hour
  };
}

export const DEFAULT_JWT_CONFIG: IJwtConfig = {
  get secret() {
    return getActiveJwtSecret();
  },
  issuer: 'chessinreact-auth',
  audience: 'chessinreact-game-server',
  expiresInSeconds: 3600,
};

/**
 * Signs a cryptographically verified JWT token for player session authentication.
 */
export function signAuthToken(user: IAuthUser, config?: Partial<IJwtConfig>): string {
  if (!user.playerId || !user.username) {
    throw new Error('Invalid user payload for token signing: playerId and username are required.');
  }

  const effectiveConfig = getJwtConfig(config);

  const signOptions: SignOptions = {
    algorithm: 'HS256',
    issuer: effectiveConfig.issuer,
    audience: effectiveConfig.audience,
    expiresIn: effectiveConfig.expiresInSeconds,
  };

  return jwt.sign(
    {
      sub: user.playerId,
      username: user.username,
      role: user.role || 'PLAYER',
    },
    effectiveConfig.secret,
    signOptions
  );
}

/**
 * Validates token signature, issuer, audience, and expiration.
 * Throws clean sanitized errors without exposing secrets or internals.
 */
export function verifyAuthToken(token: string, config?: Partial<IJwtConfig>): IAuthUser {
  if (!token || typeof token !== 'string') {
    throw new Error('Authentication failed: Missing or invalid token format.');
  }

  const effectiveConfig = getJwtConfig(config);

  const verifyOptions: VerifyOptions = {
    algorithms: ['HS256'],
    issuer: effectiveConfig.issuer,
    audience: effectiveConfig.audience,
  };

  try {
    const decoded = jwt.verify(token, effectiveConfig.secret, verifyOptions) as jwt.JwtPayload;

    if (!decoded || typeof decoded !== 'object' || !decoded.sub || !decoded.username) {
      throw new Error('Authentication failed: Incomplete token claims.');
    }

    return {
      playerId: decoded.sub as string,
      username: decoded.username as string,
      role: (decoded.role as 'PLAYER' | 'SPECTATOR') || 'PLAYER',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('expired')) {
      throw new Error('Authentication failed: Token has expired.');
    }
    if (message.includes('invalid signature') || message.includes('jwt malformed') || message.includes('audience') || message.includes('issuer')) {
      throw new Error('Authentication failed: Cryptographic verification rejected.');
    }
    throw new Error('Authentication failed: Token validation rejected.');
  }
}
