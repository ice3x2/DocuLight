import { describe, expect, it, vi } from 'vitest';

import { resolveWikiLink } from '../src/document/wiki-link-resolve.js';

/**
 * 본문 렌더의 위키링크 해석 (`SEC-WORKSPACE-006` · `FR-WORKSPACE-009`).
 *
 * **두 사유가 같은 값으로 접힌다** — 없는 문서와 권한 없는 문서 모두
 * `null` 이다. 서버가 이미 같은 답을 주므로 여기서 갈릴 자리를 만들지
 * 않는 것이 이 모듈의 일이다.
 */
const 후보 = (rows: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Response(JSON.stringify(rows), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  );

describe('SEC-WORKSPACE-006 — 본문의 깨진 링크', () => {
  it('볼 수 있는 문서는 풀린다', async () => {
    후보([{ target: '설계', label: '설계.md', detail: '기획팀' }]);

    expect(await resolveWikiLink('설계')).toEqual({ target: '설계', label: '설계.md' });
  });

  it('AC-1 · AC-2: 없는 문서와 권한 없는 문서가 **같은 값**으로 접힌다', async () => {
    // 서버는 둘 다 후보 목록에서 뺀다 — 여기서도 갈리지 않아야 한다.
    후보([]);
    const 없는것 = await resolveWikiLink('없는문서');
    후보([]);
    const 권한없음 = await resolveWikiLink('설계');

    expect(없는것).toBe(권한없음);
    expect(없는것).toBeNull();
  });

  it('AC-5: 사유를 담는 상태값을 만들지 않는다', async () => {
    후보([]);

    // `status` 를 실어 보내면 편집기가 그 값으로 다른 class 를 붙이고,
    // 그 class 가 곧 사유를 알린다.
    expect(await resolveWikiLink('설계')).toBeNull();
  });

  it('이름이 부분만 걸리는 후보는 그 링크를 풀지 않는다', async () => {
    // `/wiki-targets` 는 접두 검색이라 `설계도` 가 `설계` 질의에 걸린다.
    후보([{ target: '설계도', label: '설계도.md', detail: '기획팀' }]);

    expect(await resolveWikiLink('설계')).toBeNull();
  });

  it('요청이 실패해도 던지지 않는다 — 편집 중에 렌더가 멈추면 안 된다', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('끊김'))));

    expect(await resolveWikiLink('설계')).toBeNull();
  });
});

describe('SEC-WORKSPACE-005 AC-6 — 패널과 본문이 같은 집합을 미해결로 본다', () => {
  it('패널이 미해결로 준 이름을 본문 해석기도 풀지 못한다', async () => {
    // 두 표면이 각자 판정하면 한쪽에서만 풀린 링크가 생기고, 그 차이가
    // 곧 「어느 쪽 말이 맞나」를 사용자에게 떠넘긴다.
    const 패널이준것: readonly { name: string; resolved: boolean }[] = [
      { name: '설계', resolved: false },
      { name: '없는것', resolved: false },
    ];

    for (const row of 패널이준것) {
      // 패널이 미해결로 본 이름은 후보 목록에도 없다 — 서버가 같은 판정을
      // 두 표면에 쓰기 때문이다.
      후보([]);
      expect(await resolveWikiLink(row.name)).toBeNull();
    }
  });

  it('패널이 풀린 것으로 준 이름은 본문에서도 풀린다', async () => {
    후보([{ target: '설계', label: '설계.md', detail: '기획팀' }]);

    expect(await resolveWikiLink('설계')).not.toBeNull();
  });
});
