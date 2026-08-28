import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import express, { type Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { actorFor, type Actor } from '../../src/app/acl/permission-service.js';
import { grantPermission } from '../../src/app/acl/grant-service.js';
import { createNode } from '../../src/app/node/node-service.js';
import { createWorkspace } from '../../src/app/workspace/create-workspace.js';
import { workspaceApiRouter } from '../../src/http/routes/workspace-api.js';
import { workspaceDirectory } from '../../src/infra/fs/workspace-layout.js';
import { FsWorkspaceFiles } from '../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../src/infra/sqlite/database.js';
import { attachmentStores, superuserActor } from '../support/acl-fixture.js';

/**
 * 1.0 이 물려준 REST 표면의 권한 필터 (`CON-ARCH-002` AC-7 · `SEC-ACL-006`
 * AC-1 ~ AC-4).
 *
 * 1.0 의 REST 는 세 표면이었다 — `tree` · `raw` · `search`. 그쪽은 문서별
 * ACL 이 없어 인증만 통과하면 전부 보였고(`arag-probe.md` §B-2), 2.0 은 그
 * 셋을 물려받되 **전부 요청자 권한 필터를 거치게** 한다.
 *
 * 셋을 각각 재는 이유는 **필터가 서는 자리가 다르기 때문**이다. 트리는
 * `visibleChildrenOf`, 원문은 `readDocument`, 검색은 `visibleWorkspacesOf` 와
 * `servableIn` 이 소유한다. 한 표면만 재면 나머지 둘이 열린 채 남는다.
 *
 * 관리 라우트(접근자·회수·시뮬레이션)의 은닉은 이 파일이 재지 않는다 —
 * `acl-admin-routes.test.ts` 가 이미 소유하며, 그쪽은 1.0 에 대응물이 없는
 * 2.0 고유 표면이라 `CON-ARCH-002` AC-7 의 대상도 아니다.
 */

let dir: string;
let docsRoot: string;
let db: Database;
let stores: ReturnType<typeof attachmentStores>;
let root: Actor;
let 을: Actor;
let ws: string;
let 열린방: string;
let 닫힌방: string;
let 회의록: string;
let 대외비: string;
let app: Express;
let actingAs: Actor | undefined;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

/** 노드 트리에 대응하는 실제 파일을 세운다. 없으면 원문 읽기가 부재로 떨어진다. */
async function 본문을둔다(relativePath: string, body: string): Promise<void> {
  const at = join(workspaceDirectory(docsRoot, ws), relativePath);
  await mkdir(dirname(at), { recursive: true });
  await writeFile(at, body, 'utf8');
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-rest-acl-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = attachmentStores(db, docsRoot);
  root = superuserActor(stores);
  ws = (
    await createWorkspace(
      { workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) },
      '기획팀',
    )
  ).id;

  열린방 = idOf(
    createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '열린방' }),
  );
  닫힌방 = idOf(
    createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '닫힌방' }),
  );
  회의록 = idOf(
    createNode(stores, root, { workspaceId: ws, parentId: 열린방, kind: 'file', name: '회의록.md' }),
  );
  대외비 = idOf(
    createNode(stores, root, { workspaceId: ws, parentId: 닫힌방, kind: 'file', name: '대외비.md' }),
  );

  await 본문을둔다(join('열린방', '회의록.md'), '# 회의록\n\n분기 계획을 적는다.\n');
  await 본문을둔다(join('닫힌방', '대외비.md'), '# 대외비\n\n인수 협상 조건.\n');

  // 을은 열린방만 본다. 닫힌방에는 아무 항목도 걸지 않는다.
  을 = actorFor(stores.principals, stores.principals.createUser('을').id);
  expect(
    grantPermission(stores, root, { nodeId: 열린방, principalId: 을.id, level: 'view' }).ok,
  ).toBe(true);
  을 = actorFor(stores.principals, 을.id);

  actingAs = 을;
  app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', workspaceApiRouter({ stores, actorOf: () => actingAs }));
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

it('CON-ARCH-002 AC-7 — tree 는 못 보는 노드를 개수로도 남기지 않는다', async () => {
  const res = await request(app).get('/api/tree');

  expect(res.status).toBe(200);
  // 이름만 보는 것으로는 부족하다. 「보이지 않게 표시된 자리」가 남아도
  // 그 자리 자체가 존재를 알리므로 응답 전문에서 그 ID 를 찾는다.
  const 전문 = JSON.stringify(res.body);
  expect(전문, '못 보는 디렉터리가 트리에 실렸다').not.toContain(닫힌방);
  expect(전문, '못 보는 문서가 트리에 실렸다').not.toContain(대외비);
  expect(전문, '볼 수 있는 문서까지 사라졌다 — 필터가 과하다').toContain(회의록);
});

it('CON-ARCH-002 AC-7 — raw 는 못 보는 문서의 본문을 주지 않는다', async () => {
  const 열린것 = await request(app).get(`/api/documents/${회의록}`);
  expect(열린것.status).toBe(200);
  expect(열린것.body.body).toContain('분기 계획');

  const 닫힌것 = await request(app).get(`/api/documents/${대외비}`);
  expect(닫힌것.status, '못 보는 문서의 원문이 나갔다').toBe(404);
  expect(JSON.stringify(닫힌것.body)).not.toContain('인수 협상');
});

it('CON-ARCH-002 AC-7 — search 는 못 보는 문서를 결과에 싣지 않는다', async () => {
  // 이름 축으로 잰다. 두 문서가 각각 이름으로만 걸리므로 본문 축의
  // 성패와 무관하게 필터 하나만 재어진다.
  const 열린것 = await request(app).get('/api/search').query({ q: '회의록', axes: 'name' });
  expect(열린것.status).toBe(200);
  expect(열린것.body.documents).toHaveLength(1);

  const 닫힌것 = await request(app).get('/api/search').query({ q: '대외비', axes: 'name' });
  expect(닫힌것.status).toBe(200);
  expect(닫힌것.body.documents, '못 보는 문서가 검색 결과에 나왔다').toEqual([]);
});

it('SEC-ACL-006 AC-1 · AC-2 — 권한 없는 노드와 없는 노드의 응답이 구별되지 않는다', async () => {
  const 권한없음 = await request(app).get(`/api/documents/${대외비}`);
  const 존재없음 = await request(app).get('/api/documents/node-that-never-existed');

  expect(권한없음.status).toBe(404);
  expect(존재없음.status).toBe(404);
  expect(권한없음.text, '두 경우의 본문이 갈린다').toBe(존재없음.text);
  // 헤더도 같아야 한다 — 길이나 타입이 갈리면 본문이 같아도 구별된다.
  expect(권한없음.headers['content-type']).toBe(존재없음.headers['content-type']);
  expect(권한없음.headers['content-length']).toBe(존재없음.headers['content-length']);
});

it('SEC-ACL-006 AC-3 — 403 을 쓰지 않고 권한 부족을 뜻하는 문구도 싣지 않는다', async () => {
  const 응답들 = [
    await request(app).get(`/api/documents/${대외비}`),
    await request(app).get('/api/documents/node-that-never-existed'),
    await request(app).get(`/api/documents/${대외비}/versions`),
    await request(app).get(`/api/documents/${대외비}/links`),
  ];

  for (const res of 응답들) {
    expect(res.status, '403 이 나갔다 — 그 코드는 존재를 알린다').not.toBe(403);
    const 전문 = `${res.text ?? ''}${JSON.stringify(res.body)}`;
    for (const 금칙 of ['권한', 'forbidden', 'Forbidden', 'permission', 'denied']) {
      expect(전문, `거부 사유가 응답에 실렸다: ${금칙}`).not.toContain(금칙);
    }
  }
});

it('SEC-ACL-006 AC-4 — 권한 없음과 부재가 한 코드 경로로 합류한다', async () => {
  // 이 조항은 구조로만 판정한다(그 요구의 Implementation Notes). 관측
  // 동일성은 앞 항이 이미 재므로, 여기서는 **갈라질 자리가 없다**를 본다.
  const 저장 = await readFile(
    join(import.meta.dirname, '..', '..', 'src', 'app', 'document', 'save-service.ts'),
    'utf8',
  );

  // 부재와 권한 없음이 같은 값으로 나간다. 사유가 갈리면 호출자가 그것을
  // 분기할 수 있게 되고, 그 분기가 곧 오라클이 된다.
  const 합류 = 저장.match(/return \{ ok: false, rule: 'unknown-node' \}/g) ?? [];
  expect(합류.length, '부재와 권한 없음을 한 값으로 합류시키는 자리가 사라졌다').toBeGreaterThanOrEqual(2);

  const 라우터 = await readFile(
    join(import.meta.dirname, '..', '..', 'src', 'http', 'routes', 'workspace-api.ts'),
    'utf8',
  );

  // **라우터 전체에서 403 을 금지하지 않는다.** 이 조항이 덮는 것은 「권한
  // 없는 노드에 대한 응답」이고(그 요구의 Requirement 문면), 볼 수는 있으나
  // 편집은 못 하는 사람은 그 노드의 존재를 이미 안다 — 그에게 403 을 줘도
  // 새로 알려주는 것이 없으므로 열거 오라클이 서지 않는다. 실측으로 확인한
  // 자리다: 처음 쓴 술어가 라우터 전체를 금지해 「볼 수 있으나 못 함 = 403」
  // 이라는 라우터의 정책(92~101행)을 위반으로 잡았고, 넓은 쪽은 술어였다.
  //
  // 그래서 **읽기 표면 하나**만 잘라 본다. 못 보는 사람이 닿는 자리에 403 이
  // 섞이면 그 한 줄이 나머지 은닉을 통째로 무의미하게 만든다.
  const 시작 = 라우터.indexOf("router.get('/documents/:nodeId'");
  expect(시작, '원문 라우터를 찾지 못했다 — 술어가 빈 문자열을 재고 있다').toBeGreaterThan(0);
  const 원문라우터 = 라우터.slice(시작, 라우터.indexOf('router.', 시작 + 10));
  expect(원문라우터.length).toBeGreaterThan(100);
  expect(원문라우터, '원문 표면이 403 을 쓴다').not.toMatch(/\b403\b/);
});
