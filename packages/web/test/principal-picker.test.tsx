import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as pickerModule from '../src/principal/PrincipalPicker.js';
import { PrincipalPicker } from '../src/principal/PrincipalPicker.js';
import type { PrincipalRow } from '../src/api/client.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const WEB = existsSync(resolve(process.cwd(), 'src/main.tsx'))
  ? process.cwd()
  : resolve(process.cwd(), 'packages/web');

const row = (over: Partial<PrincipalRow> = {}): PrincipalRow => ({
  id: 'p1',
  name: '한범',
  kind: 'user',
  status: 'active',
  ...over,
});

/** 서버가 준 목록을 그대로 흉내 낸다 — 화면이 무엇을 하는지만 남긴다. */
const serving = (rows: readonly PrincipalRow[]) => {
  const spy = vi.fn(
    () =>
      new Response(JSON.stringify(rows), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', spy);
  return spy;
};

const type = async (text: string) => {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('사용자·그룹 검색'), text);
};

describe('SEC-PRINCIPAL-003 — 최소 질의 길이와 결과 상한이 부품에 박혀 있다', () => {
  it('AC-1: 한 글자만 치면 서버에 묻지 않는다', async () => {
    const asked = serving([row()]);
    render(<PrincipalPicker />);

    await type('한');

    // 짧은 질의를 서버가 거절하더라도 여기서 묻는 것 자체가 열거 시도를
    // 한 글자씩 반복할 수 있게 만든다.
    expect(asked).not.toHaveBeenCalled();
  });

  it('AC-2: 두 글자를 치면 묻는다', async () => {
    const asked = serving([row()]);
    render(<PrincipalPicker />);

    await type('한범');

    await waitFor(() => expect(asked).toHaveBeenCalled());
    expect(await screen.findByText('한범')).toBeTruthy();
  });

  it('AC-3: 서버가 스물다섯을 줘도 스무 줄까지만 그린다', async () => {
    serving(Array.from({ length: 25 }, (_, n) => row({ id: `p${n}`, name: `검색대상${n}` })));
    render(<PrincipalPicker />);

    await type('검색대상');

    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(20));
  });

  it('AC-4: 두 값을 바깥에서 집을 경로가 없다', () => {
    // 상수를 내보내는 순간 화면이 그것을 읽고 자기 값으로 바꿔 쓰는 길이
    // 열린다. 이 부품이 내보내는 것은 부품 하나뿐이어야 한다.
    expect(Object.keys(pickerModule)).toEqual(['PrincipalPicker']);
  });
});

describe('SEC-PRINCIPAL-002 — 상태 배지', () => {
  it('AC-4: 모든 줄에 상태 배지가 붙는다', async () => {
    serving([
      row({ id: 'a', name: '검색대상활성', status: 'active' }),
      row({ id: 'b', name: '검색대상대기', status: 'pending' }),
      row({ id: 'c', name: '검색대상비활성', status: 'suspended' }),
    ]);
    render(<PrincipalPicker />);

    await type('검색대상');

    await waitFor(() => expect(screen.getAllByTestId('principal-status')).toHaveLength(3));
  });

  it('AC-5: suspended 의 배지 문구는 비활성 이다', async () => {
    serving([row({ name: '검색대상비활성', status: 'suspended' })]);
    render(<PrincipalPicker />);

    await type('검색대상');

    expect((await screen.findByTestId('principal-status')).textContent).toBe('비활성');
  });

  it('AC-5: 어떤 배지도 정지·오프보딩을 함의하지 않는다', async () => {
    serving([
      row({ id: 'a', name: '검색대상활성', status: 'active' }),
      row({ id: 'b', name: '검색대상대기', status: 'pending' }),
      row({ id: 'c', name: '검색대상비활성', status: 'suspended' }),
    ]);
    render(<PrincipalPicker />);

    await type('검색대상');

    await waitFor(() => expect(screen.getAllByTestId('principal-status')).toHaveLength(3));
    for (const badge of screen.getAllByTestId('principal-status')) {
      // 부여하는 제3자에게 그 계정의 징계나 오프보딩을 노출하지 않는다.
      expect(badge.textContent ?? '').not.toMatch(/정지|오프보딩|퇴사|차단|거절/);
    }
  });
});

describe('CON-PRINCIPAL-006 — 주체를 고르는 자리는 이 부품 하나다', () => {
  const sources = (at: string): string[] =>
    readdirSync(at).flatMap((name) => {
      const full = join(at, name);
      if (statSync(full).isDirectory()) return sources(full);
      return /\.tsx?$/.test(name) ? [full] : [];
    });

  it('AC-2: 주체 검색을 자체 구현한 다른 부품이 없다', () => {
    const src = join(WEB, 'src');

    /**
     * 두 자리는 셈에서 뺀다 — 함수를 **선언하는** 곳(`api/client.ts`)과
     * 그것을 **쓰는** 유일한 부품이다. 여기 말고 다른 파일을 이 목록에
     * 넣지 마라: 예외가 늘기 시작하면 방벽이 아니라 통과 목록이 된다.
     */
    const ALLOWED = [join('api', 'client.ts'), join('principal', 'PrincipalPicker.tsx')];

    // 규칙이 부품 안에 있어도 다른 화면이 API 를 직접 부르면 그 화면은
    // 규칙 바깥에 선다. **호출 자리가 하나**인 것이 그 담보다.
    const callers = sources(src)
      .filter((file) => !ALLOWED.some((allowed) => file.endsWith(allowed)))
      .filter((file) => readFileSync(file, 'utf8').includes('fetchPrincipals'))
      .map((file) => file.slice(src.length + 1));

    expect(callers).toEqual([]);
  });

  it('AC-1: 주체를 고르는 화면이 이 부품을 배치한다', () => {
    // 부품만 만들고 아무도 쓰지 않으면 규칙은 아무 화면에도 걸리지 않는다.
    const users = sources(join(WEB, 'src')).filter((file) =>
      readFileSync(file, 'utf8').includes('PrincipalPicker'),
    );

    expect(users.length).toBeGreaterThan(1);
  });
});
