export type DraftState = 'saved' | 'saving' | 'conflict' | 'rejected';

export interface AuthOwner {
  userId: string;
  generation: number;
}

export interface LiveDraftRegistration {
  owner: AuthOwner;
  nodeId: string;
  revision: string;
  mode: string;
  read: () => string;
  acknowledged: () => string;
  state: () => DraftState;
  composing: () => boolean;
  freeze: (frozen: boolean) => void;
}

export interface DraftRecord {
  id: string;
  nodeId: string;
  revision: string;
  mode: string;
  text: string;
}

export interface RecoveryRecord extends DraftRecord, AuthOwner {
  fileName: string;
}

export type PreflightResult =
  | { kind: 'clean' }
  | { kind: 'composition' }
  | { kind: 'drafts'; records: readonly DraftRecord[] };

export type AuthMutationOperation = 'logout' | 'password';
export type AuthMutationOutcome = 'accepted' | 'rejected' | 'ended' | 'unknown';
export type AuthPhase = 'active' | 'preflight' | 'posting' | 'checking' | 'uncertain' | 'ended';
export interface AuthAttemptToken extends AuthOwner { attempt: number }

export interface AuthAttemptLock {
  acquire: (attempt: AuthAttemptToken) => boolean;
  release: (attempt: AuthAttemptToken) => boolean;
  clear: () => void;
  current: () => AuthAttemptToken | null;
}

const sameAttempt = (left: AuthAttemptToken | null, right: AuthAttemptToken) =>
  left?.userId === right.userId && left.generation === right.generation && left.attempt === right.attempt;

export function createAuthAttemptLock(): AuthAttemptLock {
  let held: AuthAttemptToken | null = null;
  return {
    acquire(attempt) {
      if (held !== null) return false;
      held = { ...attempt };
      return true;
    },
    release(attempt) {
      if (!sameAttempt(held, attempt)) return false;
      held = null;
      return true;
    },
    clear() { held = null; },
    current() { return held === null ? null : { ...held }; },
  };
}

export function classifyAuthMutation(
  operation: AuthMutationOperation,
  status: number,
): AuthMutationOutcome {
  if (status === 204) return 'accepted';
  if (operation === 'password' && status === 400) return 'rejected';
  if (operation === 'password' && status === 401) return 'ended';
  return 'unknown';
}

export interface AuthBoundary {
  activate: (owner: AuthOwner) => void;
  phase: () => AuthPhase;
  beginAttempt: (owner: AuthOwner) => AuthAttemptToken | null;
  markPosting: (attempt: AuthAttemptToken) => boolean;
  markChecking: (attempt: AuthAttemptToken) => boolean;
  markUncertain: (attempt: AuthAttemptToken) => boolean;
  isCurrentAttempt: (attempt: AuthAttemptToken) => boolean;
  resume: (attempt: AuthAttemptToken) => boolean;
  end: (attempt?: AuthAttemptToken) => boolean;
  allowsProtected: (owner: AuthOwner) => boolean;
  register: (surface: LiveDraftRegistration) => () => void;
  quarantineRegistration: (surface: LiveDraftRegistration) => readonly RecoveryRecord[];
  clearRegistrations: () => void;
  preflight: (owner: AuthOwner) => PreflightResult;
  readNodeDraft: (owner: AuthOwner, nodeId: string) => DraftRecord | undefined;
  quarantine: (owner: AuthOwner) => readonly RecoveryRecord[];
  quarantineNode: (owner: AuthOwner, nodeId: string) => readonly RecoveryRecord[];
  recoveryFor: (userId: string) => readonly RecoveryRecord[];
  discardRecovery: (id: string, userId: string) => void;
  thaw: () => void;
}

export async function runProtected<T>(
  boundary: Pick<AuthBoundary, 'allowsProtected'>,
  owner: AuthOwner,
  task: () => Promise<T>,
  continuation?: (value: T) => void,
): Promise<T | undefined> {
  if (!boundary.allowsProtected(owner)) return undefined;
  const value = await task();
  if (!boundary.allowsProtected(owner)) return undefined;
  continuation?.(value);
  return value;
}

export function createAuthBoundary(): AuthBoundary {
  const live = new Set<LiveDraftRegistration>();
  const recovery: RecoveryRecord[] = [];
  let recordSequence = 0;
  let authPhase: AuthPhase = 'ended';
  let activeOwner: AuthOwner | undefined;
  let activeAttempt: AuthAttemptToken | undefined;
  let attemptSequence = 0;

  const belongsTo = (surface: LiveDraftRegistration, owner: AuthOwner) =>
    surface.owner.userId === owner.userId && surface.owner.generation === owner.generation;
  const selected = (owner: AuthOwner) => [...live].filter((surface) => belongsTo(surface, owner));
  const captureSurface = (surface: LiveDraftRegistration): DraftRecord | undefined =>
    surface.state() === 'saved' && surface.read() === surface.acknowledged()
      ? undefined
      : {
        id: `draft-${++recordSequence}`,
        nodeId: surface.nodeId,
        revision: surface.revision,
        mode: surface.mode,
        text: surface.read(),
      };
  const capture = (owner: AuthOwner): DraftRecord[] => selected(owner)
    .map(captureSurface)
    .filter((record): record is DraftRecord => record !== undefined);
  const sameOwner = (left: AuthOwner | undefined, right: AuthOwner) =>
    left?.userId === right.userId && left.generation === right.generation;
  const currentAttempt = (attempt: AuthAttemptToken) =>
    sameOwner(activeOwner, attempt) && activeAttempt?.attempt === attempt.attempt;

  return {
    activate(owner) {
      activeOwner = { ...owner };
      activeAttempt = undefined;
      authPhase = 'active';
    },
    phase() { return authPhase; },
    beginAttempt(owner) {
      if (authPhase !== 'active' || !sameOwner(activeOwner, owner)) return null;
      activeAttempt = { ...owner, attempt: ++attemptSequence };
      authPhase = 'preflight';
      return activeAttempt;
    },
    markPosting(attempt) {
      if (!currentAttempt(attempt) || authPhase !== 'preflight') return false;
      authPhase = 'posting';
      return true;
    },
    markChecking(attempt) {
      if (!currentAttempt(attempt) || !['posting', 'preflight', 'uncertain'].includes(authPhase)) return false;
      authPhase = 'checking';
      return true;
    },
    markUncertain(attempt) {
      if (!currentAttempt(attempt) || authPhase !== 'checking') return false;
      authPhase = 'uncertain';
      return true;
    },
    isCurrentAttempt(attempt) { return currentAttempt(attempt); },
    resume(attempt) {
      if (!currentAttempt(attempt) || !['preflight', 'checking', 'uncertain'].includes(authPhase)) return false;
      authPhase = 'active';
      activeAttempt = undefined;
      return true;
    },
    end(attempt) {
      if (attempt !== undefined && !currentAttempt(attempt)) return false;
      authPhase = 'ended';
      activeAttempt = undefined;
      return true;
    },
    allowsProtected(owner) { return authPhase === 'active' && sameOwner(activeOwner, owner); },
    register(surface) {
      live.add(surface);
      return () => { live.delete(surface); };
    },
    quarantineRegistration(surface) {
      if (!live.has(surface)) return [];
      const record = captureSurface(surface);
      if (record === undefined) return [];
      const quarantined = { ...record, ...surface.owner, fileName: 'local-draft-1.md' };
      recovery.push(quarantined);
      return [quarantined];
    },
    clearRegistrations() {
      live.clear();
    },
    preflight(owner) {
      for (const surface of selected(owner)) surface.freeze(true);
      if (selected(owner).some((surface) => surface.composing())) return { kind: 'composition' };
      const records = capture(owner);
      return records.length === 0 ? { kind: 'clean' } : { kind: 'drafts', records };
    },
    readNodeDraft(owner, nodeId) {
      return capture(owner).find((record) => record.nodeId === nodeId);
    },
    quarantine(owner) {
      for (const surface of selected(owner)) surface.freeze(true);
      const records = capture(owner).map((record, index) => ({
        ...record,
        ...owner,
        fileName: `local-draft-${index + 1}.md`,
      }));
      recovery.push(...records);
      return records;
    },
    quarantineNode(owner, nodeId) {
      const records = capture(owner)
        .filter((record) => record.nodeId === nodeId)
        .map((record, index) => ({ ...record, ...owner, fileName: `local-draft-${index + 1}.md` }));
      recovery.push(...records);
      return records;
    },
    recoveryFor(userId) {
      return recovery.filter((record) => record.userId === userId);
    },
    discardRecovery(id, userId) {
      const index = recovery.findIndex((record) => record.id === id && record.userId === userId);
      if (index >= 0) recovery.splice(index, 1);
    },
    thaw() {
      for (const surface of live) surface.freeze(false);
    },
  };
}
