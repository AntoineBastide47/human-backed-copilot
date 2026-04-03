import { NextResponse } from 'next/server';
import { AuthError } from './auth';

type ErrorBody = { error: string };

export const E = {
  badRequest: (msg: string) => NextResponse.json<ErrorBody>({ error: msg }, { status: 400 }),
  unauthorized: (msg = 'Unauthorized') => NextResponse.json<ErrorBody>({ error: msg }, { status: 401 }),
  forbidden: (msg = 'Forbidden') => NextResponse.json<ErrorBody>({ error: msg }, { status: 403 }),
  notFound: (msg = 'Not found') => NextResponse.json<ErrorBody>({ error: msg }, { status: 404 }),
  conflict: (msg: string) => NextResponse.json<ErrorBody>({ error: msg }, { status: 409 }),
  internal: () => NextResponse.json<ErrorBody>({ error: 'Internal server error' }, { status: 500 }),
};

export function handleAuthError(err: unknown) {
  if (err instanceof AuthError) return E.unauthorized(err.message);
  return null;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
export function isValidAddress(addr: string): boolean {
  return ADDRESS_RE.test(addr);
}
