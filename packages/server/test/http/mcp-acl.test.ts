import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express, { type Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { grantPermission } from '../../src/app/acl/grant-service.js';
import type { Actor } from '../../src/app/acl/permission-service.js';
import { issueToken } from '../../src/app/auth/token-service.js';
import { createNode } from '../../src/app/node/node-service.js';
import { createWorkspace } from '../../src/app/workspace/create-workspace.js';
import { mcpRouter } from '../../src/http/routes/mcp.js';
import { FsWorkspaceFiles } from '../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../src/infra/sqlite/database.js';
import { SqliteTokenRepository } from '../../src/infra/sqlite/token-repository.js';
import { attachmentStores, superuserActor } from '../support/acl-fixture.js';

/**
 * MCP 의 인가 (`SEC-ARCH-002` · `SEC-ARCH-003` · `SEC-ACL-006` AC-5).
 *
 * 인증이 주체를 세운다면 여기서 재는 것은 그 주체가 **무엇을 받는가**다.
 * 1.0 은 ACL 개념 자체가 없어 걸러 낼 자리가 없었으므로(조사 원문 §B-2),
 * 이 축은 계약을 물려받는 것이 아니라 2.0 이 새로 세우는 것이다.
 */

let dir: string;
let docsRoot: string;
let db: Database;
let stores: ReturnType<typeof attachmentStores> & { tokens: SqliteTokenRepository };
let app: Express;
let root: Actor;
let ws: string;
let 공개문서: string;
let 비밀문서: string;
/** 볼 수 있는 것이 하나뿐인 사람. */
let 보기만: { id: string; pat: string };
/** 편집까지 가진 사람. */
let 편집자: { id: string; pat: string };

const rpc = (method: string, params?: unknown) => ({
  jsonrpc: '2.0',
  id: 1,
  method,
  ...(params === undefined ? {} : { params }),
});

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;
const issued = (r: unknown) => r as { ok: true; id: string; token: string };

/** 도구를 부르고 본문 텍스트를 돌려준다. 1.0 계약상 모든 도구가 텍스트다. */
async function call(pat: string, name: string, args: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/mcp')
    .set('Authorization', `Bearer ${pat}`)
    .send(rpc('tools/call', { name, arguments: args }));
  const body = res.body as {
    result?: { content?: { type: string; text: string }[]; isError?: boolean };
    error?: { code: number; message: string };
  };
  return { status: res.status, body, text: body.result?.content?.[0]?.text ?? '' };
}

async function 사람(name: string): Promise<{ id: string; pat: string }> {
  const id = stores.principals.createUser(name).id;
  const pat = issued(
    issueToken(stores, id, { owner: id, name: 'mcp', scope: 'read-write', expiresInDays: 30 }),
  ).token;
  return { id, pat };
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-mcpacl-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = { ...attachmentStores(db, docsRoot), tokens: new SqliteTokenRepository(db) };
  root = superuserActor(stores);
  ws = (
    await createWorkspace(
      { workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) },
      '기획팀',
    )
  ).id;

  공개문서 = idOf(
    createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '공지.md' }),
  );
  비밀문서 = idOf(
    createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '연봉.md' }),
  );
  await writeFile(join(docsRoot, ws, stores.nodes.pathOf(공개문서)), '# 공지\n모두 본다\n', 'utf8');
  await writeFile(
    join(docsRoot, ws, stores.nodes.pathOf(비밀문서)),
    '# 연봉\n대외비 숫자가 여기 있다\n',
    'utf8',
  );

  보기만 = await 사람('보기만');
  편집자 = await 사람('편집자');
  grantPermission(stores, root, { nodeId: 공개문서, principalId: 보기만.id, level: 'view' });
  grantPermission(stores, root, { nodeId: 공개문서, principalId: 편집자.id, level: 'edit' });

  app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', mcpRouter({ stores }));
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('읽기 도구는 호출자의 ACL 로 걸러진다 (`SEC-ARCH-002`)', () => {
  /**
   * **같은 인자, 다른 결과** (AC-1).
   *
   * 두 호출자를 함께 재는 것이 이 조항의 전부다. 한 사람만 재면 「아무것도
   * 안 보인다」와 「자기 것만 보인다」가 갈리지 않는다.
   */
  it('AC-1: 서로 다른 ACL 을 가진 둘이 같은 도구를 같은 인자로 불러 각자의 것만 받는다', async () => {
    const 낮은쪽 = await call(보기만.pat, 'list_documents', { path: '/' });
    const 슈퍼 = await call(
      issued(
        issueToken(stores, root.id, {
          owner: root.id,
          name: 'mcp',
          scope: 'read-write',
          expiresInDays: 30,
        }),
      ).token,
      'list_documents',
      { path: '/' },
    );

    expect(낮은쪽.status).toBe(200);
    expect(낮은쪽.text, '보기만 인 사람에게 공지가 보이지 않는다').toContain('공지.md');
    expect(낮은쪽.text, '권한 없는 문서가 목록에 실렸다').not.toContain('연봉.md');

    expect(슈퍼.text, '슈퍼유저에게 연봉이 보이지 않아 이 항이 공허하다').toContain('연봉.md');
  });

  /**
   * **걸러졌다는 사실도 새지 않는다** (AC-4).
   *
   * 건수·순번·자리표시 어느 형태로도 안 된다. 「3건 중 1건 표시」 같은 값이
   * 있으면 목록에서 뺀 의미가 사라진다 — 없는 것과 못 보는 것이 그 숫자에서
   * 갈린다.
   */
  it('AC-4: 걸러진 사실을 건수·순번·자리표시로 노출하지 않는다', async () => {
    const res = await call(보기만.pat, 'list_documents', { path: '/' });

    expect(res.text, '권한 없는 문서의 이름이 실렸다').not.toContain('연봉');
    // 분모가 될 만한 총계가 없어야 한다. 「1 / 2」 같은 값이 서면 그 자리에서
    // 걸러진 개수가 드러난다.
    expect(res.text, '거르기 전 개수가 드러났다').not.toMatch(/\b2\s*(건|개|items?|of)\b/i);
    expect(res.text.toLowerCase(), '가려진 자리가 표시로 남았다').not.toMatch(
      /hidden|redacted|숨김|가려|권한 없음/,
    );
  });

  /**
   * 권한 없는 노드와 없는 노드가 **구별되지 않는다** (`SEC-ACL-006` AC-5).
   *
   * 두 응답이 글자까지 같아야 한다. 사유가 다르면 그 차이가 곧 존재 여부를
   * 알려 주는 신호가 된다.
   */
  it('SEC-ACL-006 AC-5: 권한 없는 문서와 없는 문서의 응답이 같다', async () => {
    const 권한없음 = await call(보기만.pat, 'read_document', { path: '/기획팀/연봉.md' });
    const 없음 = await call(보기만.pat, 'read_document', { path: '/기획팀/그런거없다.md' });

    expect(권한없음.status, '두 경우의 상태 코드가 다르다').toBe(없음.status);
    expect(권한없음.text, '두 경우의 본문이 다르다').toBe(없음.text);
    expect(
      JSON.stringify(권한없음.body.error ?? null),
      '두 경우의 오류 객체가 다르다',
    ).toBe(JSON.stringify(없음.body.error ?? null));
    expect(권한없음.text + JSON.stringify(권한없음.body), '대외비 본문이 샜다').not.toContain(
      '대외비',
    );
  });

  /**
   * **목록 경로에서도 두 경우가 갈리지 않는다** (`SEC-ACL-006` AC-5).
   *
   * 문서만 재면 이 축이 열린 채 남는다. 권한 없는 디렉터리를 나열했을 때
   * 「빈 목록과 함께 성공」이 오고 없는 디렉터리에 실패가 오면, 그 차이가
   * 곧 그 자리에 무언가 있다는 신호다 — 안을 못 봐도 존재는 새어 나간다.
   */
  it('SEC-ACL-006 AC-5: 권한 없는 디렉터리와 없는 디렉터리의 목록 응답이 같다', async () => {
    const 비밀방 = idOf(
      createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '임원실' }),
    );
    void 비밀방;

    const 권한없음 = await call(보기만.pat, 'list_documents', { path: '/기획팀/임원실' });
    const 없음 = await call(보기만.pat, 'list_documents', { path: '/기획팀/그런방없다' });

    expect(권한없음.status, '두 경우의 상태 코드가 다르다').toBe(없음.status);
    expect(권한없음.text, '두 경우의 본문이 다르다').toBe(없음.text);
  });
});

describe('쓰기 도구는 편집 권한이 없으면 실행 자체가 막힌다 (`SEC-ARCH-003`)', () => {
  it('AC-1: 보기 권한만 가진 사람의 쓰기 호출은 거부된다', async () => {
    const res = await call(보기만.pat, 'create_document', {
      path: '/기획팀/공지.md',
      content: '# 덮어썼다\n',
    });

    expect(res.status, '보기 권한으로 쓰기가 통과했다').not.toBe(200);
  });

  /**
   * **거부에 사유를 싣지 않는다** (`SEC-ACL-006` AC-3).
   *
   * 이 문서는 그 사람에게 보이므로 존재 은닉의 대상이 아니지만, 응답이
   * 「권한이 없다」라고 말하면 그 문구가 곧 권한 지도를 그려 준다 — 여러 번
   * 두드려 어디가 403 이고 어디가 404 인지 모으면 남의 권한 배치가 드러난다.
   * 조항의 문면이 「어느 응답에도」인 이유가 그것이다.
   */
  it('SEC-ACL-006 AC-3: 거부 응답에 권한을 뜻하는 코드나 문구가 없다', async () => {
    const res = await call(보기만.pat, 'create_document', {
      path: '/기획팀/공지.md',
      content: '덮어쓴다',
    });

    expect(res.status, '거부에 403 을 썼다').not.toBe(403);
    expect(JSON.stringify(res.body), '응답이 권한 부족을 말했다').not.toMatch(
      /권한|forbidden|permission|denied/i,
    );
  });

  it('AC-2: 편집 권한을 가진 사람의 같은 호출은 실행된다', async () => {
    const res = await call(편집자.pat, 'create_document', {
      path: '/기획팀/공지.md',
      content: '# 편집자가 고쳤다\n',
    });

    expect(res.status, '편집 권한인데 쓰기가 막혔다').toBe(200);
    const 본문 = await readFile(join(docsRoot, ws, stores.nodes.pathOf(공개문서)), 'utf8');
    expect(본문, '실행됐다는데 파일이 그대로다').toContain('편집자가 고쳤다');
  });

  /**
   * **거부는 아무것도 바꾸지 않은 채 끝난다** (AC-3).
   *
   * 결과를 걸러 내는 것으로는 부족하다는 것이 이 조항의 요점이다 — 읽기는
   * 걸러도 상태가 남지 않지만 쓰기는 이미 바뀐 뒤라 되돌릴 것이 생긴다.
   */
  it('AC-3: 거부된 쓰기는 대상을 바꾸지 않은 상태로 끝난다', async () => {
    const 전 = await readFile(join(docsRoot, ws, stores.nodes.pathOf(공개문서)), 'utf8');
    await call(보기만.pat, 'create_document', {
      path: '/기획팀/공지.md',
      content: '# 덮어썼다\n',
    });
    const 후 = await readFile(join(docsRoot, ws, stores.nodes.pathOf(공개문서)), 'utf8');

    expect(후, '거부된 쓰기가 파일을 바꿨다').toBe(전);
  });

  /**
   * **스코프도 함께 걸린다** (`SEC-AUTH-008` AC-2).
   *
   * 편집 권한을 가진 사람이라도 `read-only` 토큰으로는 쓰지 못한다. 이 항이
   * 없으면 MCP 계층의 쓰기 관문이 아무것도 재지 못한다 — 노드 ACL 은
   * `saveDocument` 가 이미 막으므로, 관문을 통째로 없애도 시험이 죽지 않는
   * 상태가 된다. 실측으로 그것을 확인하고 이 항을 세웠다.
   */
  it('read-only 토큰은 편집 권한이 있어도 쓰지 못한다', async () => {
    const 읽기전용 = issued(
      issueToken(stores, 편집자.id, {
        owner: 편집자.id,
        name: '읽기만',
        scope: 'read-only',
        expiresInDays: 30,
      }),
    ).token;

    const 전 = await readFile(join(docsRoot, ws, stores.nodes.pathOf(공개문서)), 'utf8');
    const res = await call(읽기전용, 'create_document', {
      path: '/기획팀/공지.md',
      content: '# 스코프를 넘었다' + String.fromCharCode(10),
    });
    const 후 = await readFile(join(docsRoot, ws, stores.nodes.pathOf(공개문서)), 'utf8');

    expect(res.status, 'read-only 스코프로 쓰기가 통과했다').not.toBe(200);
    expect(후, 'read-only 스코프의 쓰기가 파일을 바꿨다').toBe(전);
  });

  /**
   * **거부의 모양도 은닉을 받는다** (`SEC-ACL-006` AC-5 · AC-3).
   *
   * 쓰기를 거부할 때 403 과 「권한이 없다」를 내보내면, 읽기에서 애써 접어 둔
   * 존재 여부가 쓰기 경로로 새어 나간다. 권한 없는 문서에 쓰려는 것과 없는
   * 문서에 쓰려는 것이 같은 응답을 받아야 한다.
   */
  it('SEC-ACL-006 AC-5: 쓰기 거부도 권한 없음과 없음이 구별되지 않는다', async () => {
    const 권한없음 = await call(보기만.pat, 'create_document', {
      path: '/기획팀/연봉.md',
      content: '덮어쓴다',
    });
    const 없음 = await call(보기만.pat, 'create_document', {
      path: '/기획팀/없는방/새문서.md',
      content: '만든다',
    });

    expect(권한없음.status, '두 경우의 상태 코드가 다르다').toBe(없음.status);
    expect(권한없음.status, '거부에 403 을 썼다').not.toBe(403);
    expect(
      JSON.stringify(권한없음.body.error ?? null),
      '두 경우의 오류 객체가 다르다',
    ).toBe(JSON.stringify(없음.body.error ?? null));
  });

  it('AC-1: 권한 없는 문서에 대한 삭제도 거부된다', async () => {
    const res = await call(보기만.pat, 'delete_document', { path: '/기획팀/연봉.md' });
    expect(res.status, '권한 없는 문서가 지워졌다').not.toBe(200);
    expect(stores.nodes.findById(비밀문서)?.orphanedAt, '노드가 tombstone 이 됐다').toBeNull();
  });
});

describe('주체는 토큰 소유자로 확정된다 (`SEC-ARCH-001` AC-3 · `IR-AUTH-002` AC-1)', () => {
  /**
   * 주체가 **누구로** 확정되는지는 도구가 그 사람의 권한으로 도는 것으로만
   * 값이 된다. 주체를 되돌려 주는 도구를 두면 그것은 시험을 위한 제품 API 다.
   */
  it('토큰마다 그 소유자의 권한으로 도구가 돈다', async () => {
    const 새사람 = await 사람('아무도아닌');

    const 가진쪽 = await call(보기만.pat, 'list_documents', { path: '/' });
    const 없는쪽 = await call(새사람.pat, 'list_documents', { path: '/' });

    expect(가진쪽.text, '권한을 준 사람에게 공지가 안 보인다').toContain('공지.md');
    expect(없는쪽.text, '아무 권한도 없는 사람에게 공지가 보인다').not.toContain('공지.md');
  });
});
