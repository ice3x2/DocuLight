import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from '../src/shell/AppShell.js';
import type { Viewer } from '../src/shell/shell-contract.js';
import {
  DEFAULT_TOKEN_EXPIRY_DAYS,
  TOKEN_EXPIRY_CHOICES,
  type TokenRowView,
} from '../src/settings/token-contract.js';

/**
 * 개인 › 액세스 토큰 (`SEC-AUTH-006` AC-2 · `SEC-AUTH-007` AC-1 · AC-2 ·
 * `04` §2.3 · EC12).
 *
 * **설정 모달을 통해 연다.** 부품을 직접 그리면 「배열에만 있고 렌더되지
 * 않는」 상태가 그대로 통과한다 — `IR-SHELL-002` VE-3 가 같은 이유로
 * 적어 둔 선례이며, 이 카테고리가 정확히 그 상태였다.
 */

afterEach(cleanup);

const ME: Viewer = { superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 };

const row = (over: Partial<TokenRowView> = {}): TokenRowView => ({
  id: 't1',
  name: '노트북 CLI',
  scope: 'read-write',
  expiresAt: '2099-11-10T00:00:00.000Z',
  lastUsedAt: null,
  revokedAt: null,
  ...over,
});

async function 토큰탭을연다(props: Parameters<typeof AppShell>[0] = { viewer: ME }) {
  const user = userEvent.setup();
  render(<AppShell {...props} viewer={props.viewer ?? ME} />);
  await user.click(screen.getByRole('button', { name: '설정' }));
  const modal = await screen.findByRole('dialog', { name: '설정' });
  await user.click(within(modal).getByRole('tab', { name: '액세스 토큰' }));
  return { user, modal, panel: within(modal).getByRole('tabpanel', { name: '액세스 토큰' }) };
}

describe('IR-SHELL-002 — 「액세스 토큰」 탭에 본문이 있다', () => {
  it('탭을 열면 라벨 한 줄이 아니라 목록과 발급 폼이 선다', async () => {
    const { panel } = await 토큰탭을연다({ viewer: ME, tokens: [row()] });

    // 배선이 없던 시절 이 자리에 그려지던 것은 `<p>액세스 토큰</p>` 하나였다.
    expect(panel.textContent).not.toBe('액세스 토큰');
    expect(within(panel).getByRole('button', { name: '새 액세스 토큰' })).toBeDefined();
    expect(within(panel).getByText('노트북 CLI')).toBeDefined();
  });
});

describe('04 §2.3 — 목록', () => {
  it('이름·스코프·만료일·마지막 사용을 그린다', async () => {
    const { panel } = await 토큰탭을연다({
      viewer: ME,
      tokens: [row({ lastUsedAt: '2026-08-22T08:57:00.000Z' })],
    });

    expect(within(panel).getByText('노트북 CLI')).toBeDefined();
    expect(within(panel).getByText('읽기+쓰기')).toBeDefined();
    expect(panel.textContent).toContain('2099-11-10');
    expect(panel.textContent).toContain('2026-08-22');
  });

  it('쓴 적 없는 토큰은 `사용 안 함` 이다 — 빈 칸이면 폐기 판단이 서지 않는다', async () => {
    const { panel } = await 토큰탭을연다({ viewer: ME, tokens: [row({ lastUsedAt: null })] });

    expect(within(panel).getByText('사용 안 함')).toBeDefined();
  });

  it('만료된 토큰은 `(만료됨)` 으로 표시하고 지우지 않는다', async () => {
    const { panel } = await 토큰탭을연다({
      viewer: ME,
      tokens: [row({ name: '구형 데스크탑', expiresAt: '2020-08-01T00:00:00.000Z' })],
    });

    expect(within(panel).getByText('구형 데스크탑')).toBeDefined();
    expect(panel.textContent).toContain('(만료됨)');
  });

  it('만료된 행은 산 행보다 흐리다 — §2.3 은 배지와 함께 「행 흐리게」를 요구한다', async () => {
    const { panel } = await 토큰탭을연다({
      viewer: ME,
      tokens: [
        row(),
        row({ id: 't2', name: '구형 데스크탑', expiresAt: '2020-08-01T00:00:00.000Z' }),
      ],
    });

    const 행 = (이름: string) => within(panel).getByText(이름).closest('tr') as HTMLElement;

    // **계산된 값으로 잰다.** 표식만 붙고 실제로는 아무것도 흐려지지 않는
    // 상태가 통과하지 않게 한다.
    expect(Number(getComputedStyle(행('구형 데스크탑')).opacity)).toBeLessThan(
      Number(getComputedStyle(행('노트북 CLI')).opacity),
    );
  });
});

describe('04 §2.3 — 고지 문구 둘', () => {
  /** 뒤따르는 형제인가. 「상단」·「하단」은 위치의 요구라 순서를 실제로 잰다. */
  const 뒤에온다 = (앞: Element, 뒤: Element) =>
    Boolean(앞.compareDocumentPosition(뒤) & Node.DOCUMENT_POSITION_FOLLOWING);

  it('R58-c 교집합 고지가 목록 위에 선다 — 넓은 스코프를 골라도 유효 권한을 넘지 못한다', async () => {
    const { panel } = await 토큰탭을연다({ viewer: ME, tokens: [row()] });

    // §2.3 의 목업이 화면 머리에 두 줄로 적어 둔 것이다. 뒤의 줄은 장식이
    // 아니라, 사용자가 `읽기+쓰기` 를 골라도 그 토큰이 자기 유효 권한을
    // 넘지 못한다는 사실을 알리는 자리다.
    const 고지 = within(panel).getByTestId('token-scope-notice');
    expect(고지.textContent).toContain('MCP');
    expect(고지.textContent).toContain('교집합');

    expect(
      뒤에온다(고지, within(panel).getByRole('button', { name: '새 액세스 토큰' })),
      '교집합 고지가 발급 버튼보다 아래에 있다',
    ).toBe(true);
    expect(
      뒤에온다(고지, within(panel).getByRole('table')),
      '교집합 고지가 목록보다 아래에 있다',
    ).toBe(true);
  });

  it('R58-d 고지가 화면 하단에 선다 — 이 화면에서 조작할 수 없는 사실이다', async () => {
    const { panel } = await 토큰탭을연다({ viewer: ME, tokens: [row()] });

    const 고지 = within(panel).getByTestId('token-account-notice');
    expect(고지.textContent).toContain('즉시 무효');

    expect(
      뒤에온다(within(panel).getByRole('table'), 고지),
      'R58-d 고지가 목록보다 위에 있다 — §2.3 은 하단을 요구한다',
    ).toBe(true);
  });
});

describe('SEC-AUTH-007 AC-1 · SEC-AUTH-008 AC-1 — 발급 폼', () => {
  it('이름·스코프 2택·만료 기간을 담고 그 값이 그대로 나간다', async () => {
    const onIssueToken = vi.fn(async () => ({ token: 'dl_pat_9f2c8a1' }));
    const { user, panel } = await 토큰탭을연다({ viewer: ME, tokens: [], onIssueToken });

    await user.click(within(panel).getByRole('button', { name: '새 액세스 토큰' }));
    const form = await screen.findByRole('dialog', { name: '새 액세스 토큰' });

    await user.type(within(form).getByLabelText('이름'), 'CI 스크립트');
    await user.click(within(form).getByRole('radio', { name: '읽기 전용' }));
    await user.selectOptions(within(form).getByLabelText('만료 기간'), '180');
    await user.click(within(form).getByRole('button', { name: '발급' }));

    expect(onIssueToken).toHaveBeenCalledWith({
      name: 'CI 스크립트',
      scope: 'read-only',
      expiresInDays: 180,
    });
  });

  /**
   * **스코프 기본값은 `읽기 전용` 이다** (`04` §2.3 — 「설계자 판단,
   * fail-closed」).
   *
   * 이 항은 **아무 라디오도 누르지 않는다.** 위의 「값이 그대로 나간다」 항은
   * 읽기 전용을 명시적으로 눌러 그 기본값을 지우므로, 기본값이 무엇이든
   * 통과한다 — 실제로 기본값이 `읽기+쓰기` 인 채로 전건이 통과했다. 기본값
   * 자체를 재는 자리가 따로 있어야 그 되돌림이 잡힌다.
   *
   * 넓은 쪽이 기본이면 아무 생각 없이 발급한 토큰이 쓰기 상한을 갖는다.
   * `SEC-AUTH-008` 은 스코프가 「상한만 낮춘다」고 규정하므로, 고르지 않은
   * 사람에게 돌아가야 하는 것은 가장 낮은 상한이다.
   */
  it('스코프 기본값은 `읽기 전용` 이고 그 값이 그대로 나간다', async () => {
    const onIssueToken = vi.fn(async () => ({ token: 'dl_pat_9f2c8a1' }));
    const { user, panel } = await 토큰탭을연다({ viewer: ME, tokens: [], onIssueToken });

    await user.click(within(panel).getByRole('button', { name: '새 액세스 토큰' }));
    const form = await screen.findByRole('dialog', { name: '새 액세스 토큰' });

    const 읽기전용 = within(form).getByRole('radio', { name: '읽기 전용' }) as HTMLInputElement;
    const 읽기쓰기 = within(form).getByRole('radio', { name: '읽기+쓰기' }) as HTMLInputElement;
    expect(읽기전용.checked, '넓은 쪽이 기본으로 선택돼 있다').toBe(true);
    expect(읽기쓰기.checked).toBe(false);

    // **표시와 나가는 값을 함께 잰다.** 라디오만 보면 `checked` 는 좁은 쪽을
    // 가리키는데 상태는 넓은 쪽을 든 구현이 통과한다.
    await user.type(within(form).getByLabelText('이름'), 'CI 스크립트');
    await user.click(within(form).getByRole('button', { name: '발급' }));

    expect(onIssueToken).toHaveBeenCalledWith({
      name: 'CI 스크립트',
      scope: 'read-only',
      expiresInDays: DEFAULT_TOKEN_EXPIRY_DAYS,
    });
  });

  it('폼을 다시 열면 앞 회차에 고른 `읽기+쓰기` 가 남지 않는다', async () => {
    const onIssueToken = vi.fn(async () => ({ token: 'dl_pat_9f2c8a1' }));
    const { user, panel } = await 토큰탭을연다({ viewer: ME, tokens: [], onIssueToken });

    // 한 번 넓은 쪽을 골라 두고 취소한다. 폼을 여는 자리가 기본값을 다시
    // 세우지 않으면, 두 번째 발급이 앞 회차의 선택을 조용히 물려받는다.
    await user.click(within(panel).getByRole('button', { name: '새 액세스 토큰' }));
    const first = await screen.findByRole('dialog', { name: '새 액세스 토큰' });
    await user.click(within(first).getByRole('radio', { name: '읽기+쓰기' }));
    await user.click(within(first).getByRole('button', { name: '취소' }));

    await user.click(within(panel).getByRole('button', { name: '새 액세스 토큰' }));
    const second = await screen.findByRole('dialog', { name: '새 액세스 토큰' });

    expect(
      (within(second).getByRole('radio', { name: '읽기 전용' }) as HTMLInputElement).checked,
      '앞 회차의 `읽기+쓰기` 가 그대로 남았다',
    ).toBe(true);

    await user.type(within(second).getByLabelText('이름'), 'CI 스크립트');
    await user.click(within(second).getByRole('button', { name: '발급' }));

    expect(onIssueToken).toHaveBeenCalledWith({
      name: 'CI 스크립트',
      scope: 'read-only',
      expiresInDays: DEFAULT_TOKEN_EXPIRY_DAYS,
    });
  });

  it(`만료 기간은 정해진 넷이고 기본값이 ${DEFAULT_TOKEN_EXPIRY_DAYS}일이다`, async () => {
    const { user, panel } = await 토큰탭을연다({ viewer: ME, tokens: [] });

    await user.click(within(panel).getByRole('button', { name: '새 액세스 토큰' }));
    const form = await screen.findByRole('dialog', { name: '새 액세스 토큰' });
    const select = within(form).getByLabelText('만료 기간') as HTMLSelectElement;

    expect([...select.options].map((option) => Number(option.value))).toEqual([
      ...TOKEN_EXPIRY_CHOICES,
    ]);
    expect(Number(select.value)).toBe(DEFAULT_TOKEN_EXPIRY_DAYS);
  });

  it('이름이 비면 발급하지 않는다 — 이름 없는 토큰은 목록에서 서로 구별되지 않는다', async () => {
    const onIssueToken = vi.fn(async () => ({ token: 'x' }));
    const { user, panel } = await 토큰탭을연다({ viewer: ME, tokens: [], onIssueToken });

    await user.click(within(panel).getByRole('button', { name: '새 액세스 토큰' }));
    const form = await screen.findByRole('dialog', { name: '새 액세스 토큰' });
    await user.click(within(form).getByRole('button', { name: '발급' }));

    expect(onIssueToken).not.toHaveBeenCalled();
  });
});

describe('SEC-AUTH-006 AC-2 · EC12 — 평문 1회 노출', () => {
  const 발급한다 = async (
    user: ReturnType<typeof userEvent.setup>,
    panel: HTMLElement,
    token = 'dl_pat_9f2c8a1',
  ) => {
    await user.click(within(panel).getByRole('button', { name: '새 액세스 토큰' }));
    const form = await screen.findByRole('dialog', { name: '새 액세스 토큰' });
    await user.type(within(form).getByLabelText('이름'), '노트북 CLI');
    await user.click(within(form).getByRole('button', { name: '발급' }));
    return { reveal: await screen.findByRole('dialog', { name: '토큰이 발급되었다' }), token };
  };

  const 발급되는셸 = (token = 'dl_pat_9f2c8a1') => ({
    viewer: ME,
    tokens: [] as readonly TokenRowView[],
    onIssueToken: vi.fn(async () => ({ token })),
  });

  it('발급 직후 평문이 화면에 뜬다', async () => {
    const { user, panel } = await 토큰탭을연다(발급되는셸());

    const { reveal, token } = await 발급한다(user, panel);

    expect(reveal.textContent).toContain(token);
    // 다시 볼 수 없다는 사실을 그 자리에서 알린다.
    expect(reveal.textContent).toContain('한 번만');
  });

  /**
   * **끊긴 노드를 붙들고 재지 않는다.**
   *
   * `reveal` 은 DOM 노드 참조라, 다이얼로그가 닫혀 React 가 그것을 떼어낸
   * 뒤에도 `textContent` 는 옛 값을 그대로 들고 있다. 그래서 그 값으로
   * 단언하면 「닫히지 않았다」와 「닫혔는데 참조가 남았다」가 구별되지 않고,
   * EC12 의 방어를 통째로 걷어내도 항이 죽지 않는다 — 실제로 뮤테이션
   * 탐침이 그 사실을 잡았다. 살아 있는 질의로 다시 찾아 잰다.
   */
  const 지금보이는평문 = () => screen.getByTestId('token-plaintext').textContent;

  it('ESC 로 닫히지 않는다 — 설정 모달까지 함께 닫히지도 않는다', async () => {
    const { user, modal, panel } = await 토큰탭을연다(발급되는셸());
    const { token } = await 발급한다(user, panel);

    await user.keyboard('{Escape}');

    expect(지금보이는평문(), 'ESC 로 평문이 사라졌다').toBe(token);
    // 바깥의 설정 모달이 대신 닫혀도 결과는 같다 — 평문이 사라진다.
    // 접근성 트리가 아니라 **연결 여부**로 잰다: 위에 선 다이얼로그가
    // 바깥을 `aria-hidden` 으로 덮는 것은 올바른 동작이라, 역할 질의로는
    // 「닫혔다」와 구별되지 않는다.
    expect(modal.isConnected, 'ESC 가 설정 모달까지 닫았다').toBe(true);
  });

  it('바깥을 눌러도 닫히지 않는다', async () => {
    const { user, panel } = await 토큰탭을연다(발급되는셸());
    const { token } = await 발급한다(user, panel);

    // `user.click` 을 쓰지 않는다 — 모달이 바깥의 포인터 이벤트를 이미
    // 끊어 두어 클릭 자체가 거절되고, 그러면 이 항이 「닫히지 않았다」가
    // 아니라 「누르지 못했다」를 재게 된다. 감지 이벤트를 직접 낸다.
    fireEvent.pointerDown(document.body);
    fireEvent.pointerUp(document.body);
    fireEvent.click(document.body);

    expect(지금보이는평문(), '바깥 클릭으로 평문이 사라졌다').toBe(token);
  });

  it('`닫기` 는 재확인을 받는다 — 복사하지 않았다면 여기서 되돌린다', async () => {
    const { user, panel } = await 토큰탭을연다(발급되는셸());
    const { reveal, token } = await 발급한다(user, panel);

    await user.click(within(reveal).getByRole('button', { name: '닫기' }));

    expect(reveal.textContent).toContain('복사하지 않았다면');
    expect(reveal.textContent).toContain('다시 볼 수 없습니다');
    // 재확인 중에도 평문은 아직 화면에 있다 — 되돌릴 자리이기 때문이다.
    await user.click(within(reveal).getByRole('button', { name: '취소' }));
    expect(reveal.textContent).toContain(token);
  });

  it('재확인을 지나 닫으면 평문이 사라지고 재발급 안내가 목록 위에 선다', async () => {
    const { user, panel } = await 토큰탭을연다(발급되는셸());
    const { reveal, token } = await 발급한다(user, panel);

    // 닫기 전에는 안내가 없다 — 늘 떠 있으면 그 문구가 배경이 되어 읽히지 않는다.
    expect(panel.textContent).not.toContain('재발급');

    await user.click(within(reveal).getByRole('button', { name: '닫기' }));
    await user.click(within(reveal).getByRole('button', { name: '그래도 닫기' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '토큰이 발급되었다' })).toBeNull();
    });
    expect(document.body.textContent, '닫은 뒤에도 평문이 화면에 남아 있다').not.toContain(token);
    expect(panel.textContent).toContain('재발급');
  });

  it('`복사하고 닫기` 는 클립보드에 넣고 재확인 없이 닫는다', async () => {
    const { user, panel } = await 토큰탭을연다(발급되는셸());
    const { reveal, token } = await 발급한다(user, panel);

    await user.click(within(reveal).getByRole('button', { name: '복사하고 닫기' }));

    // `userEvent.setup()` 이 세운 클립보드 스텁을 그대로 읽는다. 직접
    // 스텁을 끼우면 그것이 이 스텁에 덮여, 이 항이 아무것도 재지 못한다.
    await waitFor(async () => {
      expect(await navigator.clipboard.readText()).toBe(token);
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '토큰이 발급되었다' })).toBeNull();
    });
  });

  /**
   * **복사에 실패했는데 닫히면 EC12 를 다른 입구로 되돌린다.**
   *
   * 클립보드는 거절할 수 있다(비보안 오리진 · 권한 거부). 그때 그대로 닫으면
   * 사용자는 복사된 줄 알고 평문을 잃는다 — EC12 가 막으려는 바로 그 상황이며,
   * 여기서는 사용자가 잘못 누른 것도 아니다.
   */
  it('클립보드가 거절하면 닫지 않고 실패를 알린다 — 닫는 길은 `닫기` 로 남는다', async () => {
    const { user, panel } = await 토큰탭을연다(발급되는셸());
    const { reveal, token } = await 발급한다(user, panel);

    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('권한 거부'));

    await user.click(within(reveal).getByRole('button', { name: '복사하고 닫기' }));

    await waitFor(() => {
      expect(within(reveal).getByTestId('token-copy-failed')).toBeDefined();
    });
    expect(지금보이는평문(), '복사에 실패했는데 닫혔다').toBe(token);

    // 갇히지 않는다 — 재확인을 거쳐 닫는 길이 그대로 있다.
    await user.click(within(reveal).getByRole('button', { name: '닫기' }));
    expect(reveal.textContent).toContain('복사하지 않았다면');
  });
});

describe('SEC-AUTH-007 AC-2 · R115-b — 폐기는 L2 확인을 받는다', () => {
  it('폐기 버튼이 L2 관문을 세우고 실행해야 나간다', async () => {
    const onRevokeToken = vi.fn();
    const { user, panel } = await 토큰탭을연다({ viewer: ME, tokens: [row()], onRevokeToken });

    await user.click(within(panel).getByRole('button', { name: '노트북 CLI 폐기' }));

    const gate = await screen.findByRole('alertdialog');
    // 등급 체계를 재사용한다 — 화면마다 자기 확인을 만들면 같은 등급 이름에
    // 다른 절차가 붙는다 (`FR-CONFIRM-001`).
    expect(gate.getAttribute('data-grade')).toBe('L2');
    expect(onRevokeToken, '확인 전에 이미 나갔다').not.toHaveBeenCalled();

    await user.click(within(gate).getByRole('button', { name: '실행' }));

    expect(onRevokeToken).toHaveBeenCalledWith('t1');
  });

  it('취소하면 아무것도 나가지 않는다', async () => {
    const onRevokeToken = vi.fn();
    const { user, panel } = await 토큰탭을연다({ viewer: ME, tokens: [row()], onRevokeToken });

    await user.click(within(panel).getByRole('button', { name: '노트북 CLI 폐기' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '취소' }));

    expect(onRevokeToken).not.toHaveBeenCalled();
  });

  it('이미 폐기된 토큰에는 폐기 버튼이 서지 않는다', async () => {
    const { panel } = await 토큰탭을연다({
      viewer: ME,
      tokens: [row({ revokedAt: '2026-08-22T09:00:00.000Z' })],
    });

    expect(within(panel).queryByRole('button', { name: '노트북 CLI 폐기' })).toBeNull();
    expect(panel.textContent).toContain('폐기됨');
  });
});

describe('만료 선택지는 서버와 한 벌이다', () => {
  it('web 의 선택지가 server 의 것과 같다 — 갈리면 화면이 서버가 거절할 값을 내민다', async () => {
    const root = existsSync(resolve(process.cwd(), 'src/main.tsx'))
      ? resolve(process.cwd(), '../..')
      : process.cwd();
    const source = await readFile(
      join(root, 'packages/server/src/domain/auth/token-expiry.ts'),
      'utf8',
    );

    // 두 패키지는 서로를 import 하지 못하므로(`CON-ARCH-003`) 같은 값이
    // 두 벌 존재한다. 한쪽만 고쳐지면 사용자에게는 「발급을 눌렀는데 400」
    // 으로만 보이므로, 그 어긋남을 여기서 잡는다.
    expect(source).toContain(`TOKEN_EXPIRY_CHOICES = [${TOKEN_EXPIRY_CHOICES.join(', ')}]`);
    expect(source).toContain(`DEFAULT_TOKEN_EXPIRY_DAYS: TokenExpiryDays = ${DEFAULT_TOKEN_EXPIRY_DAYS}`);
  });
});
