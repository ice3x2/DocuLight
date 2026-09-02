import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ApiError,
  fetchSession,
  fetchTree,
  loadDocument,
  openEditSession,
  saveBody,
  uploadAttachment,
  fetchTrash,
  fetchTokens,
  issueToken,
  revokeToken,
} from '../src/api/client.js';

const respond = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const stub = (impl: (url: string, init?: RequestInit) => Response | Promise<Response>) => {
  const spy = vi.fn((url: string | URL | Request, init?: RequestInit) => impl(String(url), init));
  vi.stubGlobal('fetch', spy);
  return spy;
};

afterEach(() => vi.unstubAllGlobals());

describe('세션', () => {
  it('서버가 준 값을 그대로 돌려준다 — 화면이 더 계산하지 않는다', async () => {
    stub(() => respond(200, { superuser: false, workspaceCount: 2, adminWorkspaceCount: 1 }));

    expect(await fetchSession()).toEqual({ superuser: false, workspaceCount: 2, adminWorkspaceCount: 1 });
  });

  it('401 은 인증되지 않음으로 구별된다 — 빈 세션과 섞이면 화면이 로그인 상태로 뜬다', async () => {
    stub(() => respond(401));

    await expect(fetchSession()).rejects.toMatchObject({ status: 401 });
  });
});

describe('트리', () => {
  it('서버 목록을 그대로 돌려준다', async () => {
    const tree = [{ workspace: { id: 'w', name: '기획팀' }, visibility: 'full', roots: [] }];
    stub(() => respond(200, tree));

    expect(await fetchTree()).toEqual(tree);
  });
});

describe('문서', () => {
  it('본문과 기준 해시를 함께 받는다', async () => {
    stub(() => respond(200, { body: '# 가', hash: 'h1' }));

    expect(await loadDocument('n1')).toEqual({ body: '# 가', hash: 'h1' });
  });

  it('저장은 기준 해시를 싣는다 — 그것이 충돌 판정의 근거다', async () => {
    const spy = stub(() => respond(200, { hash: 'h2' }));

    await saveBody('n1', { body: '# 나', baseHash: 'h1', session: 's1' });

    const [, init] = spy.mock.calls[0]!;
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({ body: '# 나', baseHash: 'h1', session: 's1' });
  });

  it('409 는 충돌이고 서버의 현재 본문을 함께 준다', async () => {
    stub(() => respond(409, { current: '# 남의 것' }));

    await expect(saveBody('n1', { body: '# 내 것', baseHash: 'h1' })).rejects.toMatchObject({
      status: 409,
      current: '# 남의 것',
    });
  });

  it('403 은 거부다 — 충돌과 다르게 다뤄야 자동 저장이 옳게 멈춘다', async () => {
    stub(() => respond(403));

    await expect(saveBody('n1', { body: '# 가', baseHash: 'h1' })).rejects.toMatchObject({ status: 403 });
  });

  it('편집 세션을 연다', async () => {
    stub(() => respond(200, { session: 's1' }));

    expect(await openEditSession('n1')).toBe('s1');
  });
});

describe('첨부', () => {
  it('multipart 로 보내고 링크를 받는다', async () => {
    const spy = stub(() => respond(200, { hash: 'abc', link: '/api/attachments/w/abc' }));

    const done = await uploadAttachment('n1', new File([new Uint8Array([1])], '그림.png'));

    expect(done.link).toBe('/api/attachments/w/abc');
    const [, init] = spy.mock.calls[0]!;
    // JSON 으로 보내면 바이너리가 base64 로 부풀고 크기 상한이 실제와 갈린다.
    expect(init?.body).toBeInstanceOf(FormData);
  });

  it('413 은 크기 초과다', async () => {
    stub(() => respond(413));

    await expect(uploadAttachment('n1', new File([new Uint8Array([1])], 'x'))).rejects.toMatchObject({
      status: 413,
    });
  });
});

describe('휴지통', () => {
  it('범위와 워크스페이스를 질의로 싣는다', async () => {
    const spy = stub(() => respond(200, []));

    await fetchTrash({ scope: 'all', workspaceId: 'w1' });

    expect(String(spy.mock.calls[0]![0])).toContain('scope=all');
    expect(String(spy.mock.calls[0]![0])).toContain('workspaceId=w1');
  });
});

describe('거절의 형태', () => {
  it('ApiError 가 상태 코드를 담는다 — 화면이 사유별로 다르게 굴어야 한다', async () => {
    stub(() => respond(404));

    const error = await loadDocument('n1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(404);
  });

  it('JSON 이 아닌 응답에도 던지지 않고 상태만 담는다', async () => {
    // 서버가 HTML 을 돌려주는 경우(라우트 누락·프록시 오설정)에 파싱에서
    // 터지면 진짜 원인인 상태 코드가 묻힌다.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Response('<html>', { status: 500, headers: { 'content-type': 'text/html' } })),
    );

    await expect(loadDocument('n1')).rejects.toMatchObject({ status: 500 });
  });
});

describe('액세스 토큰 (SEC-AUTH-006 · SEC-AUTH-007)', () => {
  it('목록은 대상을 싣지 않는다 — 대상은 언제나 세션의 주인이다', async () => {
    const spy = stub(() => respond(200, []));

    await fetchTokens();

    expect(String(spy.mock.calls[0]![0])).toBe('/api/auth/tokens');
    expect(spy.mock.calls[0]![1]?.method ?? 'GET').toBe('GET');
  });

  it('발급 요청에 owner 를 싣지 않는다 — 실으면 self-only 판정이 클라이언트 입력에 걸린다', async () => {
    const spy = stub(() => respond(201, { id: 't1', token: 'dl_pat_x' }));

    const issued = await issueToken({ name: 'CI', scope: 'read-only', expiresInDays: 90 });

    expect(issued).toEqual({ id: 't1', token: 'dl_pat_x' });
    const [, init] = spy.mock.calls[0]!;
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      name: 'CI',
      scope: 'read-only',
      expiresInDays: 90,
    });
  });

  it('폐기는 DELETE 이며 id 를 경로에 싣는다', async () => {
    const spy = stub(() => respond(204));

    await revokeToken('t1');

    expect(String(spy.mock.calls[0]![0])).toBe('/api/auth/tokens/t1');
    expect(spy.mock.calls[0]![1]?.method).toBe('DELETE');
  });
});
