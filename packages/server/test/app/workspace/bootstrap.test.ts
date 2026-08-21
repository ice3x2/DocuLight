import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_WORKSPACE_NAME,
  bootstrapDefaultWorkspace,
} from '../../../src/app/workspace/bootstrap-default-workspace.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { FsWorkspaceFiles, SIDECAR_FILENAME } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteWorkspaceRepository } from '../../../src/infra/sqlite/workspace-repository.js';

let dir: string;
let docsRoot: string;
let db: Database;
let workspaces: SqliteWorkspaceRepository;
let deps: { workspaces: SqliteWorkspaceRepository; files: FsWorkspaceFiles };

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-bootstrap-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  workspaces = new SqliteWorkspaceRepository(db);
  deps = { workspaces, files: new FsWorkspaceFiles(docsRoot) };
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('FR-WORKSPACE-006 — 최초 기동이 기본 워크스페이스를 만든다', () => {
  it('FR-WORKSPACE-006 AC-1 — 워크스페이스가 하나도 없는 상태로 기동하면 워크스페이스 1개가 생성된다.', async () => {
    expect(workspaces.list()).toEqual([]);

    const created = await bootstrapDefaultWorkspace(deps);

    // 0개를 허용하면 설치 직후의 사용자가 아무 데도 문서를 만들 수 없다.
    expect(created).not.toBeUndefined();
    expect(workspaces.list()).toHaveLength(1);
  });

  it('FR-WORKSPACE-006 AC-2 — 그 워크스페이스의 표시 이름은 `workspace` 다.', async () => {
    const created = await bootstrapDefaultWorkspace(deps);

    // 이름은 한 곳에 고정한다 — 이행 도구와 설치 마법사가 같은 이름을
    // 기대하므로 자리마다 적으면 갈린다.
    expect(DEFAULT_WORKSPACE_NAME).toBe('workspace');
    expect(created?.name).toBe(DEFAULT_WORKSPACE_NAME);
    expect(workspaces.list()[0]?.name).toBe('workspace');
  });

  it('FR-WORKSPACE-006 AC-3 — 이미 워크스페이스가 존재하는 상태로 재기동하면 추가 생성이 일어나지 않는다.', async () => {
    const existing = await createWorkspace(deps, '기획팀');

    const first = await bootstrapDefaultWorkspace(deps);
    const second = await bootstrapDefaultWorkspace(deps);

    expect(first).toBeUndefined();
    expect(second).toBeUndefined();
    expect(workspaces.list().map((w) => w.id)).toEqual([existing.id]);

    // 이름이 `workspace` 인지가 아니라 **개수**가 판정 기준이다. 이름으로
    // 판정하면 사용자가 기본 워크스페이스를 개명한 순간 매 기동마다
    // 하나씩 늘어난다.
    await createWorkspace(deps, 'workspace');
    expect(await bootstrapDefaultWorkspace(deps)).toBeUndefined();
    expect(workspaces.list()).toHaveLength(2);
  });

  it('FR-WORKSPACE-006 AC-4 — 생성된 워크스페이스는 `docsRoot/<해시 ID>/` 물리 레이아웃을 갖춘다.', async () => {
    const created = await bootstrapDefaultWorkspace(deps);

    expect(await readdir(docsRoot)).toEqual([created!.id]);
    expect(created!.id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('FR-WORKSPACE-006 AC-5 — 생성된 워크스페이스 디렉토리에 `.workspace.json` 이 함께 만들어진다.', async () => {
    const created = await bootstrapDefaultWorkspace(deps);

    expect(await readdir(join(docsRoot, created!.id))).toEqual([SIDECAR_FILENAME]);

    const sidecar = JSON.parse(
      await readFile(join(docsRoot, created!.id, SIDECAR_FILENAME), 'utf8'),
    ) as Record<string, unknown>;
    expect(sidecar.id).toBe(created!.id);
    expect(sidecar.name).toBe(DEFAULT_WORKSPACE_NAME);
  });
});
