import { ApiError, type IdentityResult, type SessionBody } from '../api/client.js';

export type CurrentAuthentication =
  | { kind: 'same-owner'; userId: string; session: SessionBody }
  | { kind: 'different-owner'; userId: string; session: SessionBody }
  | { kind: 'ended' }
  | { kind: 'uncertain' };

export async function checkCurrentAuthentication(
  previousUserId: string,
  readSession: () => Promise<SessionBody>,
  readIdentity: () => Promise<IdentityResult>,
): Promise<CurrentAuthentication> {
  let session: SessionBody;
  try {
    session = await readSession();
  } catch (error) {
    return error instanceof ApiError && error.status === 401
      ? { kind: 'ended' }
      : { kind: 'uncertain' };
  }

  try {
    const identity = await readIdentity();
    switch (identity.kind) {
      case 'ok':
        return identity.userId === previousUserId
          ? { kind: 'same-owner', userId: identity.userId, session }
          : { kind: 'different-owner', userId: identity.userId, session };
      case 'http-error':
        return identity.status === 401 ? { kind: 'ended' } : { kind: 'uncertain' };
      case 'malformed':
        return { kind: 'uncertain' };
    }
  } catch (error) {
    return error instanceof ApiError && error.status === 401
      ? { kind: 'ended' }
      : { kind: 'uncertain' };
  }
}
