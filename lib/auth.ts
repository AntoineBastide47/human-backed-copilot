// P1 owns this file
// TODO: JWT session sign/verify + cookie helpers
export async function signSession(payload: { userId: string }): Promise<string> {
  throw new Error('Not implemented — P1 task H1-3');
}

export async function getSessionUserId(req: Request): Promise<string> {
  throw new Error('Not implemented — P1 task H1-3');
}
