import { describe, expect, it } from 'vitest';

import { assertEnvironmentEvidence, assertSameMountedTransition, contrastRatio } from './issue81-product-assertions.mjs';

const transition = {
  mountIdBefore: 'mount-1', mountIdAfter: 'mount-1', queryBefore: '상태 후보', queryAfter: '상태 후보',
  candidateIdBefore: 'user-first', candidateIdAfter: 'user-first', groupIdBefore: 'group-1', groupIdAfter: 'group-1',
  focusedIdBefore: 'user-first', focusedIdAfter: 'user-first', writesBefore: 4, writesAfter: 4, zoomReads: [1, 2, 1],
};

describe('IR-PRINCIPAL-003 product evidence assertions', () => {
  it('behaviorally rejects remount, query/candidate/group/focus loss, writes, and fake zoom history', () => {
    expect(() => assertSameMountedTransition(transition)).not.toThrow();
    for (const broken of [
      { mountIdAfter: 'mount-2' }, { queryAfter: '다름' }, { candidateIdAfter: 'user-other' },
      { groupIdAfter: 'group-other' }, { focusedIdAfter: 'user-other' }, { writesAfter: 5 }, { zoomReads: [1, 1, 1] },
    ]) expect(() => assertSameMountedTransition({ ...transition, ...broken })).toThrow();
  });

  it('computes actual contrast and rejects missing result/member reachability or contrast axes', () => {
    expect(contrastRatio('rgb(0, 0, 0)', 'rgb(255, 255, 255)')).toBeCloseTo(21, 5);
    const evidence = { normalTextContrast: 7, largeTextContrast: 4, controlContrast: 4, focusContrast: 4, borderContrast: 4, firstResultReachable: true, lastResultReachable: true, manyMemberLastReachable: true, longNameReachable: true };
    expect(() => assertEnvironmentEvidence(evidence)).not.toThrow();
    for (const broken of [
      { normalTextContrast: 4.49 }, { largeTextContrast: 2.99 }, { controlContrast: 2.99 }, { focusContrast: 2.99 },
      { borderContrast: 2.99 }, { firstResultReachable: false }, { lastResultReachable: false },
      { manyMemberLastReachable: false }, { longNameReachable: false },
    ]) expect(() => assertEnvironmentEvidence({ ...evidence, ...broken })).toThrow();
  });
});
