import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const root = path.resolve(webRoot, '../..');
const coverage = process.env.DOCULIGHT_ISSUE77_OUTPUT_DIR
  ? path.resolve(process.env.DOCULIGHT_ISSUE77_OUTPUT_DIR)
  : path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue77/implementation/coverage');
const implementation = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue77/implementation');
const sha256 = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function srsAcceptanceCriteria() {
  const found = new Map();
  const specRoot = path.join(root, 'docs/spec');
  for (const name of fs.readdirSync(specRoot).filter((entry) => entry.endsWith('.srs.md'))) {
    const source = fs.readFileSync(path.join(specRoot, name), 'utf8');
    for (const match of source.matchAll(/^### ((?:CON|IR|FR|SEC)-[A-Z]+-\d{3})\b/gm)) {
      const next = source.indexOf('\n### ', match.index + match[0].length);
      const block = source.slice(match.index, next < 0 ? source.length : next);
      found.set(match[1], new Set([...block.matchAll(/^- \[[ x]\] (AC-\d+):/gm)].map((one) => one[1])));
    }
  }
  return found;
}

test('IR-SHELL-006 AC-10 coverage rows are specific, non-circular, and independently disposed', () => {
  const rows = fs.readFileSync(path.join(coverage, 'leaf-matrix.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(rows.length > 0);
  for (const row of rows) {
    assert.match(row.requirement, /^(?:CON|IR|FR|SEC)-[A-Z]+-\d{3}$/);
    assert.match(row.ac, /^AC-\d+$/);
    assert.ok(row.surface && !/^issue-\d+-surface$/.test(row.surface));
    assert.ok(row.role && row.state && row.environment);
    assert.notEqual(row.evidence, 'final-manifest.json');
    assert.ok(row.evidence && !path.isAbsolute(row.evidence));
    assert.match(row.evidenceSha256, /^[a-f0-9]{64}$/);
    assert.ok(fs.existsSync(path.join(implementation, row.evidence)));
    assert.notEqual(row.reviewerDisposition, 'pending');
    assert.ok(['accepted', 'rejected', 'not-applicable'].includes(row.reviewerDisposition));
    if (row.verdict === 'PASS') assert.equal(row.reviewerDisposition, 'accepted');
    if (row.verdict === 'N-A') {
      assert.equal(row.reviewerDisposition, 'not-applicable');
      assert.ok(row.reason?.length > 20);
    }
  }
});

test('closure eligibility exactly follows independent acceptance and zero blocking verdicts', () => {
  const summary = JSON.parse(fs.readFileSync(path.join(coverage, 'leaf-matrix-summary.json'), 'utf8'));
  const clear = (summary.summary.FAIL ?? 0) === 0 && (summary.summary.BLOCKED ?? 0) === 0 && (summary.summary['NOT-RUN'] ?? 0) === 0;
  assert.equal(summary.closureEligible, summary.independentReviewAccepted && clear);
});

test('the independently accepted fixed row set is promoted with the matching review artifact', () => {
  const rows = fs.readFileSync(path.join(coverage, 'leaf-matrix.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const accepted = rows.filter((row) => row.verdict === 'PASS');
  assert.equal(accepted.length, 406);
  for (const row of accepted) {
    assert.equal(row.reviewerDisposition, 'accepted');
    assert.ok(['axis-a-final-review.md', 'axis-b-final-review.md'].includes(row.reviewerEvidence));
    assert.equal(sha256(path.join(implementation, row.reviewerEvidence)), row.reviewerEvidenceSha256);
    assert.equal(row.acceptedPreReviewLedgerSha256, 'a8efd0cc089b0f6fae9849b99133b4545e75f42da832bd7422c2808fc07be8d4');
    assert.equal(row.acceptedPreReviewIdSetSha256, 'a8149904f4dbd98d10f7b6eb8e171af5d88898e024b74790900ee17cccd73497');
  }
});

test('every row references an AC that exists in the current parsed SRS and a current artifact hash', () => {
  const requirements = srsAcceptanceCriteria();
  const rows = fs.readFileSync(path.join(coverage, 'leaf-matrix.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  for (const row of rows) {
    assert.ok(requirements.has(row.requirement), `unknown requirement ${row.requirement}`);
    assert.ok(requirements.get(row.requirement).has(row.ac), `${row.requirement} has no ${row.ac}`);
    const evidenceFile = path.resolve(implementation, row.evidence);
    assert.equal(sha256(evidenceFile), row.evidenceSha256, `${row.id} stale evidence hash`);
    const reviewerFile = path.resolve(implementation, row.reviewerEvidence);
    assert.equal(sha256(reviewerFile), row.reviewerEvidenceSha256, `${row.id} stale reviewer hash`);
  }
});

test('every inventory N-A has complete hashed equivalence evidence', () => {
  const inventory = JSON.parse(fs.readFileSync(path.join(coverage, 'declared-browser-inventory.json'), 'utf8'));
  for (const entry of inventory.entries.filter((one) => one.verdict === 'N-A')) {
    assert.ok(entry.reason?.length > 20, `${entry.workspace}:${entry.name} reason`);
    assert.ok(Array.isArray(entry.equivalence) && entry.equivalence.length > 0, `${entry.workspace}:${entry.name} equivalence links`);
    for (const link of entry.equivalence) {
      assert.ok(link.relationship?.length > 10);
      const evidenceFile = path.resolve(implementation, link.evidence);
      assert.equal(fs.existsSync(evidenceFile), true, `${entry.name} missing ${link.evidence}`);
      assert.equal(sha256(evidenceFile), link.evidenceSha256, `${entry.name} stale ${link.evidence}`);
    }
  }
});

test('foundation visual and behavioral ACs cannot rely on build-only evidence', () => {
  const rows = fs.readFileSync(path.join(coverage, 'leaf-matrix.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
    .filter((row) => [43, 44, 45].includes(row.issue) && row.requirement === 'IR-SHELL-006');
  assert.equal(rows.length, 21);
  for (const row of rows) {
    assert.ok(Array.isArray(row.evidenceRefs) && row.evidenceRefs.length > 0, `${row.id} evidenceRefs`);
    assert.equal(row.evidenceRefs.some((ref) => /build.*raw\.txt$/i.test(ref.path)), false, `${row.id} build-only evidence`);
    for (const ref of row.evidenceRefs) {
      assert.ok(ref.scope?.includes(row.ac), `${row.id} evidence scope`);
      const file = path.resolve(implementation, ref.path);
      assert.equal(sha256(file), ref.sha256, `${row.id} evidence ref hash`);
    }
  }
});
