import { readdirSync, readFileSync, statSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createNode } from '../../../src/app/node/node-service.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteNodeRepository } from '../../../src/infra/sqlite/node-repository.js';
import { SqliteWorkspaceRepository } from '../../../src/infra/sqlite/workspace-repository.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';

let dir: string;
let db: Database;
let nodes: SqliteNodeRepository;
let workspaces: SqliteWorkspaceRepository;
let wsStores: { workspaces: SqliteWorkspaceRepository; files: FsWorkspaceFiles };
let stores: { nodes: SqliteNodeRepository; workspaces: SqliteWorkspaceRepository };
let ws: string;

const columnsOf = (table: string) =>
  db.all<{ name: string; notnull: number }>(`PRAGMA table_info(${table})`);

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-hierarchy-'));
  const docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  nodes = new SqliteNodeRepository(db);
  workspaces = new SqliteWorkspaceRepository(db);
  wsStores = { workspaces, files: new FsWorkspaceFiles(docsRoot) };
  stores = { nodes, workspaces };
  ws = (await createWorkspace(wsStores, '기획팀')).id;
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('FR-WORKSPACE-001 — 노드 계층은 루트 → 워크스페이스 → 디렉토리 → 문서다', () => {
  it('FR-WORKSPACE-001 AC-1 — 모든 문서와 디렉토리는 정확히 하나의 워크스페이스에 속한다.', () => {
    const created = createNode(stores, {
      workspaceId: ws,
      parentId: null,
      kind: 'directory',
      name: '회의',
    });
    expect(created.ok).toBe(true);
    expect(nodes.findById(idOf(created))?.workspaceId).toBe(ws);

    // 「정확히 하나」의 절반은 **둘일 수 없다**는 것이다. 소속을 담는
    // 칸이 하나뿐이면 두 워크스페이스에 걸칠 자리가 없다.
    const membership = columnsOf('node').filter((c) => /workspace/.test(c.name));
    expect(membership.map((c) => c.name)).toEqual(['workspace_id']);

    // 나머지 절반은 **없을 수 없다**는 것이다. 없는 워크스페이스를 대면
    // 만들어지지 않는다 — 사후에 예외를 잡아 분기하지 않고 사전에 막고,
    // 거부는 던지지 않고 값으로 돌려준다. API 호출자가 상시 도달하는
    // 예측 가능한 분기이기 때문이다.
    const orphan = createNode(stores, {
      workspaceId: 'ws-없음',
      parentId: null,
      kind: 'file',
      name: '고아.md',
    });
    expect(orphan.ok).toBe(false);
    expect((orphan as { violations: { rule: string }[] }).violations.map((v) => v.rule)).toEqual([
      'unknown-workspace',
    ]);
    expect(db.all('SELECT id FROM node')).toHaveLength(1);
  });

  it('FR-WORKSPACE-001 AC-2 — 워크스페이스의 부모는 루트뿐이며, 워크스페이스 안에 다른 워크스페이스를 만들 수 없다.', () => {
    // 부모를 받을 자리 자체를 두지 않는다. 인자가 없으면 어떤 호출자도
    // 워크스페이스를 다른 워크스페이스 아래에 둘 수 없다.
    expect(createWorkspace).toHaveLength(2);

    const parentish = columnsOf('workspace').filter((c) => /parent|workspace_id|path/.test(c.name));
    expect(parentish.map((c) => c.name)).toEqual([]);

    // 노드 계층에도 워크스페이스 종류가 없다 — 있으면 노드 트리 안에서
    // 중첩이 가능해진다.
    expect(() =>
      nodes.create({
        workspaceId: ws,
        parentId: null,
        // @ts-expect-error 계층에 없는 종류다. 스키마도 이것을 받지 않는다.
        kind: 'workspace',
        name: '중첩',
      }),
    ).toThrow();
  });

  it('FR-WORKSPACE-001 AC-3 — 문서·디렉토리 노드는 루트를 직접 부모로 가질 수 없다.', () => {
    // 소속 칸이 NOT NULL 이므로 어떤 노드도 워크스페이스 밖에 설 수 없다.
    // 「루트 직속」이라는 상태가 표현될 자리가 없다.
    const membership = columnsOf('node').find((c) => c.name === 'workspace_id');
    expect(membership?.notnull).toBe(1);

    // parentId 가 null 인 것은 루트 직속이 아니라 **워크스페이스 바로 아래**다.
    // 두 상태를 같은 값으로 읽으면 AC-3 이 무의미해진다.
    const top = createNode(stores, {
      workspaceId: ws,
      parentId: null,
      kind: 'directory',
      name: '회의',
    });
    expect(nodes.findById(idOf(top))?.workspaceId).toBe(ws);
    expect(nodes.pathOf(idOf(top))).toBe('회의');
  });

  it('FR-WORKSPACE-001 AC-4 — 사용자에게 보이는 화면·문구·API 응답에서 이 계층을 `볼트`(vault)가 아니라 `워크스페이스`로 표기한다.', async () => {
    // 화면 문구는 SHELL scope 의 뒤 wave 가 받는다. 여기서 재는 것은
    // 서버가 내는 이름과 문구다.
    const src = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'src');

    const offenders: string[] = [];
    const walk = (at: string) => {
      for (const entry of readdirSync(at)) {
        const full = join(at, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|sql)$/.test(entry)) {
          continue;
        }
        const text = readFileSync(full, 'utf8');
        text.split('\n').forEach((line, i) => {
          // 볼트를 **언급**하는 것과 그 이름을 쓰는 것은 다르다. 옵시디언
          // 볼트를 설명하는 주석은 개념을 가리키므로 여기서 빼고,
          // 식별자·문구에 쓰인 것만 센다.
          if (/vault|볼트/i.test(line) && !/^\s*(\*|\/\/|--)/.test(line)) {
            offenders.push(`${full}:${i + 1}`);
          }
        });
      }
    };
    walk(src);

    expect(offenders, `vault·볼트 표기: ${offenders.join(', ')}`).toEqual([]);

    // 도메인 타입과 API 표면의 이름이 workspace 다.
    expect(Object.keys(await createWorkspace(wsStores, '두번째'))).toContain('id');
    expect(columnsOf('node').map((c) => c.name)).toContain('workspace_id');
  });
});
