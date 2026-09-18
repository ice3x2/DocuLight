import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import type { Actor } from '../acl/permission-service.js';
import type { MetadataStore } from '../../domain/ports/metadata-store.js';
import type { SettingStore } from '../../domain/ports/setting-store.js';
import { cutoffOf, sqliteUtcSecond } from '../../domain/retention/retention.js';
import { INSTANCE_SETTING_KEYS, readSetting, type InstanceSettingKey } from './instance-settings.js';

const RETENTION_KEYS = ['trash-retention-days', 'audit-retention-days'] as const;
type RetentionKey = typeof RETENTION_KEYS[number];

export interface RetentionImpactStores {
  metadata: MetadataStore;
  settings: SettingStore;
  clock: () => Date;
}

export interface RetentionPatchValidation {
  patch: Record<string, string>;
  before: Record<RetentionKey, string>;
  proposed: Record<RetentionKey, string>;
  shortened: RetentionKey[];
}

export interface RetentionImpactSnapshot {
  impact: { trashNodes: number; auditRows: number; findings: number; total: number };
  material: string;
}

export interface RetentionImpactBody {
  beforeRetention: Record<RetentionKey, string>;
  proposedRetention: Record<RetentionKey, string>;
  shortened: RetentionKey[];
  impact: RetentionImpactSnapshot['impact'];
  grade: 'L2' | 'L3' | null;
  typingToken: string | null;
  receipt: string | null;
  computedAt: string;
}

function finiteNonNegative(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

const canonical = (value: unknown): string => JSON.stringify(value);

function canonicalPatch(patch: Readonly<Record<string, string>>): string {
  return canonical(Object.fromEntries(Object.entries(patch).sort(([left], [right]) => left.localeCompare(right))));
}

export function validateRetentionPatch(
  settings: SettingStore,
  value: unknown,
): { ok: true; value: RetentionPatchValidation } | { ok: false; rule: 'invalid' | 'baseline' } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return { ok: false, rule: 'invalid' };
  const entries = Object.entries(value as Record<string, unknown>);
  for (const [key, entry] of entries) {
    if (!INSTANCE_SETTING_KEYS.includes(key as InstanceSettingKey) || typeof entry !== 'string') {
      return { ok: false, rule: 'invalid' };
    }
  }
  const patch = Object.fromEntries(entries) as Record<string, string>;
  for (const key of RETENTION_KEYS) {
    const proposed = patch[key];
    if (proposed !== undefined && finiteNonNegative(proposed) === undefined) return { ok: false, rule: 'invalid' };
  }
  const signup = patch['signup-mode'];
  if (signup !== undefined && !['open', 'approval', 'invite-only'].includes(signup)) return { ok: false, rule: 'invalid' };
  for (const key of ['upload-size-limit-bytes', 'retained-version-count'] as const) {
    const proposed = patch[key];
    if (proposed !== undefined) {
      const parsed = finiteNonNegative(proposed);
      if (parsed === undefined || parsed <= 0) return { ok: false, rule: 'invalid' };
    }
  }

  const before = Object.fromEntries(RETENTION_KEYS.map((key) => [key, readSetting(settings, key)])) as Record<RetentionKey, string>;
  const beforeNumbers = Object.fromEntries(RETENTION_KEYS.map((key) => [key, finiteNonNegative(before[key])])) as Record<RetentionKey, number | undefined>;
  if (RETENTION_KEYS.some((key) => beforeNumbers[key] === undefined)) return { ok: false, rule: 'baseline' };
  const proposed = Object.fromEntries(RETENTION_KEYS.map((key) => [key, patch[key] ?? before[key]])) as Record<RetentionKey, string>;
  const proposedNumbers = Object.fromEntries(RETENTION_KEYS.map((key) => [key, finiteNonNegative(proposed[key])])) as Record<RetentionKey, number>;
  const trash = proposedNumbers['trash-retention-days'];
  const audit = proposedNumbers['audit-retention-days'];
  if ((trash === 0 && audit !== 0) || (trash > 0 && audit !== 0 && audit < trash)) return { ok: false, rule: 'invalid' };
  const shortened = RETENTION_KEYS.filter((key) => {
    const previous = beforeNumbers[key]!;
    const next = proposedNumbers[key];
    return next !== 0 && (previous === 0 || next < previous);
  });
  return { ok: true, value: { patch, before, proposed, shortened } };
}

function requireIdentity(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error('corrupt retention identity');
}

function parseTrashTime(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error('corrupt trash timestamp');
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new Error('corrupt trash timestamp');
  return parsed;
}

function requireSqliteTime(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    throw new Error('corrupt audit timestamp');
  }
  const parsed = Date.parse(`${value.replace(' ', 'T')}Z`);
  if (!Number.isFinite(parsed)) throw new Error('corrupt audit timestamp');
  if (sqliteUtcSecond(new Date(parsed)) !== value) throw new Error('corrupt audit timestamp');
}

export function retentionImpactSnapshot(
  metadata: MetadataStore,
  validation: RetentionPatchValidation,
  now: Date,
): RetentionImpactSnapshot {
  let trashRoots: Array<{ id: string; deletedAt: string }> = [];
  let trashFacts: Array<{ id: string; parentId: string | null }> = [];
  let auditFacts: Array<{ id: string; occurredAt: string }> = [];
  let findingFacts: Array<{ findingId: string; auditId: string; ordinal: number }> = [];

  if (validation.shortened.includes('trash-retention-days')) {
    const threshold = cutoffOf(Number(validation.proposed['trash-retention-days']), now)!.getTime();
    const storedRoots = metadata.all<{ node_id: string; deleted_at: string }>(
      'SELECT node_id, deleted_at FROM trash_entry ORDER BY node_id',
    );
    for (const entry of storedRoots) {
      requireIdentity(entry.node_id);
      parseTrashTime(entry.deleted_at);
    }
    trashRoots = storedRoots
      .filter((entry) => parseTrashTime(entry.deleted_at) <= threshold)
      .map((entry) => ({ id: entry.node_id, deletedAt: entry.deleted_at }));
    const roots = trashRoots.map((entry) => entry.id);
    if (roots.length > 0) {
      const placeholders = roots.map(() => '?').join(', ');
      trashFacts = metadata.all<{ id: string; parent_id: string | null }>(
        `WITH RECURSIVE impacted(id) AS (
           SELECT id FROM node WHERE id IN (${placeholders})
           UNION
           SELECT node.id FROM node JOIN impacted ON node.parent_id = impacted.id
         )
         SELECT node.id, node.parent_id FROM node JOIN impacted ON impacted.id = node.id ORDER BY node.id`,
        roots,
      ).map((row) => {
        requireIdentity(row.id);
        if (row.parent_id !== null) requireIdentity(row.parent_id);
        return { id: row.id, parentId: row.parent_id };
      });
    }
  }

  if (validation.shortened.includes('audit-retention-days')) {
    const threshold = sqliteUtcSecond(cutoffOf(Number(validation.proposed['audit-retention-days']), now)!);
    const storedAudit = metadata.all<{ id: string; occurred_at: string }>(
      'SELECT id, occurred_at FROM audit_log ORDER BY id',
    );
    for (const entry of storedAudit) {
      requireIdentity(entry.id);
      requireSqliteTime(entry.occurred_at);
    }
    auditFacts = metadata.all<{ id: string; occurred_at: string }>(
      'SELECT id, occurred_at FROM audit_log WHERE occurred_at < ? ORDER BY id',
      [threshold],
    ).map((row) => ({ id: row.id, occurredAt: row.occurred_at }));
    if (auditFacts.length > 0) {
      const ids = auditFacts.map((entry) => entry.id);
      const placeholders = ids.map(() => '?').join(', ');
      const impactedFindingIds = metadata.all<{ finding_id: string }>(
        `SELECT DISTINCT finding_id
           FROM reconciliation_finding_audit_ref
          WHERE audit_log_id IN (${placeholders})
          ORDER BY finding_id`,
        ids,
      ).map((row) => {
        requireIdentity(row.finding_id);
        return row.finding_id;
      });
      if (impactedFindingIds.length > 0) {
        const findingPlaceholders = impactedFindingIds.map(() => '?').join(', ');
        findingFacts = metadata.all<{ finding_id: string; audit_log_id: string; ordinal: number }>(
          `SELECT finding_id, audit_log_id, ordinal
             FROM reconciliation_finding_audit_ref
            WHERE finding_id IN (${findingPlaceholders})
            ORDER BY finding_id, ordinal, audit_log_id`,
          impactedFindingIds,
        ).map((row) => {
          requireIdentity(row.finding_id);
          requireIdentity(row.audit_log_id);
          if (!Number.isInteger(row.ordinal) || row.ordinal < 0) throw new Error('corrupt finding reference');
          return { findingId: row.finding_id, auditId: row.audit_log_id, ordinal: row.ordinal };
        });
      }
    }
  }
  const findingIds = new Set(findingFacts.map((entry) => entry.findingId));
  const impact = {
    trashNodes: trashFacts.length,
    auditRows: auditFacts.length,
    findings: findingIds.size,
    total: trashFacts.length + auditFacts.length + findingIds.size,
  };
  return { impact, material: canonical({ trashRoots, trashFacts, auditFacts, findingFacts }) };
}

export class RetentionImpactReceipts {
  private readonly secret = randomBytes(32);

  constructor(private readonly stores: RetentionImpactStores) {}

  private payload(
    actor: Actor,
    securityContext: string,
    validation: RetentionPatchValidation,
    snapshot: RetentionImpactSnapshot,
  ): string {
    return canonical({
      version: 1,
      actorId: actor.id,
      securityContext,
      patch: canonicalPatch(validation.patch),
      before: validation.before,
      proposed: validation.proposed,
      effective: {
        before: Object.fromEntries(RETENTION_KEYS.map((key) => [key, Number(validation.before[key])])),
        proposed: Object.fromEntries(RETENTION_KEYS.map((key) => [key, Number(validation.proposed[key])])),
      },
      shortened: validation.shortened,
      impact: snapshot.impact,
      materialDigest: createHash('sha256').update(snapshot.material).digest('hex'),
    });
  }

  private sign(payload: string): string {
    return `v1.${createHmac('sha256', this.secret).update(payload).digest('hex')}`;
  }

  private verifies(receipt: string, payload: string): boolean {
    if (!/^v1\.[0-9a-f]{64}$/.test(receipt)) return false;
    const supplied = Buffer.from(receipt.slice(3), 'hex');
    const expected = Buffer.from(this.sign(payload).slice(3), 'hex');
    return timingSafeEqual(supplied, expected);
  }

  preview(actor: Actor, securityContext: string, validation: RetentionPatchValidation): RetentionImpactBody {
    const now = this.stores.clock();
    const snapshot = retentionImpactSnapshot(this.stores.metadata, validation, now);
    if (validation.shortened.length === 0) {
      return {
        beforeRetention: validation.before,
        proposedRetention: validation.proposed,
        shortened: [],
        impact: snapshot.impact,
        grade: null,
        typingToken: null,
        receipt: null,
        computedAt: now.toISOString(),
      };
    }
    const receipt = this.sign(this.payload(actor, securityContext, validation, snapshot));
    return {
      beforeRetention: validation.before,
      proposedRetention: validation.proposed,
      shortened: validation.shortened,
      impact: snapshot.impact,
      grade: snapshot.impact.total === 0 ? 'L2' : 'L3',
      typingToken: snapshot.impact.total === 0 ? null : String(snapshot.impact.total),
      receipt,
      computedAt: now.toISOString(),
    };
  }

  matches(
    actor: Actor,
    securityContext: string,
    receipt: string | undefined,
    token: string | undefined,
    validation: RetentionPatchValidation,
  ): 'required' | 'stale' | 'accepted' {
    if (validation.shortened.length === 0) return receipt === undefined ? 'accepted' : 'stale';
    if (receipt === undefined) return 'required';
    const current = retentionImpactSnapshot(this.stores.metadata, validation, this.stores.clock());
    if (!this.verifies(receipt, this.payload(actor, securityContext, validation, current))) return 'stale';
    if (current.impact.total > 0 && token !== String(current.impact.total)) return 'stale';
    if (current.impact.total === 0 && token !== undefined) return 'stale';
    return 'accepted';
  }
}
