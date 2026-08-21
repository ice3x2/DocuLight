import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { reconcileWorkspaceSidecars } from '../../../src/app/workspace/restore-from-sidecar.js';
import { FsWorkspaceFiles, SIDECAR_FILENAME } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteWorkspaceRepository } from '../../../src/infra/sqlite/workspace-repository.js';

let dir: string;
let docsRoot: string;
let db: Database;
let workspaces: SqliteWorkspaceRepository;
let files: FsWorkspaceFiles;
let deps: { workspaces: SqliteWorkspaceRepository; files: FsWorkspaceFiles };

const sidecarPath = (id: string) => join(docsRoot, id, SIDECAR_FILENAME);

const readSidecar = async (id: string) =>
  JSON.parse(await readFile(sidecarPath(id), 'utf8')) as Record<string, unknown>;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-sidecar-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  workspaces = new SqliteWorkspaceRepository(db);
  files = new FsWorkspaceFiles(docsRoot);
  deps = { workspaces, files };
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('DR-WORKSPACE-002 — 사이드카는 재구성용 사본이고 권위는 DB 다', () => {
  it('DR-WORKSPACE-002 AC-1 — 워크스페이스 생성 시 그 디렉토리 안에 `.workspace.json` 이 만들어지고 `id`·`name`·`createdAt` 세 필드를 담는다.', async () => {
    const ws = await createWorkspace(deps, '기획팀');

    expect(await readdir(join(docsRoot, ws.id))).toEqual([SIDECAR_FILENAME]);

    const sidecar = await readSidecar(ws.id);
    // 세 필드 **뿐**이 아니라 세 필드를 담는다. 다만 여분의 칸이 늘면
    // 재구성이 무엇을 믿어야 할지 갈리므로 여기서 고정한다.
    expect(Object.keys(sidecar).sort()).toEqual(['createdAt', 'id', 'name']);
    expect(sidecar.id).toBe(ws.id);
    expect(sidecar.name).toBe('기획팀');
    expect(typeof sidecar.createdAt).toBe('string');
  });

  it('DR-WORKSPACE-002 AC-2 — 재조정 시 `.workspace.json` 은 DB 값을 기준으로 재작성된다.', async () => {
    const ws = await createWorkspace(deps, '기획팀');
    workspaces.rename(ws.id, '전략기획팀');

    // 개명은 DB 만 바꾼다. 재조정이 파일을 따라오게 한다.
    expect((await readSidecar(ws.id)).name).toBe('기획팀');

    const result = await reconcileWorkspaceSidecars(deps);

    expect(result.rewritten).toEqual([ws.id]);
    expect(result.restored).toEqual([]);
    expect((await readSidecar(ws.id)).name).toBe('전략기획팀');
  });

  it('DR-WORKSPACE-002 AC-3 — 사이드카의 `name` 과 DB 의 표시 이름이 어긋나면 DB 값이 이기고 파일이 갱신된다.', async () => {
    const ws = await createWorkspace(deps, '기획팀');

    // 사람이 파일을 직접 고쳤거나 낡은 백업이 덮인 상황.
    await writeFile(
      sidecarPath(ws.id),
      JSON.stringify({ id: ws.id, name: '엉뚱한 이름', createdAt: '1999-01-01T00:00:00.000Z' }),
      'utf8',
    );

    await reconcileWorkspaceSidecars(deps);

    // 흐름은 한 방향이다. 양방향 동기화면 이 자리에서 백업 사본이
    // 정본을 덮어쓴다.
    expect(workspaces.findById(ws.id)?.name).toBe('기획팀');
    expect((await readSidecar(ws.id)).name).toBe('기획팀');
  });

  it('DR-WORKSPACE-002 AC-4 — DB 에 해당 워크스페이스 레코드가 없을 때에만 `.workspace.json` 에서 워크스페이스를 복원한다.', async () => {
    const kept = await createWorkspace(deps, '남는 것');
    const lost = await createWorkspace(deps, '지워진 것');
    const lostCreatedAt = (await readSidecar(lost.id)).createdAt;

    db.run('DELETE FROM workspace WHERE id = ?', [lost.id]);
    expect(workspaces.findById(lost.id)).toBeUndefined();

    const result = await reconcileWorkspaceSidecars(deps);

    // 레코드가 없던 하나만 복원된다.
    expect(result.restored).toEqual([lost.id]);
    expect(result.rewritten).toEqual([kept.id]);

    const restored = workspaces.findById(lost.id);
    expect(restored?.name).toBe('지워진 것');
    expect(restored?.createdAt).toBe(lostCreatedAt);

    // 남아 있던 쪽은 파일이 아니라 DB 가 이긴다 — 복원 경로가 그쪽으로
    // 새면 백업 사본이 정본을 덮는다.
    expect(workspaces.findById(kept.id)?.name).toBe('남는 것');
  });

  it('DR-WORKSPACE-002 AC-7 — DB 를 비운 상태로 `docsRoot` 만 남기고 기동하면 모든 워크스페이스가 `.workspace.json` 으로부터 재구성된다.', async () => {
    const created = [
      await createWorkspace(deps, '기획팀'),
      await createWorkspace(deps, '개발팀'),
      await createWorkspace(deps, '디자인팀'),
    ];

    // DB 손상을 모사한다. 해시 폴더만 남으면 사이드카가 없는 한 어느
    // 것이 무엇인지 알 방법이 없다 — 그것이 이 파일이 있는 이유다.
    db.run('DELETE FROM workspace');
    expect(workspaces.list()).toEqual([]);

    const result = await reconcileWorkspaceSidecars(deps);

    expect(result.restored.sort()).toEqual(created.map((w) => w.id).sort());
    expect(workspaces.list().map((w) => w.name).sort()).toEqual(
      ['개발팀', '기획팀', '디자인팀'].sort(),
    );
  });

  it('DR-WORKSPACE-002 — 사이드카가 없는 디렉토리는 복원하지 않는다.', async () => {
    // 해시처럼 생겼다는 이유로 등재하면 사용자가 docsRoot 에 둔 아무
    // 디렉토리나 워크스페이스가 된다.
    await mkdir(join(docsRoot, 'deadbeefdeadbeefdeadbeefdeadbeef'), { recursive: true });

    const result = await reconcileWorkspaceSidecars(deps);

    expect(result.restored).toEqual([]);
    expect(workspaces.list()).toEqual([]);
  });
});
