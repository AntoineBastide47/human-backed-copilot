import jwt from 'jsonwebtoken';

const COOKIE_NAME = 'session';
const EXPIRES_IN = '7d';
const MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

function requireSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET env var is not set');
  return secret;
}

export async function signSession(payload: { userId: string }): Promise<string> {
  return jwt.sign({ userId: payload.userId }, requireSecret(), {
    algorithm: 'HS256',
    expiresIn: EXPIRES_IN,
  });
}

export async function getSessionUserId(req: Request): Promise<string> {
  const cookieHeader = req.headers.get('cookie') ?? '';
  const token = parseCookie(cookieHeader, COOKIE_NAME);
  if (!token) throw new AuthError('Missing session cookie', 401);

  let decoded: jwt.JwtPayload & { userId?: string };
  try {
    decoded = jwt.verify(token, requireSecret()) as jwt.JwtPayload & { userId?: string };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw new AuthError('Session expired', 401);
    throw new AuthError('Invalid session token', 401);
  }

  if (typeof decoded.userId !== 'string' || !decoded.userId) {
    throw new AuthError('Invalid token payload', 401);
  }
  return decoded.userId;
}

export function sessionCookie(token: string, secure = process.env.NODE_ENV === 'production'): string {
  const flags = [
    `${COOKIE_NAME}=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${MAX_AGE}`,
  ];
  if (secure) flags.push('Secure');
  return flags.join('; ');
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

function parseCookie(header: string, name: string): string | null {
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}
