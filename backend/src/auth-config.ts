export interface AuthConfig {
  secret: string;
  expiresInSeconds: number;
  issuer: string;
  audience: string;
}

export function getAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const secret = env.JWT_SECRET;
  if (!secret || secret.length < 32 || secret === 'replace-with-at-least-32-random-bytes') {
    throw new Error('JWT_SECRET must be configured with at least 32 characters');
  }
  const lifetime = env.JWT_EXPIRES_IN || '15m';
  const match = /^(\d+)(s|m|h)$/.exec(lifetime);
  const multiplier = match ? ({ s: 1, m: 60, h: 3600 } as const)[match[2] as 's' | 'm' | 'h'] : 0;
  const expiresInSeconds = match ? Number(match[1]) * multiplier : 0;
  if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 3600) {
    throw new Error('JWT_EXPIRES_IN must be a duration from 1s to 1h');
  }
  return {
    secret,
    expiresInSeconds,
    issuer: env.JWT_ISSUER || 'shortlink-api',
    audience: env.JWT_AUDIENCE || 'shortlink-dashboard',
  };
}
