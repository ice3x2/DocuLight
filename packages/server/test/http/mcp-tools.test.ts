import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express, { type Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type Actor } from '../../src/app/acl/permission-service.js';
import { issueToken } from '../../src/app/auth/token-service.js';
import { mcpTools, sanitizeForToolName } from '../../src/app/mcp/tools.js';
import { createNode } from '../../src/app/node/node-service.js';
import { createWorkspace } from '../../src/app/workspace/create-workspace.js';
import { mcpRouter } from '../../src/http/routes/mcp.js';
import { FsWorkspaceFiles } from '../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../src/infra/sqlite/database.js';
import { SqliteTokenRepository } from '../../src/infra/sqlite/token-repository.js';
import { SqliteVectorIndex } from '../../src/infra/sqlite/vector-index-repository.js';
import { attachmentStores, superuserActor } from '../support/acl-fixture.js';

/**
 * 1.0 의 도구 계약을 물려받았는가 (`FR-ARCH-001` AC-1 · AC-2 · AC-5).
 *
 * 계약은 **이름 · 입력 인자와 기본값 · 출력 포맷**이다. 1.0 의 모든 도구가
 * `{content:[{type:'text', text}]}` 하나로 답했으므로 그 모양도 계약이며,
 * 구조화 JSON 을 돌려주는 도구를 두면 그것을 읽던 에이전트가 깨진다.
 */

let dir: string;
let docsRoot: string;
let db: Database;
let stores: ReturnType<typeof attachmentStores> & {
  tokens: SqliteTokenRepository;
  vectors: SqliteVectorIndex;
};
let app: Express;
let root: Actor;
let pat: string;

const rpc = (method: string, params?: unknown) => ({
  jsonrpc: '2.0',
  id: 1,
  method,
  ...(params === undefined ? {} : { params }),
});

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;
const issued = (r: unknown) => r as { ok: true; id: string; token: string };

async function call(name: string, args: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/mcp')
    .set('Authorization', `Bearer ${pat}`)
    .send(rpc('tools/call', { name, arguments: args }));
  return {
    status: res.status,
    body: res.body as {
      result?: { content?: { type: string; text: string }[] };
      error?: { code: number; message: string };
    },
  };
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-mcptools-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = {
    ...attachmentStores(db, docsRoot),
    tokens: new SqliteTokenRepository(db),
    vectors: new SqliteVectorIndex(db),
  };
  root = superuserActor(stores);
  const ws = (
    await createWorkspace(
      { workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) },
      '기획팀',
    )
  ).id;

  const doc = idOf(
    createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '계획.md' }),
  );
  await writeFile(
    join(docsRoot, ws, stores.nodes.pathOf(doc)),
    ['---', 'description: 분기 계획서', '---', '', '# 계획', '', '매출 목표를 정리한다.', '', '## 코드', '', '```java', 'int a = 1;', '```', ''].join('\n'),
    'utf8',
  );

  pat = issued(
    issueToken(stores, root.id, {
      owner: root.id,
      name: 'mcp',
      scope: 'read-write',
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

/**
 * 필수 인자를 도구 정의에서 **자동으로** 채운다.
 *
 * 도구마다 손으로 적으면 도구를 더할 때 그 자리를 빠뜨리고, 빠뜨린 도구는
 * 인자 부족으로 400 을 받아 이 항이 그것을 실행 실패로 잘못 읽는다.
 */
function argsFor(tool: { name: string; args: readonly { name: string; required: boolean }[] }) {
  const 손으로 = ARGS[tool.name];
  if (손으로 !== undefined) return 손으로;

  const args: Record<string, unknown> = {};
  for (const one of tool.args.filter((a) => a.required)) {
    args[one.name] = one.name === 'path' ? '/기획팀/계획.md' : '매출';
  }
  return args;
}

/** 경로가 실제 대상을 가리켜야 하는 도구만 손으로 적는다. */
const ARGS: Record<string, Record<string, unknown>> = {
  read_document: { path: '/기획팀/계획.md' },
  create_document: { path: '/기획팀/새문서.md', content: '# 새 문서\n' },
  delete_document: { path: '/기획팀/계획.md' },
  query_document: { path: '/기획팀/계획.md', query: '매출' },
  summarize_document: { path: '/기획팀/계획.md' },
  resolve_project: { name: '계획' },
  query_code_examples: { query: '코드' },
  search_documents: { query: '매출' },
};

describe('1.0 의 도구 계약을 물려받았다 (`FR-ARCH-001` AC-1)', () => {
  /**
   * **도구 목록이 1.0 의 이름을 그대로 담는다.**
   *
   * 접두가 붙는 넷은 규칙까지 물려받았다 — 접두가 달라지면 1.0 을 쓰던
   * 에이전트의 호출이 이름에서 어긋난다.
   */
  it('AC-1: 1.0 의 도구 이름이 전부 목록에 있다', () => {
    const prefix = sanitizeForToolName('');
    const names = new Set(mcpTools(prefix).map((one) => one.name));

    for (const expected of [
      'list_documents',
      'list_full_tree',
      'read_document',
      'create_document',
      'delete_document',
      `${prefix}_get_config`,
      `${prefix}_search`,
      'query_document',
      'summarize_document',
      `${prefix}_smart_search`,
      'resolve_project',
      'query_code_examples',
      // 1.0 의 무인증 표면에만 있던 둘. 표면을 없애고 이름은 남겼다.
      'list_context_documents',
      'search_documents',
    ]) {
      expect(names, `1.0 의 도구 ${expected} 가 사라졌다`).toContain(expected);
    }
  });

  it('AC-1: 접두 규칙이 1.0 의 sanitizeForToolName 과 같다', () => {
    expect(sanitizeForToolName('DOCU LIGHT'), '공백이 밑줄이 되지 않았다').toBe('DOCU_LIGHT');
    expect(sanitizeForToolName('한글만'), '영숫자가 아닌 글자가 남았다').toBe('DocuLight');
    expect(sanitizeForToolName(''), '빈 값의 기본이 다르다').toBe('DocuLight');
    expect(sanitizeForToolName('a-b.c'), '부호가 지워지지 않았다').toBe('abc');
  });

  it('AC-1: 인자의 기본값이 계약대로 실린다', () => {
    const prefix = sanitizeForToolName('');
    const byName = new Map(mcpTools(prefix).map((one) => [one.name, one]));

    const 검색 = byName.get(`${prefix}_search`);
    expect(검색?.args.find((one) => one.name === 'limit')?.default, 'limit 기본이 10 이 아니다').toBe(10);
    expect(검색?.args.find((one) => one.name === 'mode')?.default, 'mode 기본이 snippets 가 아니다').toBe(
      'snippets',
    );

    const 스마트 = byName.get(`${prefix}_smart_search`);
    expect(스마트?.args.find((one) => one.name === 'mode')?.default, 'mode 기본이 auto 가 아니다').toBe('auto');
    expect(스마트?.args.find((one) => one.name === 'limit')?.default, 'limit 기본이 5 가 아니다').toBe(5);

    const 코드 = byName.get('query_code_examples');
    expect(코드?.args.find((one) => one.name === 'maxTokens')?.default, 'maxTokens 기본이 3000 이 아니다').toBe(
      3000,
    );
  });

  /**
   * **모든 도구가 실제로 답한다.**
   *
   * 목록에 이름만 있고 실행이 없으면 계약을 물려받았다고 할 수 없다. 도구
   * 목록을 분모로 삼아 전부 부르므로, 도구를 더하고 실행을 빠뜨리면 이 항이
   * 곧바로 잡는다.
   */
  it('AC-1: 목록의 모든 도구가 텍스트 하나로 답한다', async () => {
    const prefix = sanitizeForToolName('');
    const tools = mcpTools(prefix);
    expect(tools.length, '도구 목록이 비어 이 항이 공허하다').toBeGreaterThan(0);

    for (const tool of tools) {
      const res = await call(tool.name, argsFor(tool));

      expect(res.status, `${tool.name} 이 실행되지 않았다`).toBe(200);
      const content = res.body.result?.content;
      expect(content, `${tool.name} 의 응답에 content 가 없다`).toBeDefined();
      expect(content?.length, `${tool.name} 의 content 가 비었다`).toBe(1);
      expect(content?.[0]?.type, `${tool.name} 이 텍스트가 아닌 것을 돌려줬다`).toBe('text');
      expect(typeof content?.[0]?.text, `${tool.name} 의 text 가 문자열이 아니다`).toBe('string');
    }
  });
});

describe('1.0 의 소스를 옮겨 오지 않았다 (`FR-ARCH-001` AC-3)', () => {
  /**
   * **경로 참조를 실측한다.**
   *
   * 「옮겨 오지 않았다」를 사람이 눈으로 확인하면 다음 회차에 조용히 깨진다.
   * AI·MCP 코드가 사는 세 디렉터리와 패키지 선언을 훑어 1.0 저장소를
   * 가리키는 글자가 없음을 확인한다.
   */
  it('AC-3: AI·MCP 코드와 의존성이 1.0 경로를 가리키지 않는다', async () => {
    const roots = [
      join(process.cwd(), 'src', 'app', 'mcp'),
      join(process.cwd(), 'src', 'app', 'search'),
      join(process.cwd(), 'src', 'domain', 'search'),
    ];

    const files: string[] = [];
    for (const root of roots) {
      for (const name of await readdir(root)) {
        if (name.endsWith('.ts')) files.push(join(root, name));
      }
    }
    files.push(join(process.cwd(), 'package.json'));

    expect(files.length, '훑을 파일이 없어 이 항이 공허하다').toBeGreaterThan(3);

    // 1.0 저장소의 이름과 그 안의 소스 자리. 어느 것이든 나오면 이식이다.
    const 금지 = [/DocLight/i, /DocuLight[\/]/, /routes[\/]mcp\.js/, /langchain/i, /hnswlib/i];

    for (const file of files) {
      const body = await readFile(file, 'utf8');
      for (const pattern of 금지) {
        expect(pattern.test(body), `${file} 이 1.0 을 가리킨다 (${String(pattern)})`).toBe(false);
      }
    }
  });
});

describe('AI·MCP 표면에 인증·ACL 을 안 받는 경로가 없다 (`FR-ARCH-001` AC-5)', () => {
  it('AC-5: 의미 검색도 인증 뒤에 있다', async () => {
    const prefix = sanitizeForToolName('');
    const res = await request(app)
      .post('/api/mcp')
      .send(rpc('tools/call', { name: `${prefix}_smart_search`, arguments: { query: '매출' } }));

    expect(res.status, '의미 검색이 인증 없이 닿는다').toBe(401);
  });
});
