import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express, { type Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { issueToken, revokeToken } from '../../src/app/auth/token-service.js';
import { createWorkspace } from '../../src/app/workspace/create-workspace.js';
import { hashSecretToken, newSecretToken } from '../../src/domain/auth/secret-token.js';
import { SESSION_COOKIE } from '../../src/http/routes/auth.js';
import { mcpRouter } from '../../src/http/routes/mcp.js';
import { FsWorkspaceFiles } from '../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../src/infra/sqlite/database.js';
import { SqliteTokenRepository } from '../../src/infra/sqlite/token-repository.js';
import { SqliteVectorIndex } from '../../src/infra/sqlite/vector-index-repository.js';
import { attachmentStores } from '../support/acl-fixture.js';

/**
 * MCP 표면의 인증 (`SEC-ARCH-001` · `IR-AUTH-002`).
 *
 * 1.0 은 read 계열 도구를 설정에 따라 무인증으로 열었고 `POST /context` 라는
 * 별도 표면은 아예 인증이 없었다. 2.0 은 문서별 ACL 이 핵심이라 그 전제가
 * 그대로 깨진다 — 인증이 없으면 뒤따르는 ACL 필터와 쓰기 권한 검사가 판정할
 * 주체 자체를 갖지 못한다.
 *
 * **주체가 누구로 확정되는가**(`SEC-ARCH-001` AC-3 · `IR-AUTH-002` AC-1)는
 * 이 파일이 재지 않는다. 그것은 도구가 그 주체의 권한으로 도는 것으로만
 * 값이 되며, 인가를 재는 `mcp-acl.test.ts` 가 소유한다 — 여기서 주체를
 * 되돌려 주는 도구를 따로 두면 시험을 위한 제품 API 가 하나 생긴다.
 */

let dir: string;
let docsRoot: string;
let db: Database;
let stores: ReturnType<typeof attachmentStores> & {
  tokens: SqliteTokenRepository;
  vectors: SqliteVectorIndex;
};
let app: Express;
let userId: string;
let pat: string;

/** MCP 는 JSON-RPC 2.0 이다. 도구 목록과 도구 호출 둘 다 이 봉투를 쓴다. */
const rpc = (method: string, params?: unknown) => ({
  jsonrpc: '2.0',
  id: 1,
  method,
  ...(params === undefined ? {} : { params }),
});

const issued = (r: unknown) => r as { ok: true; id: string; token: string };

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-mcp-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = {
    ...attachmentStores(db, docsRoot),
    tokens: new SqliteTokenRepository(db),
    vectors: new SqliteVectorIndex(db),
  };
  await createWorkspace(
    { workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) },
    '기획팀',
  );

  userId = stores.principals.createUser('한범').id;
  pat = issued(
    issueToken(stores, userId, {
      owner: userId,
      name: '노트북',
      scope: 'read-only',
      expiresInDays: 30,
    }),
  ).token;

  app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', mcpRouter({ stores }));
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('MCP 호출은 인증을 통과해야 실행된다 (`SEC-ARCH-001`)', () => {
  /**
   * **도구 종류와 무관하다** (AC-1).
   *
   * 1.0 은 read 계열만 게이트 뒤에 두고 그 게이트조차 설정으로 끌 수 있었다.
   * 목록 조회와 도구 호출을 각각 재는 이유가 그것이다 — 한쪽만 막으면
   * 나머지가 열린 채 남는다.
   */
  it('AC-1: 자격을 싣지 않은 도구 목록 조회가 거부된다', async () => {
    const res = await request(app).post('/api/mcp').send(rpc('tools/list'));
    expect(res.status, '자격 없이 도구 목록을 받았다').toBe(401);
  });

  it('AC-1: 자격을 싣지 않은 도구 호출이 거부된다', async () => {
    const res = await request(app)
      .post('/api/mcp')
      .send(rpc('tools/call', { name: 'list_documents', arguments: {} }));
    expect(res.status, '자격 없이 도구를 호출했다').toBe(401);
  });

  /**
   * **목록이 비어 있으면 이 항은 공허하다** (AC-2).
   *
   * 「무인증 도구가 존재하지 않는다」를 빈 목록으로 통과시키면 아무것도 재지
   * 못한다. 그래서 인증한 호출자에게 도구가 서는 것과, 그 도구 **전부**가
   * 인증 없이는 닿지 않는 것을 함께 잰다.
   */
  it('AC-2: 인증 없이 호출할 수 있는 도구가 목록에 없다', async () => {
    const listed = await request(app)
      .post('/api/mcp')
      .set('Authorization', `Bearer ${pat}`)
      .send(rpc('tools/list'));
    expect(listed.status).toBe(200);

    const tools = (listed.body as { result: { tools: { name: string }[] } }).result.tools;
    expect(tools.length, '도구 목록이 비어 있어 이 항이 공허하다').toBeGreaterThan(0);

    for (const tool of tools) {
      const res = await request(app)
        .post('/api/mcp')
        .send(rpc('tools/call', { name: tool.name, arguments: {} }));
      expect(res.status, `${tool.name} 이 인증 없이 닿는다`).toBe(401);
    }
  });

  /**
   * 1.0 은 `POST /mcp` 말고 `POST /context` 를 별도 표면으로 두고 도구 셋을
   * 무인증으로 열었다(조사 원문 §D-2 실측). 그 표면이 2.0 에 재현되지
   * 않았음을 잰다 — AC-2 의 목록 훑기는 **알려진 표면 안**만 보므로, 목록에
   * 없는 두 번째 표면이 열려 있으면 그 항이 잡지 못한다.
   */
  it('AC-2: 1.0 의 무인증 표면이 재현되지 않았다', async () => {
    for (const path of ['/api/context', '/api/mcp/context']) {
      const res = await request(app)
        .post(path)
        .send(rpc('tools/call', { name: 'search_documents', arguments: { query: '가' } }));
      expect([401, 404], `${path} 가 무인증으로 응답했다`).toContain(res.status);
    }
  });
});

describe('MCP 표면은 자격을 재생산하지 않는다 (`SEC-AUTH-007` AC-1 · `IR-AUTH-002`)', () => {
  /**
   * **PAT 로 PAT 를 만들 수 있으면 무효화가 우회된다.**
   *
   * 비밀번호 변경이 그 계정의 PAT 를 전부 끊는데(원장 `G33` ①), 이 표면은
   * PAT 하나만으로 열린다. 그래서 발급·폐기·조회 중 하나라도 여기에 붙으면
   * 침입자가 끊기기 전에 새 자격을 심어 그 무효화를 지나간다.
   *
   * **`auth.ts` 쪽의 짝과 다른 축이다.** 그쪽(`token-routes.test.ts` 의
   * 「PAT 로는 이 경로가 열리지 않는다」)은 **발급 라우트가 PAT 를 받지
   * 않음**을 잰다. 여기서 재는 것은 반대쪽, **MCP 표면에 발급 능력이 새로
   * 서지 않음**이다. 앞의 것이 서 있어도 뒤의 것은 막지 못한다 — 실제로 이
   * 항이 서기 전에는 MCP 에 발급을 붙여도 죽는 항이 하나도 없었다.
   *
   * **도구 목록을 전량으로 못박지 않았다.** 그 방법도 이 되돌림을 잡기는
   * 하지만, 도구를 하나 더할 때마다 목록을 고쳐야 하고 고치는 사람이 하는
   * 일은 목록을 맞추는 것뿐이라 자격 재생산 여부를 판단하지 않는다. 대신
   * **능력이 이 표면의 소스에 닿는지**를 잰다 — 도구가 몇이 되든 이 항은
   * 그대로 서고, 발급을 붙이려면 반드시 이 셋 중 하나를 불러야 한다.
   *
   * 실행이 아니라 소스를 재는 이유는 표면의 모양이 둘이기 때문이다. 새 RPC
   * 메서드로 붙이는 것과 정식 도구로 붙이는 것은 실행 경로가 다르지만, 둘 다
   * 이 셋 중 하나를 부른다.
   */
  it('MCP 쪽 소스가 토큰 발급·폐기·조회를 부르지 않는다', async () => {
    const mcpApp = join(process.cwd(), 'src', 'app', 'mcp');
    const paths = [
      join(process.cwd(), 'src', 'http', 'routes', 'mcp.ts'),
      ...(await readdir(mcpApp)).filter((one) => one.endsWith('.ts')).map((one) => join(mcpApp, one)),
    ];
    // 파일을 하나도 찾지 못하면 이 항은 공허하다 — 경로가 바뀌었는데
    // 통과하는 상태를 만들지 않는다.
    expect(paths.length, 'MCP 소스를 하나도 찾지 못했다').toBeGreaterThan(1);

    let 인증을부르는파일 = 0;
    for (const path of paths) {
      const source = await readFile(path, 'utf8');

      for (const 금지 of ['issueToken', 'revokeToken', 'listTokens']) {
        expect(
          new RegExp(`\\b${금지}\\b`).test(source),
          `${path} 가 ${금지} 을(를) 부른다 — PAT 가 PAT 를 낳으면 비밀번호 변경의 일괄 무효화가 우회된다`,
        ).toBe(false);
      }

      if (/\bauthenticateToken\b/.test(source)) 인증을부르는파일 += 1;
    }

    // **금지만 재면 이 항이 공허해질 수 있다.** 토큰을 아예 모르는 소스를
    // 훑고 있어도 통과하기 때문이다. 이 표면은 PAT 를 **검증**해야 서므로,
    // 그 호출이 실제로 여기 있다는 것으로 훑는 자리가 맞음을 확인한다.
    expect(인증을부르는파일, 'PAT 를 검증하는 자리가 없다 — 엉뚱한 곳을 훑고 있다').toBeGreaterThan(0);
  });
});

describe('MCP 의 인증 수단은 Bearer PAT 하나다 (`IR-AUTH-002`)', () => {
  it('AC-2: 헤더가 없는 요청은 거부된다', async () => {
    const res = await request(app).post('/api/mcp').send(rpc('tools/list'));
    expect(res.status).toBe(401);
  });

  /**
   * 유효하지 않은 PAT 의 모양은 하나가 아니다 (AC-3).
   *
   * 없는 값과 폐기된 값을 함께 재는 이유는 그 둘이 **다른 관문**에서 걸리기
   * 때문이다 — 앞의 것은 조회에서, 뒤의 것은 폐기 여부에서 걸린다.
   */
  it('AC-3: 없는 PAT 는 거부된다', async () => {
    const res = await request(app)
      .post('/api/mcp')
      // HTTP 헤더는 ASCII 만 싣는다. 값의 모양이 아니라 그런 토큰이 없다는
      // 사실을 재는 자리라 아무 ASCII 값이면 된다.
      .set('Authorization', 'Bearer no-such-token')
      .send(rpc('tools/list'));
    expect(res.status).toBe(401);
  });

  it('AC-3: 폐기된 PAT 는 거부된다', async () => {
    const second = issued(
      issueToken(stores, userId, {
        owner: userId,
        name: '폐기할 것',
        scope: 'read-only',
        expiresInDays: 30,
      }),
    );
    revokeToken(stores, userId, second.id);

    const res = await request(app)
      .post('/api/mcp')
      .set('Authorization', `Bearer ${second.token}`)
      .send(rpc('tools/list'));
    expect(res.status, '폐기된 토큰이 통과했다').toBe(401);
  });

  /**
   * **쿠키는 대체 수단이 아니다** (AC-4).
   *
   * 브라우저 세션으로 MCP 가 열리면 그 표면이 CSRF 의 대상이 된다 — 사용자가
   * 로그인한 채 다른 사이트를 열면 그 사이트가 사용자의 권한으로 도구를
   * 부른다. PAT 는 브라우저가 자동으로 싣지 않으므로 그 경로가 서지 않는다.
   *
   * **살아 있는 세션으로 잰다.** 아무 값이나 보내면 「쿠키를 읽지 않는다」와
   * 「쿠키를 읽었지만 그 값이 틀렸다」가 밖에서 같아 보인다.
   */
  it('AC-4: 세션 쿠키를 대체 인증 수단으로 받지 않는다', async () => {
    const sessionToken = newSecretToken();
    const now = new Date();
    stores.sessions.create(hashSecretToken(sessionToken), {
      userId,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 3_600_000).toISOString(),
    });

    const res = await request(app)
      .post('/api/mcp')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .send(rpc('tools/list'));

    expect(res.status, '살아 있는 세션 쿠키가 MCP 인증을 통과시켰다').toBe(401);
  });
});
