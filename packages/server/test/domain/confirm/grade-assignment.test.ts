import { describe, expect, it } from 'vitest';

import {
  ASSIGNED_GRADES,
  breakInheritanceGrade,
  bulkRevokeGrade,
  moveGrade,
  revokeEntryGrade,
} from '../../../src/domain/confirm/grade.js';

describe('FR-CONFIRM-015 — 상속 끊기의 등급은 대상 노드 유형으로 갈린다', () => {
  it('AC-1 · AC-2: 디렉토리는 L3 이고 토큰은 영향 건수 그대로다', () => {
    expect(breakInheritanceGrade({ kind: 'directory', affected: 24 })).toEqual({
      grade: 'L3',
      token: '24',
    });
  });

  it('AC-3: 건수에 분모가 붙지 않는다', () => {
    const { token } = breakInheritanceGrade({ kind: 'directory', affected: 24 });

    // 분모를 실을 자리가 없다 — 「24 / 30」이면 그 차액이 곧 보이지 않는
    // 서브트리의 크기가 된다.
    expect(token).not.toContain('/');
    expect(token).toBe('24');
  });

  it('AC-4: 디렉토리가 아니면 L2 이고 토큰이 없다', () => {
    expect(breakInheritanceGrade({ kind: 'file', affected: 0 })).toEqual({
      grade: 'L2',
      token: null,
    });
  });

  it('디렉토리인데 영향이 0 건이어도 L3 을 유지한다 — 등급이 계산 결과로 흔들리지 않는다', () => {
    // 등급이 건수로 갈리면 「0 건이라 확인 없이 지나갔다」가 곧 그 아래에
    // 아무것도 없다는 신호가 된다.
    expect(breakInheritanceGrade({ kind: 'directory', affected: 0 }).grade).toBe('L3');
  });
});

describe('FR-CONFIRM-016 — 이동의 등급은 접근 가능 수치의 변화로 정한다', () => {
  it('AC-1: 늘어나면 L2 다', () => {
    expect(moveGrade({ before: 3, after: 5 })).toBe('L2');
  });

  it('AC-2: 줄어들어도 L2 다', () => {
    expect(moveGrade({ before: 5, after: 3 })).toBe('L2');
  });

  it('AC-3: 같으면 L1 이다', () => {
    expect(moveGrade({ before: 4, after: 4 })).toBe('L1');
    expect(moveGrade({ before: 0, after: 0 })).toBe('L1');
  });
});

describe('FR-CONFIRM-017 — 복사는 언제나 L2 다', () => {
  it('AC-1~AC-4: 배정표에 조건 없는 값 하나로 들어 있다', () => {
    // 함수가 아니라 **표의 한 줄**인 것이 이 요구의 이행이다 — 인자를 받는
    // 순간 그 인자로 가르는 구현이 생기고, 조건부 판정을 두지 않는다는
    // 것이 이 요구가 이동과 갈리는 지점이다.
    expect(ASSIGNED_GRADES.copy).toBe('L2');
  });
});

describe('FR-CONFIRM-018 — 컨테이너 노드의 권한 항목 회수는 L2 다', () => {
  it('AC-1 · AC-2: 디렉토리와 워크스페이스는 L2 다', () => {
    expect(revokeEntryGrade('directory')).toBe('L2');
    expect(revokeEntryGrade('workspace')).toBe('L2');
  });

  it('AC-3: 문서 노드는 L1 을 유지한다', () => {
    expect(revokeEntryGrade('file')).toBe('L1');
  });

  it('문서 쪽 값은 배정표의 그 줄을 그대로 쓴다 — 두 곳에 적으면 한쪽만 바뀐다', () => {
    expect(revokeEntryGrade('file')).toBe(ASSIGNED_GRADES['revoke-node-entry']);
  });
});

describe('FR-CONFIRM-022 — 일괄 회수 L3 의 토큰은 영향 건수이고 0건은 실행을 막는다', () => {
  it('AC-1: 토큰이 회수될 항목 수 그대로다', () => {
    expect(bulkRevokeGrade(7)).toEqual({ grade: 'L3', token: '7', blocked: false });
  });

  it('AC-3: 항목 수에 분모가 붙지 않는다', () => {
    expect(bulkRevokeGrade(7).token).not.toContain('/');
  });

  it('AC-5: 0 건이면 등급을 낮추지 않고 실행을 막는다', () => {
    const outcome = bulkRevokeGrade(0);

    // 강등(L2)이 아니라 차단이다 — 강등하면 「확인만 하고 아무 일도 안
    // 일어나는」 경로가 생기고, 그 무해한 통과가 곧 0 건이라는 신호다.
    expect(outcome.blocked).toBe(true);
    expect(outcome.grade).toBe('L3');
  });

  it('AC-6: 일부만 0 건인 다건 선택은 총합으로 판정한다', () => {
    // 주체별로 판정하면 0 건인 주체가 조용히 빠지고, 어느 주체가 빠졌는지가
    // 곧 그 주체에게 항목이 없다는 신호다.
    expect(bulkRevokeGrade(0 + 0 + 3)).toEqual({ grade: 'L3', token: '3', blocked: false });
  });
});

describe('직접 지정이 새로 들어온 조작들', () => {
  it('오프보딩 그룹 멤버십 제거는 L2 이고 단건 멤버 제거는 L1 이다 (`FR-CONFIRM-009`)', () => {
    expect(ASSIGNED_GRADES['offboard-memberships']).toBe('L2');
    // 같은 조작이 화면에 따라 갈리는 기준은 「복원 정보가 화면에 남는가」다.
    expect(ASSIGNED_GRADES['remove-group-member']).toBe('L1');
  });

  it('부모 권한 가져오기는 L2 다 (`SEC-CONFIRM-007` AC-4)', () => {
    expect(ASSIGNED_GRADES['inherit-from-parent']).toBe('L2');
  });

  it('워크스페이스 생성 시점의 부여는 L2 다 (`FR-CONFIRM-019`)', () => {
    expect(ASSIGNED_GRADES['create-workspace-grant']).toBe('L2');
  });

  it('휴지통 일괄 영구 삭제의 L3 배정이 지워지지 않고 남아 있다 (`CON-CONFIRM-001` AC-2)', () => {
    // 지우면 훗날 도입할 때 등급이 다시 창작되어 두 설계서가 각자 다른
    // 근거를 만드는 사고가 재발한다.
    expect(ASSIGNED_GRADES['purge-many']).toBe('L3');
  });
});
