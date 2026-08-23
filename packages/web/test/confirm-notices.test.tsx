import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ShareModal } from '../src/acl/ShareModal.js';
import { GrantToast } from '../src/confirm/GrantToast.js';
import { RevokeConfirm } from '../src/confirm/RevokeConfirm.js';
import type { ShareViewBody } from '../src/api/client.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const view = (over: Partial<ShareViewBody> = {}): ShareViewBody => ({
  metrics: { reachable: 3, viaAcl: 2 },
  rows: [],
  level: 'admin',
  nodeKind: 'file',
  inheritsAcl: true,
  reached: 0,
  ...over,
});

const 열기 = async (kind: 'file' | 'directory' | 'workspace') => {
  render(<ShareModal nodeId="n1" nodeName="설계" nodeKind={kind} view={view()} />);
  await userEvent.setup().click(screen.getByRole('button', { name: '설계 공유' }));
  return screen.getByRole('dialog');
};

describe('FR-CONFIRM-013 — 컨테이너 부여의 상속 고지는 단일 템플릿이다', () => {
  it('AC-1 · AC-2 · AC-3: 두 컨테이너의 고지가 목적어만 다르다', async () => {
    const 디렉토리 = (await 열기('directory')).querySelector('[data-testid="inheritance-notice"]')
      ?.textContent;
    cleanup();
    const 워크스페이스 = (await 열기('workspace')).querySelector(
      '[data-testid="inheritance-notice"]',
    )?.textContent;

    expect(디렉토리).toBeDefined();
    expect(워크스페이스).toBeDefined();
    // 목적어를 서로 바꿔 끼우면 같은 문장이 된다 — 그것이 「단일 템플릿」의
    // 이행이며, 두 문장을 따로 쓰면 한쪽만 고쳐진다.
    expect(디렉토리!.replace('디렉토리', '§')).toBe(워크스페이스!.replace('워크스페이스', '§'));
  });

  it('문서에는 상속 고지가 없다 — 하위가 없는 자리에 붙이면 문구가 거짓이 된다', async () => {
    expect((await 열기('file')).querySelector('[data-testid="inheritance-notice"]')).toBeNull();
  });
});

describe('SEC-CONFIRM-004 — 상속 끊김 고지는 끊긴 노드 유무와 무관하다', () => {
  it('AC-1 · AC-2 · AC-3: 화면 상태가 달라져도 같은 문구가 같은 자리에 선다', async () => {
    const 문구들: (string | undefined)[] = [];

    // 이 화면이 받는 값을 폭넓게 흔든다 — 접근자 0 명·많음, 명단 없음·있음.
    // 끊긴 하위의 유무를 전달할 소품 자체가 없으므로 이것이 흔들 수 있는
    // 전부이고, 그 어느 조합에서도 문구가 같아야 한다.
    for (const over of [
      { metrics: { reachable: 0, viaAcl: 0 } },
      { metrics: { reachable: 40, viaAcl: 39 } },
      { rows: null, level: 'edit' as const },
    ]) {
      cleanup();
      render(<ShareModal nodeId="n1" nodeName="설계" nodeKind="directory" view={view(over)} />);
      await userEvent.setup().click(screen.getByRole('button', { name: '설계 공유' }));
      문구들.push(
        screen.getByRole('dialog').querySelector('[data-testid="broken-inheritance-notice"]')
          ?.textContent ?? undefined,
      );
    }

    expect(문구들[0]).toContain('상속이 끊긴 하위에는 적용되지 않습니다');
    expect(new Set(문구들).size).toBe(1);
  });
});

describe('SEC-CONFIRM-005 — 도달 못 하는 하위를 열거하거나 거부하지 않는다', () => {
  it('AC-2 · AC-3: 도달 실패를 뜻하는 문구도 목록도 없다', async () => {
    const text = (await 열기('directory')).textContent ?? '';

    expect(text).not.toContain('도달');
    expect(text).not.toContain('적용되지 않은 항목');
    expect(text).not.toMatch(/\d+\s*개 중/);
  });
});

describe('FR-CONFIRM-014 — 넓히기 L1 의 토스트는 실행취소가 아니라 회수다', () => {
  it('AC-1: 버튼 라벨이 회수다', () => {
    render(<GrantToast subjectName="한범" />);

    expect(screen.getByRole('button').textContent).toBe('회수');
  });

  it('AC-3: 실행취소 라는 라벨을 쓰지 않는다', () => {
    render(<GrantToast subjectName="한범" />);

    expect(screen.getByRole('status').textContent ?? '').not.toContain('실행취소');
  });

  it('AC-2: 이미 열람된 내용은 되돌지 않는다는 문구가 남는다', () => {
    render(<GrantToast subjectName="한범" />);

    expect(screen.getByRole('status').textContent ?? '').toContain('이미 열람된 내용은 회수되지 않습니다');
  });

  it('누르면 그 부여를 회수한다', async () => {
    const 걷는다 = vi.fn();
    render(<GrantToast subjectName="한범" entryId="e1" onRevoke={걷는다} />);

    await userEvent.setup().click(screen.getByRole('button'));

    expect(걷는다).toHaveBeenCalledWith('e1');
  });
});

describe('SEC-CONFIRM-006 — 컨테이너 회수의 첨부 영향은 개수 대신 고정 문구다', () => {
  const NOTICE = '이 폴더 안 문서의 첨부도 함께 접근할 수 없게 됩니다.';

  it('AC-2 · AC-3: 컨테이너면 하위 첨부의 유무와 무관하게 같은 문구가 선다', () => {
    const 문구 = (kind: 'directory' | 'workspace'): string | undefined => {
      cleanup();
      render(<RevokeConfirm open targetKind={kind} subjectName="한범" />);
      // 지운 뒤에 읽으면 빈 컨테이너를 읽는다 — 그리는 즉시 읽어 둔다.
      return screen.getByTestId('attachment-notice').textContent ?? undefined;
    };

    expect(문구('directory')).toBe(NOTICE);
    expect(문구('workspace')).toBe(NOTICE);
  });

  it('AC-1: 첨부 개수가 표시되지 않는다', () => {
    render(<RevokeConfirm open targetKind="directory" subjectName="한범" />);

    const text = screen.getByRole('alertdialog').textContent ?? '';
    expect(text).not.toMatch(/첨부\s*\d+/);
    expect(text).not.toMatch(/\d+\s*개 중/);
  });

  it('FR-CONFIRM-018 AC-1 · AC-2: 컨테이너 회수는 확인 다이얼로그를 받는다', () => {
    render(<RevokeConfirm open targetKind="directory" subjectName="한범" />);

    expect(screen.getByRole('alertdialog').getAttribute('data-grade')).toBe('L2');
  });

  it('FR-CONFIRM-018 AC-3: 문서 회수는 확인 없이 지나간다', () => {
    const 걷는다 = vi.fn();
    render(<RevokeConfirm open targetKind="file" subjectName="한범" onConfirm={걷는다} />);

    // 다이얼로그가 아예 서지 않는다 — `L1` 은 확인 없이 실행하고 되돌리기
    // 토스트를 띄우는 등급이다.
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(걷는다).toHaveBeenCalled();
  });

  it('문서 회수에는 첨부 문구가 붙지 않는다 — 폴더가 아닌 자리에서 거짓이 된다', () => {
    render(<RevokeConfirm open targetKind="file" subjectName="한범" />);

    expect(screen.queryByTestId('attachment-notice')).toBeNull();
  });
});

describe('FR-CONFIRM-015 · SEC-CONFIRM-007 — 상속 조작의 자리와 문턱', () => {
  const 모달 = async (over: Partial<ShareViewBody>, kind: 'file' | 'directory' | 'workspace') => {
    cleanup();
    render(<ShareModal nodeId="n1" nodeName="설계" nodeKind={kind} view={view(over)} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '설계 공유' }));
    return screen.getByRole('dialog');
  };

  it('FR-CONFIRM-015 AC-5: 워크스페이스에는 상속 끊기 토글이 렌더되지 않는다', async () => {
    const 워크스페이스 = await 모달({ nodeKind: 'workspace' }, 'workspace');
    expect(워크스페이스.querySelector('[data-testid="break-inheritance"]')).toBeNull();

    // 디렉토리에는 선다 — 부재 시험만 두면 아무 데도 안 그리는 구현이 통과한다.
    const 디렉토리 = await 모달({ nodeKind: 'directory' }, 'directory');
    expect(디렉토리.querySelector('[data-testid="break-inheritance"]')).toBeDefined();
  });

  it('FR-CONFIRM-015 AC-1 · AC-2: 디렉토리 상속 끊기는 영향 건수를 치는 L3 다', async () => {
    await 모달({ nodeKind: 'directory', reached: 24 }, 'directory');

    await userEvent.setup().click(screen.getByTestId('break-inheritance'));

    const gate = screen.getByRole('alertdialog');
    expect(gate.getAttribute('data-grade')).toBe('L3');
    // 토큰이 영향 건수 그 자체다 — 임의 문구를 치게 하면 그 수를 읽지 않고
    // 칠 수 있는데, 이 조작에서 확인해야 하는 것이 정확히 그 수다.
    expect(gate.textContent ?? '').toContain('24');
    expect(gate.textContent ?? '').not.toContain('24 /');
  });

  it('FR-CONFIRM-015 AC-4: 문서 상속 끊기는 L2 다', async () => {
    await 모달({ nodeKind: 'file', reached: 0 }, 'file');

    await userEvent.setup().click(screen.getByTestId('break-inheritance'));

    expect(screen.getByRole('alertdialog').getAttribute('data-grade')).toBe('L2');
  });

  it('SEC-CONFIRM-007 AC-1 · AC-2: 부모 권한 가져오기는 관리 레벨에만 보인다', async () => {
    const 끊김 = { nodeKind: 'directory' as const, inheritsAcl: false };

    const 관리자 = await 모달({ ...끊김, level: 'admin' }, 'directory');
    expect(관리자.querySelector('[data-testid="inherit-from-parent"]')).toBeDefined();

    const 편집자 = await 모달({ ...끊김, level: 'edit', rows: null }, 'directory');
    // 편집자가 열거할 수 없는 집합을 통째로 부여하는 조작이라, 열면
    // 「누구인지 알 수 없는 11명에게 부여하시겠습니까」라는 성립 불가능한
    // 확인이 된다.
    expect(편집자.querySelector('[data-testid="inherit-from-parent"]')).toBeNull();
  });

  it('상속이 이어져 있으면 가져올 것이 없으므로 버튼도 없다', async () => {
    const 이어짐 = await 모달({ nodeKind: 'directory', inheritsAcl: true, level: 'admin' }, 'directory');

    expect(이어짐.querySelector('[data-testid="inherit-from-parent"]')).toBeNull();
  });

  it('SEC-CONFIRM-007 AC-4: 가져오기는 확인 다이얼로그를 받는다', async () => {
    const 가져온다 = vi.fn();
    cleanup();
    render(
      <ShareModal
        nodeId="n1"
        nodeName="설계"
        nodeKind="directory"
        view={view({ nodeKind: 'directory', inheritsAcl: false, level: 'admin' })}
        onInheritFromParent={가져온다}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '설계 공유' }));
    await user.click(screen.getByTestId('inherit-from-parent'));

    expect(screen.getByRole('alertdialog').getAttribute('data-grade')).toBe('L2');
    expect(가져온다).not.toHaveBeenCalled();

    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '실행' }));
    expect(가져온다).toHaveBeenCalledTimes(1);
  });
});
