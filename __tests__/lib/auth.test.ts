import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  signSession,
  getSessionUserId,
  sessionCookie,
  clearSessionCookie,
  AuthError,
} from '@/lib/auth';

const SECRET = process.env.JWT_SECRET!;
const USER_ID = 'user-abc-123';

function makeRequest(cookie?: string): Request {
  return new Request('http://localhost/api/test', {
    headers: cookie ? { cookie } : {},
  });
}

describe('signSession', () => {
  it('returns a valid JWT', async () => {
    const token = await signSession({ userId: USER_ID });
    const decoded = jwt.verify(token, SECRET) as jwt.JwtPayload;
    expect(decoded.userId).toBe(USER_ID);
  });

  it('includes expiry', async () => {
    const token = await signSession({ userId: USER_ID });
    const decoded = jwt.decode(token) as jwt.JwtPayload;
    expect(decoded.exp).toBeGreaterThan(Date.now() / 1000);
  });

  it('uses HS256 algorithm', async () => {
    const token = await signSession({ userId: USER_ID });
    const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString());
    expect(header.alg).toBe('HS256');
  });
});

describe('getSessionUserId', () => {
  it('returns userId from valid session cookie', async () => {
    const token = await signSession({ userId: USER_ID });
    const req = makeRequest(`session=${token}`);
    const id = await getSessionUserId(req);
    expect(id).toBe(USER_ID);
  });

  it('throws AuthError(401) when cookie is missing', async () => {
    await expect(getSessionUserId(makeRequest())).rejects.toThrow(AuthError);
    await expect(getSessionUserId(makeRequest())).rejects.toMatchObject({ status: 401 });
  });

  it('throws AuthError when token is tampered', async () => {
    const token = await signSession({ userId: USER_ID });
    const tampered = token.slice(0, -5) + 'XXXXX';
    const req = makeRequest(`session=${tampered}`);
    await expect(getSessionUserId(req)).rejects.toThrow(AuthError);
  });

  it('throws AuthError when token is expired', async () => {
    const expired = jwt.sign({ userId: USER_ID }, SECRET, { expiresIn: -1 });
    const req = makeRequest(`session=${expired}`);
    await expect(getSessionUserId(req)).rejects.toThrow(AuthError);
    await expect(getSessionUserId(makeRequest(`session=${expired}`))).rejects.toMatchObject({
      message: 'Session expired',
      status: 401,
    });
  });

  it('throws AuthError when token has no userId field', async () => {
    const token = jwt.sign({ sub: 'someone' }, SECRET);
    const req = makeRequest(`session=${token}`);
    await expect(getSessionUserId(req)).rejects.toThrow(AuthError);
  });

  it('handles multiple cookies and finds the right one', async () => {
    const token = await signSession({ userId: USER_ID });
    const req = makeRequest(`theme=dark; session=${token}; lang=en`);
    const id = await getSessionUserId(req);
    expect(id).toBe(USER_ID);
  });

  it('throws when signed with wrong secret', async () => {
    const bad = jwt.sign({ userId: USER_ID }, 'wrong-secret');
    const req = makeRequest(`session=${bad}`);
    await expect(getSessionUserId(req)).rejects.toThrow(AuthError);
  });
});

describe('sessionCookie', () => {
  it('sets HttpOnly and SameSite=Lax', () => {
    const header = sessionCookie('tok', false);
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('session=tok');
  });

  it('adds Secure flag when secure=true', () => {
    const header = sessionCookie('tok', true);
    expect(header).toContain('Secure');
  });

  it('sets positive Max-Age', () => {
    const header = sessionCookie('tok', false);
    const match = header.match(/Max-Age=(\d+)/);
    expect(Number(match?.[1])).toBeGreaterThan(0);
  });
});

describe('clearSessionCookie', () => {
  it('sets Max-Age=0', () => {
    expect(clearSessionCookie()).toContain('Max-Age=0');
  });
});
