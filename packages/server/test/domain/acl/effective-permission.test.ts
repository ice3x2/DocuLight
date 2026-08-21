import { describe, expect, it } from 'vitest';

import type { AclEntry } from '../../../src/domain/acl/acl-entry.js';
import {
  effectivePermission,
  type Ancestry,
  type Requester,
} from '../../../src/domain/acl/effective-permission.js';
import { permits, strongest } from '../../../src/domain/acl/level.js';

const WS = 'ws-1';
const DOC = 'doc-1';
const DIR = 'dir-1';
const ME = 'user-me';
const TEAM = 'group-team';

let seq = 0;
const entry = (
  nodeId: string,
  principalId: string,
  level: AclEntry['level'],
  grantedBy: string | null = null,
): AclEntry => ({ id: `e${++seq}`, nodeId, principalId, level, grantedBy });

/** 문서 → 디렉토리 → 워크스페이스. 상속은 기본값(유지)이다. */
const ancestry = (
  overrides: { doc?: boolean; dir?: boolean } = {},
): Ancestry => ({
  links: [
    { id: DOC, inheritsAcl: overrides.doc ?? true },
    { id: DIR, inheritsAcl: overrides.dir ?? true },
  ],
  workspaceId: WS,
});

const me = (superuser = false): Requester => ({ subjectIds: [ME, TEAM], superuser });

describe('SEC-ACL-002 — 편집 권한은 보기 권한을 포함한다', () => {
  it('AC-1 · AC-2: 편집만 가진 주체가 보기 판정을 통과한다', () => {
    const effective = effectivePermission(ancestry(), [entry(DOC, ME, 'edit')], me());

    expect(effective).toBe('edit');
    expect(permits(effective!, 'view')).toBe(true);
  });

  it('AC-3: 편집과 보기를 둘 다 가진 경우와 편집만 가진 경우가 같다', () => {
    const both = effectivePermission(
      ancestry(),
      [entry(DOC, ME, 'edit'), entry(DOC, ME, 'view')],
      me(),
    );
    const editOnly = effectivePermission(ancestry(), [entry(DOC, ME, 'edit')], me());

    expect(both).toBe(editOnly);
  });

  it('AC-4: 보기만 가진 주체는 편집 판정을 통과하지 못한다', () => {
    const effective = effectivePermission(ancestry(), [entry(DOC, ME, 'view')], me());

    expect(effective).toBe('view');
    expect(permits(effective!, 'edit')).toBe(false);
  });
});

describe('SEC-ACL-003 — 상속과 가산으로만 넓히고 좁히기는 상속 끊기뿐이다', () => {
  it('AC-2: 상속 유지 노드의 유효 권한은 자신과 조상 항목의 합집합이다', () => {
    // 조상에만 걸린 부여가 문서까지 내려온다.
    expect(effectivePermission(ancestry(), [entry(DIR, TEAM, 'view')], me())).toBe('view');
    // 자신의 항목이 더 강하면 그쪽이 이긴다 — 조상이 깎지 않는다.
    expect(
      effectivePermission(ancestry(), [entry(DIR, TEAM, 'view'), entry(DOC, ME, 'edit')], me()),
    ).toBe('edit');
    // 워크스페이스도 조상이다 (SEC-WORKSPACE-001 — 상속 체인의 루트).
    expect(effectivePermission(ancestry(), [entry(WS, TEAM, 'edit')], me())).toBe('edit');
  });

  it('AC-3: 항목을 더하는 조작이 어떤 주체의 유효 권한도 줄이지 않는다', () => {
    const base = [entry(DIR, TEAM, 'edit')];
    const before = effectivePermission(ancestry(), base, me());

    // 무엇을 더하든 단조 — 합집합에는 깎는 항목이 없다.
    for (const added of [entry(DOC, ME, 'view'), entry(WS, ME, 'view'), entry(DIR, ME, 'view')]) {
      const after = effectivePermission(ancestry(), [...base, added], me());
      expect(permits(after!, before!)).toBe(true);
    }
  });

  it('AC-4: 상속을 끊은 노드는 조상 항목을 받지 않고 자신의 항목만으로 판정된다', () => {
    const entries = [entry(DIR, TEAM, 'edit'), entry(WS, TEAM, 'edit'), entry(DOC, ME, 'view')];

    expect(effectivePermission(ancestry({ doc: false }), entries, me())).toBe('view');
  });

  it('AC-4: 중간 디렉토리가 끊으면 그 위의 항목이 문서까지 내려오지 않는다', () => {
    const entries = [entry(WS, ME, 'edit'), entry(DIR, ME, 'view')];

    expect(effectivePermission(ancestry({ dir: false }), entries, me())).toBe('view');
  });

  it('AC-4: 끊긴 노드에 자신의 항목이 하나도 없으면 권한이 없다', () => {
    expect(effectivePermission(ancestry({ doc: false }), [entry(WS, ME, 'edit')], me())).toBeNull();
  });
});

describe('CON-ACL-002 — 거부 규칙을 두지 않고 허용 목록의 합집합만으로 판정한다', () => {
  it('AC-1: 어떤 항목도 다른 항목의 권한을 깎지 않는다', () => {
    const entries = [entry(WS, TEAM, 'edit'), entry(DIR, ME, 'view'), entry(DOC, TEAM, 'view')];

    expect(effectivePermission(ancestry(), entries, me())).toBe('edit');
  });

  it('AC-3: 항목의 적용 순서를 바꿔도 결과가 같다', () => {
    const entries = [entry(WS, TEAM, 'view'), entry(DIR, ME, 'edit'), entry(DOC, TEAM, 'view')];
    const expected = effectivePermission(ancestry(), entries, me());

    // 순열 전수 — 표본이 아니라 전량이라야 가환이 증명된다.
    const permute = <T>(xs: T[]): T[][] =>
      xs.length <= 1
        ? [xs]
        : xs.flatMap((x, i) =>
            permute([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest]),
          );

    for (const order of permute(entries)) {
      expect(effectivePermission(ancestry(), order, me())).toBe(expected);
    }
  });

  it('AC-1: 다른 주체 앞으로 걸린 항목은 내 판정에 섞이지 않는다', () => {
    expect(effectivePermission(ancestry(), [entry(DOC, 'user-other', 'edit')], me())).toBeNull();
  });
});

describe('SEC-ACL-008 — 슈퍼유저와 워크스페이스 관리 레벨은 ACL 판정을 우회한다', () => {
  it('AC-1: 슈퍼유저는 ACL 항목이 없어도 도달한다', () => {
    expect(effectivePermission(ancestry(), [], me(true))).toBe('admin');
  });

  it('AC-2: 워크스페이스 관리 레벨 보유자는 그 워크스페이스의 노드에 도달한다', () => {
    expect(effectivePermission(ancestry(), [entry(WS, TEAM, 'admin')], me())).toBe('admin');
  });

  it('AC-3: 상속이 끊겨 항목이 하나도 없는 노드에도 두 주체는 도달한다', () => {
    const broken = ancestry({ doc: false });

    expect(effectivePermission(broken, [], me(true))).toBe('admin');
    expect(effectivePermission(broken, [entry(WS, ME, 'admin')], me())).toBe('admin');
  });

  it('AC-5: 우회는 ACL 항목을 만들거나 남기지 않는다', () => {
    const entries = [entry(WS, ME, 'admin')];
    const snapshot = JSON.stringify(entries);

    effectivePermission(ancestry(), entries, me(true));
    effectivePermission(ancestry(), entries, me());

    // 판정은 순수 함수다 — 입력을 고치지 않는다.
    expect(JSON.stringify(entries)).toBe(snapshot);
  });
});

describe('SEC-WORKSPACE-001 — 워크스페이스는 상속 체인의 루트다', () => {
  it('AC-1: 워크스페이스 자신의 판정에 상위로부터 상속된 항목이 없다', () => {
    const workspaceItself: Ancestry = { links: [], workspaceId: WS };

    expect(effectivePermission(workspaceItself, [entry(WS, ME, 'edit')], me())).toBe('edit');
    // 사슬 밖의 어떤 노드에 걸린 항목도 워크스페이스로 올라오지 않는다.
    expect(effectivePermission(workspaceItself, [entry('other-root', ME, 'admin')], me())).toBeNull();
  });
});

describe('SEC-WORKSPACE-002 — 관리 레벨은 워크스페이스에만 부여한다', () => {
  it('AC-5: 디렉토리·문서가 admin 이 되는 경로는 워크스페이스 항목 하나뿐이다', () => {
    // 어떤 경로로든 노드 계층에 admin 행이 들어왔다 해도 판정이 올려주지 않는다.
    expect(effectivePermission(ancestry(), [entry(DOC, ME, 'admin')], me())).toBe('edit');
    expect(effectivePermission(ancestry(), [entry(DIR, ME, 'admin')], me())).toBe('edit');
    expect(effectivePermission(ancestry(), [entry(WS, ME, 'admin')], me())).toBe('admin');
  });
});

describe('level — 레벨 비교의 단 하나의 자리', () => {
  it('permits 는 편집이 보기를, 관리가 둘 다를 포함한다', () => {
    expect(permits('admin', 'edit')).toBe(true);
    expect(permits('admin', 'view')).toBe(true);
    expect(permits('edit', 'view')).toBe(true);
    expect(permits('view', 'edit')).toBe(false);
    expect(permits('edit', 'admin')).toBe(false);
  });

  it('strongest 는 빈 목록에 null 을 준다 — 권한 없음은 값이 아니라 부재다', () => {
    expect(strongest([])).toBeNull();
    expect(strongest(['view', 'admin', 'edit'])).toBe('admin');
  });
});
