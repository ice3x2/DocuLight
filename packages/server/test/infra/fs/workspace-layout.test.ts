import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { loadConfig } from '../../../src/config/config.js';
import { FsDocumentStore } from '../../../src/infra/fs/document-store.js';
import {
  createWorkspaceDirectory,
  workspaceDirectory,
} from '../../../src/infra/fs/workspace-layout.js';
import { SIDECAR_FILENAME } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteWorkspaceRepository } from '../../../src/infra/sqlite/workspace-repository.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';

let dir: string;
let docsRoot: string;
let db: Database;
let workspaces: SqliteWorkspaceRepository;
let wsStores: { workspaces: SqliteWorkspaceRepository; files: FsWorkspaceFiles };

/** 한글·공백·다단 중첩·점 디렉토리를 담은 옵시디언 볼트 모사. */
const VAULT_ENTRIES = [
  '.obsidian/app.json',
  '.obsidian/workspace.json',
  '회의 기록/2026 상반기/기획 회의 (1차).md',
  '회의 기록/read me.md',
  'Daily Notes/2026-08-21.md',
  '첨부 파일/스크린샷 001.png',
];

/** 디렉토리 아래 모든 파일의 상대 경로를 정렬해 돌려준다. */
async function walk(at: string, base: string = at, skip?: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(at, { withFileTypes: true })) {
    const full = join(at, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await walk(full, base, skip)));
    } else if (entry.name !== skip) {
      found.push(relative(base, full).split(sep).join('/'));
    }
  }
  return found.sort();
}

async function buildVault(at: string): Promise<void> {
  for (const entry of VAULT_ENTRIES) {
    const full = join(at, entry);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, `# ${entry}\n`, 'utf8');
  }
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-layout-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  workspaces = new SqliteWorkspaceRepository(db);
  wsStores = { workspaces, files: new FsWorkspaceFiles(docsRoot) };
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('DR-WORKSPACE-001 — 워크스페이스는 docsRoot 아래 해시 디렉토리다', () => {
  it('DR-WORKSPACE-001 AC-1 — 모든 워크스페이스는 `docsRoot` 한 곳의 하위 폴더로 존재하며 워크스페이스별 독립 파일시스템 경로를 설정할 수 없다.', async () => {
    const a = await createWorkspace(wsStores, '기획팀');
    const b = await createWorkspace(wsStores, '개발팀');

    await createWorkspaceDirectory(docsRoot, a.id);
    await createWorkspaceDirectory(docsRoot, b.id);

    expect((await readdir(docsRoot)).sort()).toEqual([a.id, b.id].sort());

    // 경로를 정하는 인자가 docsRoot 와 ID 뿐이다. 워크스페이스별 경로를
    // 받을 자리가 없으면 어떤 호출자도 루트를 흩을 수 없다 — 흩어지면
    // 백업과 재조정 스캔이 둘 다 루트 목록에 종속된다.
    expect(workspaceDirectory).toHaveLength(2);
    expect(createWorkspaceDirectory).toHaveLength(2);

    // 설정에도 워크스페이스별 경로 키가 없다.
    const config = loadConfig({});
    expect(Object.keys(config).sort()).toEqual(['databaseFile', 'docsRoot', 'port']);
  });

  it('DR-WORKSPACE-001 AC-2 — 워크스페이스 디렉토리의 이름은 해시 ID 이며 표시 이름을 포함하지 않는다.', async () => {
    const ws = await createWorkspace(wsStores, '기획팀 · CON · 매우 긴 이름');
    await createWorkspaceDirectory(docsRoot, ws.id);

    const [onDisk] = await readdir(docsRoot);
    expect(onDisk).toBe(ws.id);

    // 해시 계층이 한글·공백·예약어·경로 길이를 회피하는 자리다.
    expect(ws.id).toMatch(/^[0-9a-f]{32}$/);
    expect(onDisk).not.toContain('기획팀');
    expect(onDisk).not.toContain('CON');
    expect(onDisk).not.toContain(' ');
  });

  it('DR-WORKSPACE-001 AC-3 — 워크스페이스 표시 이름은 DB 에 저장된다.', async () => {
    const ws = await createWorkspace(wsStores, '기획팀');
    await createWorkspaceDirectory(docsRoot, ws.id);

    expect(workspaces.findById(ws.id)?.name).toBe('기획팀');

    // 디스크에서 표시 이름이 나타나는 자리는 사이드카 **하나**뿐이고,
    // 그것은 재구성용 사본이지 정본이 아니다(`R40-b` · `R40-d`).
    // 디렉토리명에는 표시 이름이 없다.
    expect(await readdir(join(docsRoot, ws.id))).toEqual([SIDECAR_FILENAME]);
    expect(ws.id).not.toContain('기획팀');
  });

  it('DR-WORKSPACE-001 AC-4 — 워크스페이스 표시 이름을 변경해도 그 워크스페이스의 물리 경로는 바뀌지 않는다.', async () => {
    const ws = await createWorkspace(wsStores, '기획팀');
    const before = await createWorkspaceDirectory(docsRoot, ws.id);

    workspaces.rename(ws.id, '전략기획팀');

    expect(workspaces.findById(ws.id)?.name).toBe('전략기획팀');
    expect(workspaceDirectory(docsRoot, ws.id)).toBe(before);
    expect((await readdir(docsRoot))).toEqual([ws.id]);
  });

  it('DR-WORKSPACE-001 AC-5 — 워크스페이스 개명 후에도 기존 첨부 URL 과 백업 경로가 그대로 유효하다.', async () => {
    const ws = await createWorkspace(wsStores, '기획팀');
    await createWorkspaceDirectory(docsRoot, ws.id);
    const documents = new FsDocumentStore(docsRoot);

    // 첨부 URL 과 백업 경로는 둘 다 `<워크스페이스 ID>/<상대 경로>` 로 선다.
    const attachment = '첨부 파일/스크린샷 001.png';
    await documents.write(ws.id, attachment, 'PNG');

    workspaces.rename(ws.id, '전략기획팀');

    expect(await documents.exists(ws.id, attachment)).toBe(true);
    expect(await documents.read(ws.id, attachment)).toBe('PNG');
  });

  it('DR-WORKSPACE-001 AC-6 — 워크스페이스 하위의 디렉토리와 문서는 파일시스템에 사용자가 지은 실제 이름으로 저장되며 해시로 치환되지 않는다.', async () => {
    const ws = await createWorkspace(wsStores, '기획팀');
    await createWorkspaceDirectory(docsRoot, ws.id);
    const documents = new FsDocumentStore(docsRoot);

    await documents.write(ws.id, '회의 기록/2026 상반기/기획 회의.md', '# 기획');

    // 해시는 워크스페이스 한 계층에만 적용한다. 파일 이름이 해시가 되면
    // 서버에서 파일을 직접 열어 본 사람이 무엇이 무엇인지 알 수 없어
    // 파일시스템이 SSOT 라는 원칙이 실질적으로 무너진다.
    expect(await walk(join(docsRoot, ws.id), undefined, SIDECAR_FILENAME)).toEqual([
      '회의 기록/2026 상반기/기획 회의.md',
    ]);
  });

  it('DR-WORKSPACE-001 AC-7 — 옵시디언 볼트를 워크스페이스 디렉토리에 그대로 넣었을 때 내부 경로와 파일명이 변형되지 않는다.', async () => {
    const vault = join(dir, 'vault-fixture');
    await buildVault(vault);
    const expected = await walk(vault);
    expect(expected).toEqual([...VAULT_ENTRIES].sort());

    const ws = await createWorkspace(wsStores, '옮겨 온 볼트');
    const target = await createWorkspaceDirectory(docsRoot, ws.id);
    await cp(vault, target, { recursive: true });

    // 사이드카는 볼트에서 온 것이 아니라 제품이 둔 것이라 비교에서 뺀다.
    const actual = await walk(target, undefined, SIDECAR_FILENAME);

    // 문자열 비교로는 정규화 차이가 숨는다. 바이트로 재야 macOS 가
    // 만든 NFD 이름이 NFC 로 바뀌는 변형까지 걸린다.
    expect(actual.map((p) => Buffer.from(p, 'utf8').toString('hex'))).toEqual(
      expected.map((p) => Buffer.from(p, 'utf8').toString('hex')),
    );
  });
});
