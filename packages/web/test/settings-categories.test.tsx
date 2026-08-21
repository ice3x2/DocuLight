import { describe, expect, it } from 'vitest';

import {
  INSTANCE_SETTINGS,
  SETTINGS_CATEGORIES,
  visibleCategories,
  type Viewer,
} from '../src/shell/shell-contract.js';

const viewer = (over: Partial<Viewer> = {}): Viewer => ({
  superuser: false,
  workspaceCount: 1,
  adminWorkspaceCount: 0,
  ...over,
});

const labelsFor = (v: Viewer) => visibleCategories(v).map((c) => c.label);

describe('IR-SHELL-002 — 설정 카테고리 전량 목록과 표시 권한', () => {
  it('AC-8: 열거된 것 외의 카테고리가 없다 — 목록이 전량이다', () => {
    expect(SETTINGS_CATEGORIES.map((c) => c.label)).toEqual([
      '에디터',
      '외모(테마)',
      '액세스 토큰',
      '계정',
      '휴지통',
      '워크스페이스',
      '권한 감사',
      '감사 로그',
      '사용자 관리',
      '그룹 관리',
      '가입 승인',
      '전체 워크스페이스',
      '인스턴스 설정',
    ]);
  });

  it('AC-2: 개인 구역 세 카테고리가 전원에게 보인다', () => {
    // 워크스페이스가 하나도 없는 사용자에게도 보인다 — 개인 설정은 그
    // 사용자에게 매인 것이지 워크스페이스에 매인 것이 아니다.
    const nobody = labelsFor(viewer({ workspaceCount: 0 }));

    expect(nobody).toContain('에디터');
    expect(nobody).toContain('외모(테마)');
    expect(nobody).toContain('액세스 토큰');
  });

  it('AC-3: 계정 카테고리가 전원에게 보이고 비밀번호 변경·로그아웃 두 조작을 담는다', () => {
    expect(labelsFor(viewer({ workspaceCount: 0 }))).toContain('계정');

    const account = SETTINGS_CATEGORIES.find((c) => c.label === '계정');
    expect(account?.actions).toEqual(['비밀번호 변경', '로그아웃']);
  });

  it('AC-4 · FR-SHELL-007 AC-1: 워크스페이스가 1개 이상이면 휴지통이 보인다', () => {
    expect(labelsFor(viewer({ workspaceCount: 1 }))).toContain('휴지통');
  });

  it('IR-SHELL-002 AC-4 · FR-SHELL-007 AC-2: 워크스페이스가 하나도 없으면 휴지통이 보이지 않는다', () => {
    expect(labelsFor(viewer({ workspaceCount: 0 }))).not.toContain('휴지통');
  });

  it('AC-5: 워크스페이스 관리 구역은 관리 권한이 있는 사용자에게만 보인다', () => {
    const plain = labelsFor(viewer({ adminWorkspaceCount: 0 }));
    const admin = labelsFor(viewer({ adminWorkspaceCount: 1 }));

    for (const label of ['워크스페이스', '권한 감사', '감사 로그']) {
      expect(plain, `${label} 이 비관리자에게 보인다`).not.toContain(label);
      expect(admin, `${label} 이 관리자에게 없다`).toContain(label);
    }
  });

  it('AC-6: 인스턴스 구역은 슈퍼유저에게만 보인다', () => {
    // 워크스페이스 관리자라도 인스턴스 구역은 못 본다 — 관리 권한의
    // 범위가 워크스페이스이지 인스턴스가 아니다.
    const admin = labelsFor(viewer({ adminWorkspaceCount: 3 }));
    const root = labelsFor(viewer({ superuser: true }));

    for (const label of ['사용자 관리', '그룹 관리', '가입 승인', '전체 워크스페이스', '인스턴스 설정']) {
      expect(admin, `${label} 이 워크스페이스 관리자에게 보인다`).not.toContain(label);
      expect(root, `${label} 이 슈퍼유저에게 없다`).toContain(label);
    }
  });

  it('AC-7: 인스턴스 설정이 다섯 설정을 담는다', () => {
    expect(INSTANCE_SETTINGS).toEqual([
      '가입 모드',
      '업로드 크기 제한',
      '보관 버전 개수',
      '휴지통 보존 일수',
      '감사 로그 보존 기간',
    ]);
  });

  it('CON-SHELL-001 AC-3: 공유는 설정 카테고리가 아니다', () => {
    expect(SETTINGS_CATEGORIES.map((c) => c.label)).not.toContain('공유');
  });

  it('슈퍼유저라도 워크스페이스가 없으면 휴지통이 없다 — 우회가 표시 조건을 바꾸지 않는다', () => {
    // 표시 조건은 「접근 가능한 워크스페이스 1개 이상」이지 권한 등급이
    // 아니다. 슈퍼유저 우회가 여기까지 번지면 빈 휴지통이 열린다.
    expect(labelsFor(viewer({ superuser: true, workspaceCount: 0 }))).not.toContain('휴지통');
  });
});
