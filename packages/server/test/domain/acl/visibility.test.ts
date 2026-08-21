import { describe, expect, it } from 'vitest';

import { passThroughIds, visibilityOf } from '../../../src/domain/acl/visibility.js';

/**
 * 워크스페이스
 *  └ 본부            (dir-hq)
 *     ├ 기획팀        (dir-plan)
 *     │  └ 회의록.md   (doc-minutes)   ← 여기에만 권한이 있다
 *     └ 인사팀        (dir-hr)         ← 형제. 나타나면 안 된다
 */
const PARENTS: Readonly<Record<string, string | null>> = {
  'dir-hq': null,
  'dir-plan': 'dir-hq',
  'dir-hr': 'dir-hq',
  'doc-minutes': 'dir-plan',
  'doc-payroll': 'dir-hr',
};

const ancestorsOf = (id: string): string[] => {
  const out: string[] = [];
  for (let p = PARENTS[id] ?? null; p !== null; p = PARENTS[p] ?? null) out.push(p);
  return out;
};

describe('SEC-ACL-005 — 접근 가능한 자손을 가진 조상 디렉토리는 이름만 표시한다', () => {
  it('AC-1: 권한을 가진 노드로 가는 경로상의 조상이 pass-through 가 된다', () => {
    const through = passThroughIds(['doc-minutes'], ancestorsOf);

    expect(through.has('dir-plan')).toBe(true);
    expect(through.has('dir-hq')).toBe(true);
  });

  it('AC-2: 조상의 형제는 pass-through 가 아니다', () => {
    const through = passThroughIds(['doc-minutes'], ancestorsOf);

    expect(through.has('dir-hr')).toBe(false);
    expect(through.has('doc-payroll')).toBe(false);
  });

  it('AC-1: 부여받은 노드 자신은 pass-through 가 아니라 그냥 보인다', () => {
    // 자기 자신이 섞이면 「이름만 보이는」 것과 「열 수 있는」 것이 뒤섞인다.
    expect(passThroughIds(['doc-minutes'], ancestorsOf).has('doc-minutes')).toBe(false);
  });

  it('AC-3: pass-through 는 이름만 가진다 — 유효 권한이 없다', () => {
    expect(
      visibilityOf({ kind: 'directory', effective: null, isPassThrough: true }),
    ).toBe('pass-through');
  });

  it('AC-5: 자손에게만 권한을 준 문서에 이르는 경로가 트리에 남는다', () => {
    const through = passThroughIds(['doc-minutes'], ancestorsOf);
    const chain = ['dir-hq', 'dir-plan'];

    // 경로가 하나라도 끊기면 도달할 수 없다 — 전 구간이 남아야 한다.
    for (const id of chain) {
      expect(visibilityOf({ kind: 'directory', effective: null, isPassThrough: through.has(id) })).toBe(
        'pass-through',
      );
    }
  });
});

describe('SEC-ACL-004 — 권한이 없는 문서와 디렉토리는 트리에서 완전히 숨긴다', () => {
  it('AC-1: 유효 권한도 pass-through 도 아니면 숨긴다', () => {
    expect(visibilityOf({ kind: 'file', effective: null, isPassThrough: false })).toBe('hidden');
    expect(visibilityOf({ kind: 'directory', effective: null, isPassThrough: false })).toBe(
      'hidden',
    );
  });

  it('AC-2: 숨김을 나타내는 세 번째 상태가 없다 — 잠금·비활성·개수로도 남지 않는다', () => {
    // 열거가 셋으로 닫혀 있어야 「대신 나타내는」 값이 생길 자리가 없다.
    const produced = new Set(
      (['file', 'directory'] as const).flatMap((kind) =>
        [null, 'view' as const, 'edit' as const, 'admin' as const].flatMap((effective) =>
          [true, false].map((isPassThrough) => visibilityOf({ kind, effective, isPassThrough })),
        ),
      ),
    );

    expect([...produced].sort()).toEqual(['full', 'hidden', 'pass-through']);
  });

  it('AC-5: 문서는 자손을 가질 수 없으므로 pass-through 가 되지 않는다', () => {
    // 파일이 pass-through 로 새면 「이름만 보이되 못 여는 문서」가 생기고,
    // 그것은 이 요구가 기각한 잠금 아이콘 방식 그 자체다.
    expect(visibilityOf({ kind: 'file', effective: null, isPassThrough: true })).toBe('hidden');
  });

  it('유효 권한이 있으면 종류와 무관하게 그대로 보인다', () => {
    expect(visibilityOf({ kind: 'file', effective: 'view', isPassThrough: false })).toBe('full');
    expect(visibilityOf({ kind: 'directory', effective: 'admin', isPassThrough: true })).toBe(
      'full',
    );
  });
});

describe('CON-ACL-004 — pass-through 여부를 저장하지 않고 매 요청 계산한다', () => {
  it('AC-2: 자손의 권한을 회수하면 다음 계산에서 조상이 사라진다', () => {
    expect(passThroughIds(['doc-minutes'], ancestorsOf).has('dir-plan')).toBe(true);
    // 정리 작업이 사이에 없다 — 입력이 줄면 결과가 곧바로 줄어든다.
    expect(passThroughIds([], ancestorsOf).has('dir-plan')).toBe(false);
  });

  it('AC-4: 자손에게 권한을 주면 다음 계산에서 조상이 나타난다', () => {
    expect(passThroughIds([], ancestorsOf).has('dir-hr')).toBe(false);
    expect(passThroughIds(['doc-payroll'], ancestorsOf).has('dir-hr')).toBe(true);
  });

  it('AC-3: 통과를 뜻하는 권한 레벨이 신설되지 않았다', () => {
    // pass-through 는 가시성 축의 값이지 권한 축의 값이 아니다. 권한 축에
    // 있었다면 permits 로 비교되어 「통과 이상」 같은 판정이 생긴다.
    const visibility = visibilityOf({ kind: 'directory', effective: null, isPassThrough: true });
    expect(visibility).toBe('pass-through');
    expect(['view', 'edit', 'admin']).not.toContain(visibility);
  });
});
