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

export const DEFAULT_JWT_CONFIG: IJwtConfig = {
  secret: process.env.JWT_SECRET || 'chessinreact-authoritative-dev-secret-key-1024',
  issuer: 'chessinreact-auth',
  audience: 'chessinreact-game-server',
  expiresInSeconds: 3600, // 1 hour
};

/**
 * Signs a cryptographically verified JWT token for player session authentication.
 */
export function signAuthToken(user: IAuthUser, config: IJwtConfig = DEFAULT_JWT_CONFIG): string {
  if (!user.playerId || !user.username) {
    throw new Error('Invalid user payload for token signing: playerId and username are required.');
  }

  const signOptions: SignOptions = {
    algorithm: 'HS256',
    issuer: config.issuer,
    audience: config.audience,
    expiresIn: config.expiresInSeconds,
  };

  return jwt.sign(
    {
      sub: user.playerId,
      username: user.username,
      role: user.role || 'PLAYER',
    },
    config.secret,
    signOptions
  );
}

/**
 * Validates token signature, issuer, audience, and expiration.
 * Throws clean sanitized errors without exposing secrets or internals.
 */
export function verifyAuthToken(token: string, config: IJwtConfig = DEFAULT_JWT_CONFIG): IAuthUser {
  if (!token || typeof token !== 'string') {
    throw new Error('Authentication failed: Missing or invalid token format.');
  }

  const verifyOptions: VerifyOptions = {
    algorithms: ['HS256'],
    issuer: config.issuer,
    audience: config.audience,
  };

  try {
    const decoded = jwt.verify(token, config.secret, verifyOptions) as jwt.JwtPayload;

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
