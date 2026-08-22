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

/** 이 시험이 쓰는 부여 대상. 스코프 없이는 부품이 서지 않는다 (`R162`). */
const SCOPE = 'node:n1' as const;

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
    render(<PrincipalPicker scope={SCOPE} />);

    await type('한');

    // 짧은 질의를 서버가 거절하더라도 여기서 묻는 것 자체가 열거 시도를
    // 한 글자씩 반복할 수 있게 만든다.
    expect(asked).not.toHaveBeenCalled();
  });

  it('AC-2: 두 글자를 치면 묻는다', async () => {
    const asked = serving([row()]);
    render(<PrincipalPicker scope={SCOPE} />);

    await type('한범');

    await waitFor(() => expect(asked).toHaveBeenCalled());
    expect(await screen.findByText('한범')).toBeTruthy();
  });

  it('AC-3: 서버가 스물다섯을 줘도 스무 줄까지만 그린다', async () => {
    serving(Array.from({ length: 25 }, (_, n) => row({ id: `p${n}`, name: `검색대상${n}` })));
    render(<PrincipalPicker scope={SCOPE} />);

    await type('검색대상');

    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(20));
  });

  it('AC-4: 화면이 값을 넘겨도 두 규칙이 그대로다', async () => {
    serving(Array.from({ length: 25 }, (_, n) => row({ id: `p${n}`, name: `검색대상${n}` })));

    // 모듈 export 만 재면 **prop** 경로가 그대로 남는다 — 화면이 값을
    // 덮는 가장 자연스러운 형태가 그것이다. 넘겨 보고 값이 안 바뀌는
    // 것을 잰다.
    const Forced = PrincipalPicker as unknown as (props: Record<string, unknown>) => JSX.Element;
    render(<Forced scope={SCOPE} limit={100} min={1} />);

    await type('검색대상');

    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(20));
  });

  it('R162: 부여 대상을 요청에 싣는다', async () => {
    const asked = serving([row()]);
    render(<PrincipalPicker scope="workspace:ws-1" />);

    await type('한범');

    // 스코프가 빠지면 서버가 404 로 답하지만, 그 전에 화면이 그것을 싣지
    // 않는다는 사실 자체를 재야 한다 — 안 실으면 이 부품이 아무 화면에도
    // 쓸모없어지는데 그 사실은 서버를 띄워야 드러난다.
    await waitFor(() => expect(asked).toHaveBeenCalled());
    expect(String(asked.mock.calls[0]?.[0])).toContain('for=workspace%3Aws-1');
  });

  it('AC-4: 두 값을 바깥에서 집을 경로가 없다', () => {
    // 상수를 내보내는 순간 화면이 그것을 읽고 자기 값으로 바꿔 쓰는 길이
    // 열린다. 이 부품이 내보내는 것은 부품 하나뿐이어야 한다.
    expect(Object.keys(pickerModule)).toEqual(['PrincipalPicker']);
  });

  it('AC-1: 두 글자에서 한 글자로 줄이면 앞의 결과가 남지 않는다', async () => {
    serving([row({ name: '검색대상' })]);
    render(<PrincipalPicker scope={SCOPE} />);

    await type('검색대상');
    await screen.findByText('검색대상');

    const user = userEvent.setup();
    await user.clear(screen.getByLabelText('사용자·그룹 검색'));
    await user.type(screen.getByLabelText('사용자·그룹 검색'), '검');

    // 앞 목록이 남으면 한 글자 상태로도 명부가 계속 보인다 — 최소 길이
    // 규칙이 화면에서 사실상 없는 것과 같아진다.
    await waitFor(() => expect(screen.queryByText('검색대상')).toBeNull());
  });
});

describe('SEC-PRINCIPAL-002 — 상태 배지', () => {
  it('AC-4: 모든 줄에 상태 배지가 붙는다', async () => {
    serving([
      row({ id: 'a', name: '검색대상활성', status: 'active' }),
      row({ id: 'b', name: '검색대상대기', status: 'pending' }),
      row({ id: 'c', name: '검색대상비활성', status: 'suspended' }),
    ]);
    render(<PrincipalPicker scope={SCOPE} />);

    await type('검색대상');

    // 개수만 재면 **빈 배지** 셋도 합격한다 — 보이지 않는 배지는 표시가
    // 아니다. 세 문구를 그대로 대조한다.
    await waitFor(() => expect(screen.getAllByTestId('principal-status')).toHaveLength(3));
    expect(screen.getAllByTestId('principal-status').map((badge) => badge.textContent)).toEqual([
      '활성',
      '대기',
      '비활성',
    ]);
  });

  it('AC-5: suspended 의 배지 문구는 비활성 이다', async () => {
    serving([row({ name: '검색대상비활성', status: 'suspended' })]);
    render(<PrincipalPicker scope={SCOPE} />);

    await type('검색대상');

    expect((await screen.findByTestId('principal-status')).textContent).toBe('비활성');
  });

  it('AC-5: 어떤 배지도 정지·오프보딩을 함의하지 않는다', async () => {
    serving([
      row({ id: 'a', name: '검색대상활성', status: 'active' }),
      row({ id: 'b', name: '검색대상대기', status: 'pending' }),
      row({ id: 'c', name: '검색대상비활성', status: 'suspended' }),
    ]);
    render(<PrincipalPicker scope={SCOPE} />);

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
    /**
     * 두 자리만 셈에서 뺀다 — 헬퍼를 **선언하는** 곳과 그것을 **쓰는**
     * 유일한 부품이다. `endsWith` 가 아니라 상대경로 정확 일치로 본다:
     * 접미 일치면 `src/무엇이든/api/client.ts` 도 자동 면제된다. 여기
     * 말고 다른 파일을 이 목록에 넣지 마라 — 예외가 늘기 시작하면
     * 방벽이 아니라 통과 목록이 된다.
     */
    const ALLOWED = new Set([
      join('web', 'api', 'client.ts'),
      join('web', 'principal', 'PrincipalPicker.tsx'),
    ]);

    /**
     * 침입자는 헬퍼를 안 쓰고 `fetch` 를 직접 부른다 — 그래서 식별자가
     * 아니라 **엔드포인트 경로**도 함께 본다. 훑는 범위도 화면 패키지
     * 둘이다: 한 패키지만 보면 다른 패키지의 두 번째 검색이 통과한다.
     */
    const offenders = [
      ...sources(join(WEB, 'src')).map((file) => ({ file, root: join(WEB, 'src'), pkg: 'web' })),
      ...sources(join(WEB, '..', 'editor', 'src')).map((file) => ({
        file,
        root: join(WEB, '..', 'editor', 'src'),
        pkg: 'editor',
      })),
    ]
      .map(({ file, root, pkg }) => ({ path: join(pkg, file.slice(root.length + 1)), file }))
      .filter(({ path }) => !ALLOWED.has(path))
      .filter(({ file }) => {
        const source = readFileSync(file, 'utf8');
        return source.includes('fetchPrincipals') || source.includes('/principals');
      })
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });
});
