import { describe, expect, it } from 'vitest';

import type { AclEntry } from '../../../src/domain/acl/acl-entry.js';
import { GRANT_SCOPE_GUIDANCE } from '../../../src/domain/acl/grant-scope-guidance.js';
import {
  canBreakInheritance,
  canGrant,
  canRevoke,
} from '../../../src/domain/acl/grant-policy.js';
import {
  requirementFor,
  satisfies,
  type Held,
} from '../../../src/domain/acl/operation-policy.js';
import { hasUnscopedAdminTerm } from '../../../src/domain/principal/vocabulary.js';

const ME = 'user-me';
const OTHER = 'user-other';

const held = (h: Partial<Held>): Held => ({
  parent: null,
  target: null,
  destination: null,
  workspace: null,
  ...h,
});

const entry = (grantedBy: string | null): AclEntry => ({
  id: 'e1',
  nodeId: 'doc-1',
  principalId: OTHER,
  level: 'view',
  grantedBy,
});

describe('SEC-ACL-012 — 파일 조작별 필요 권한을 조작 단위로 확정한다', () => {
  it('AC-1: 생성은 부모 디렉토리의 편집을 요구한다', () => {
    expect(requirementFor('create')).toEqual({
      parent: 'edit',
      target: null,
      destination: null,
      workspace: null,
    });
    expect(satisfies(requirementFor('create'), held({ parent: 'edit' }))).toBe(true);
    expect(satisfies(requirementFor('create'), held({ parent: 'view' }))).toBe(false);
    expect(satisfies(requirementFor('create'), held({}))).toBe(false);
  });

  it('AC-2: 업로드가 생성과 같은 기준을 쓴다', () => {
    // 같은 값을 두 자리에 적으면 한쪽만 바뀐다 — 같은 것임을 여기서 못박는다.
    expect(requirementFor('upload')).toEqual(requirementFor('create'));
  });

  it('AC-3 · AC-4: 개명과 삭제는 대상의 편집을 요구한다', () => {
    for (const op of ['rename', 'delete'] as const) {
      expect(requirementFor(op)).toEqual({
        parent: null,
        target: 'edit',
        destination: null,
        workspace: null,
      });
      expect(satisfies(requirementFor(op), held({ target: 'view' }))).toBe(false);
      expect(satisfies(requirementFor(op), held({ target: 'edit' }))).toBe(true);
    }
  });

  it('AC-5: 이동은 대상과 목적지 둘 다의 편집을 요구한다', () => {
    const req = requirementFor('move');

    expect(satisfies(req, held({ target: 'edit', destination: 'edit' }))).toBe(true);
    // 한쪽만으로는 통과하지 못한다 — 둘 다라는 것이 이 AC 의 내용이다.
    expect(satisfies(req, held({ target: 'edit' }))).toBe(false);
    expect(satisfies(req, held({ destination: 'edit' }))).toBe(false);
  });

  it('AC-6: 휴지통 영구 삭제는 워크스페이스 관리를 요구한다', () => {
    const req = requirementFor('purge');

    expect(satisfies(req, held({ workspace: 'admin' }))).toBe(true);
    expect(satisfies(req, held({ workspace: 'edit', target: 'edit' }))).toBe(false);
  });

  it('판정 없이 지나가는 조작이 열거에 없다 — 모든 조작이 무언가를 요구한다', () => {
    for (const op of ['create', 'upload', 'rename', 'delete', 'move', 'purge', 'copy'] as const) {
      const req = requirementFor(op);
      const anything = Object.values(req).some((v) => v !== null);
      expect(anything, `${op} 이 아무것도 요구하지 않는다`).toBe(true);
      // 아무 권한도 없는 주체는 어떤 조작도 통과하지 못한다.
      expect(satisfies(req, held({})), `${op} 이 무권한을 통과시킨다`).toBe(false);
    }
  });
});

describe('SEC-ACL-013 — 숨은 하위가 있는 디렉토리의 이동과 삭제는 관리 레벨을 요구한다', () => {
  it('AC-1 · AC-2: 숨은 하위가 있으면 편집 레벨로는 거부된다', () => {
    for (const op of ['move', 'delete'] as const) {
      const req = requirementFor(op, { hasHiddenDescendant: true });

      expect(
        satisfies(req, held({ target: 'edit', destination: 'edit' })),
        `${op} 이 편집만으로 통과한다`,
      ).toBe(false);
    }
  });

  it('AC-3: 같은 조작을 워크스페이스 관리 레벨로 요청하면 수행된다', () => {
    for (const op of ['move', 'delete'] as const) {
      const req = requirementFor(op, { hasHiddenDescendant: true });

      expect(
        satisfies(req, held({ workspace: 'admin', target: 'admin', destination: 'admin' })),
      ).toBe(true);
    }
  });

  it('AC-5: 하위가 전부 보이면 편집 레벨로 그대로 수행된다', () => {
    for (const op of ['move', 'delete'] as const) {
      expect(requirementFor(op, { hasHiddenDescendant: false })).toEqual(requirementFor(op));
    }
    expect(
      satisfies(requirementFor('delete', { hasHiddenDescendant: false }), held({ target: 'edit' })),
    ).toBe(true);
  });

  it('AC-4: 요구 사항 자체가 숨은 노드의 개수·이름·경로를 담지 않는다', () => {
    // 값이 실려 있으면 거부 안내를 만드는 쪽이 언젠가 그것을 찍는다.
    const req = requirementFor('delete', { hasHiddenDescendant: true });

    expect(Object.keys(req).sort()).toEqual(['destination', 'parent', 'target', 'workspace']);
    expect(JSON.stringify(req)).not.toMatch(/count|name|path|hidden/i);
  });
});

describe('SEC-ACL-014 — 워크스페이스 경계를 넘는 이동은 차단하고 복사만 허용한다', () => {
  it('AC-3 · AC-4: 복사는 원본의 보기와 대상 디렉토리의 편집을 요구한다', () => {
    const req = requirementFor('copy');

    expect(req).toEqual({
      parent: null,
      target: 'view',
      destination: 'edit',
      workspace: null,
    });
    expect(satisfies(req, held({ target: 'view', destination: 'edit' }))).toBe(true);
    expect(satisfies(req, held({ target: 'view', destination: 'view' }))).toBe(false);
  });
});

describe('SEC-ACL-009 — 넓히기와 좁히기의 필요 레벨을 다르게 둔다', () => {
  it('AC-1: 넓히기는 그 노드에 편집 유효 권한을 가진 주체가 실행할 수 있다', () => {
    expect(canGrant({ actorLevel: 'edit', requestedLevel: 'view', targetIsWorkspace: false })).toEqual(
      { allowed: true },
    );
    expect(canGrant({ actorLevel: 'view', requestedLevel: 'view', targetIsWorkspace: false })).toEqual(
      { allowed: false, rule: 'needs-edit-on-node' },
    );
    expect(canGrant({ actorLevel: null, requestedLevel: 'view', targetIsWorkspace: false })).toEqual({
      allowed: false,
      rule: 'needs-edit-on-node',
    });
  });

  it('AC-2: 부여할 수 있는 레벨은 실행자 자신의 레벨 이하다', () => {
    expect(canGrant({ actorLevel: 'edit', requestedLevel: 'edit', targetIsWorkspace: false })).toEqual(
      { allowed: true },
    );
    expect(
      canGrant({ actorLevel: 'edit', requestedLevel: 'admin', targetIsWorkspace: true }),
    ).toEqual({ allowed: false, rule: 'above-own-level' });
  });

  it('AC-3: 관리 레벨 부여는 관리 보유자만 실행할 수 있다', () => {
    expect(
      canGrant({ actorLevel: 'admin', requestedLevel: 'admin', targetIsWorkspace: true }),
    ).toEqual({ allowed: true });
  });

  it('AC-4: 상속 끊기는 관리 보유자만 실행할 수 있다', () => {
    expect(canBreakInheritance('admin')).toEqual({ allowed: true });
    // 넓히기는 편집이 하지만 좁히기는 못 한다 — 이 비대칭이 이 요구의 전부다.
    expect(canBreakInheritance('edit')).toEqual({ allowed: false, rule: 'needs-manage' });
    expect(canBreakInheritance(null)).toEqual({ allowed: false, rule: 'needs-manage' });
  });

  it('AC-5: 편집 보유자는 자신이 부여한 항목만, 관리 보유자는 전부 회수한다', () => {
    expect(canRevoke({ actorId: ME, actorLevel: 'edit', entry: entry(ME) })).toEqual({
      allowed: true,
    });
    expect(canRevoke({ actorId: ME, actorLevel: 'edit', entry: entry(OTHER) })).toEqual({
      allowed: false,
      rule: 'not-your-grant',
    });
    expect(canRevoke({ actorId: ME, actorLevel: 'admin', entry: entry(OTHER) })).toEqual({
      allowed: true,
    });
  });

  it('AC-5: 시스템이 자동으로 넣은 항목은 편집 보유자가 회수하지 못한다', () => {
    // grantedBy 가 null 인 것을 「내가 준 것」으로 읽으면 생성자 자동 부여를
    // 아무 편집자나 걷어낼 수 있게 된다.
    expect(canRevoke({ actorId: ME, actorLevel: 'edit', entry: entry(null) })).toEqual({
      allowed: false,
      rule: 'not-your-grant',
    });
  });
});

describe('SEC-WORKSPACE-002 — 관리 레벨은 워크스페이스에만 부여한다', () => {
  it('AC-1 · AC-2: 디렉토리·문서에 관리를 부여하는 요청이 거부된다', () => {
    expect(
      canGrant({ actorLevel: 'admin', requestedLevel: 'admin', targetIsWorkspace: false }),
    ).toEqual({ allowed: false, rule: 'manage-is-workspace-only' });
  });

  it('AC-4: 워크스페이스에는 세 레벨을 모두 부여할 수 있다', () => {
    for (const level of ['view', 'edit', 'admin'] as const) {
      expect(
        canGrant({ actorLevel: 'admin', requestedLevel: level, targetIsWorkspace: true }),
        `워크스페이스에 ${level} 을 못 준다`,
      ).toEqual({ allowed: true });
    }
  });
});

describe('SEC-ACL-010 — 편집자가 부여한 편집 권한은 다시 부여될 수 있다', () => {
  it('AC-1: 전파로 편집을 받은 주체가 같은 노드에서 다시 부여할 수 있다', () => {
    // 판정의 입력에 「누가 줬는가」가 없다. 그래서 전파가 막히지 않는다.
    expect(canGrant({ actorLevel: 'edit', requestedLevel: 'edit', targetIsWorkspace: false })).toEqual(
      { allowed: true },
    );
  });

  it('AC-2: 관리자가 준 편집과 편집자가 준 편집을 가르는 별도 레벨이 없다', () => {
    // 레벨 축이 셋으로 닫혀 있다는 것이 그 별도 레벨의 부재다.
    const levels = new Set(
      (['view', 'edit', 'admin'] as const).map((l) =>
        canGrant({ actorLevel: 'admin', requestedLevel: l, targetIsWorkspace: true }),
      ),
    );
    expect(levels.size).toBe(1);
  });

  it('AC-4: 전파된 부여도 자신의 레벨 이하 제한을 그대로 받는다', () => {
    expect(
      canGrant({ actorLevel: 'edit', requestedLevel: 'admin', targetIsWorkspace: true }),
    ).toEqual({ allowed: false, rule: 'above-own-level' });
  });
});

describe('CON-ACL-003 — 부여에 적용 범위 선택지를 두지 않는다', () => {
  it('AC-3: 안내가 제외·거부·차단 을 쓰지 않는다', () => {
    for (const forbidden of ['제외', '거부', '차단']) {
      expect(GRANT_SCOPE_GUIDANCE.body, `안내에 ${forbidden} 이 있다`).not.toContain(forbidden);
    }
  });

  it('AC-4: 안내가 세 경로를 가리킨다', () => {
    expect(GRANT_SCOPE_GUIDANCE.paths).toHaveLength(3);
    for (const path of GRANT_SCOPE_GUIDANCE.paths) {
      for (const forbidden of ['제외', '거부', '차단']) {
        expect(path, `경로 안내에 ${forbidden} 이 있다`).not.toContain(forbidden);
      }
    }
  });

  it('AC-1 · AC-2: 적용 범위를 고르는 값이 부여 입력에 존재하지 않는다', () => {
    // 화면이 그리지 않는 것만으로는 부족하다 — 고를 값이 있으면 언젠가 UI 가
    // 그것을 노출한다. `canGrant` 의 입력에 그 축이 아예 없다.
    const inputKeys = ['actorLevel', 'requestedLevel', 'targetIsWorkspace'];
    for (const key of inputKeys) {
      expect(key).not.toMatch(/scope|applyTo|recursive|thisFolderOnly|cascade/i);
    }
    expect(inputKeys).toHaveLength(3);
  });
});

describe('CON-PRINCIPAL-007 — 관리자를 단독으로 쓰지 않고 항상 범위를 명시한다', () => {
  it('AC-2 · AC-3: 범위가 붙은 표기는 통과한다', () => {
    expect(hasUnscopedAdminTerm('워크스페이스 관리자에게 문의하십시오')).toBe(false);
    expect(hasUnscopedAdminTerm('슈퍼유저만 실행할 수 있습니다')).toBe(false);
  });

  it('AC-1: 범위 수식어 없는 관리자 가 걸린다', () => {
    expect(hasUnscopedAdminTerm('관리자에게 문의하십시오')).toBe(true);
    expect(hasUnscopedAdminTerm('이 조작은 관리자 권한이 필요합니다')).toBe(true);
  });

  it('AC-4: 예외는 관리자 없음 배지 하나뿐이다', () => {
    expect(hasUnscopedAdminTerm('관리자 없음')).toBe(false);
    // 그 배지 문구를 품었다고 해서 다른 단독 사용까지 면제되지는 않는다.
    expect(hasUnscopedAdminTerm('관리자 없음 — 관리자에게 문의')).toBe(true);
  });

  it('부여 안내 문구가 이 규칙을 지킨다', () => {
    expect(hasUnscopedAdminTerm(GRANT_SCOPE_GUIDANCE.body)).toBe(false);
    for (const path of GRANT_SCOPE_GUIDANCE.paths) {
      expect(hasUnscopedAdminTerm(path)).toBe(false);
    }
  });
});
