import type { RosterUser } from '../api/client.js';

export type RosterRead =
  | { state: 'loading'; revision?: number }
  | { state: 'error'; revision?: number; onRetry: () => void }
  | { state: 'ready'; revision?: number; users: readonly RosterUser[]; onRetry?: () => void };
export type SignupModeRead =
  | { state: 'loading' }
  | { state: 'error'; onRetry: () => void }
  | { state: 'ready'; mode: string };

export type PrincipalActionResult =
  | { ok: true; id?: string; refreshFailed: boolean; acceptedReadGeneration?: number }
  | { ok: false; kind: 'rejected' | 'uncertain' | 'stale' };

export type PrincipalRequestContext = Readonly<{
  principalId: string;
  authGeneration: number;
  categoryGeneration: number;
  queryGeneration: number;
}>;

export type PrincipalAction<T extends unknown[]> = (
  ...args: T
) => Promise<PrincipalActionResult>;

export const principalRequestContextKey = (context: PrincipalRequestContext): string =>
  `${context.principalId}\u0000${context.authGeneration}\u0000${context.categoryGeneration}\u0000${context.queryGeneration}`;

export const principalRequestOwnerKey = (context: PrincipalRequestContext): string =>
  `${context.principalId}\u0000${context.authGeneration}\u0000${context.categoryGeneration}`;

export const principalActionResultIsCurrent = (
  captured: PrincipalRequestContext,
  current: PrincipalRequestContext,
  result: PrincipalActionResult,
): boolean => {
  if (principalRequestOwnerKey(captured) !== principalRequestOwnerKey(current)) return false;
  if (result.ok && result.acceptedReadGeneration !== undefined) {
    return current.queryGeneration === captured.queryGeneration
      || current.queryGeneration === result.acceptedReadGeneration;
  }
  return captured.queryGeneration === current.queryGeneration;
};
