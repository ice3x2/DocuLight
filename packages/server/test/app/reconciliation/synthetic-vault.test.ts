import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { reconcile } from '../../../src/app/reconciliation/reconcile.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { FsDocumentStore } from '../../../src/infra/fs/document-store.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { SqliteAuditLog } from '../../../src/infra/sqlite/audit-log-repository.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteFindingQueue } from '../../../src/infra/sqlite/finding-queue-repository.js';
import { SqliteNodeRepository } from '../../../src/infra/sqlite/node-repository.js';
import { SqliteWorkspaceRepository } from '../../../src/infra/sqlite/workspace-repository.js';
import { makeSyntheticVault, type SyntheticVault } from '../../support/synthetic-vault.js';

/**
 * 실제 옵시디언 볼트를 그대로 넣었을 때 부딪히는 것들 (원장 §4 **수용 기준 1**).
 *
 * 기준 1 의 검증 방법은 「실제 볼트로 수동 검증」이고 그 회차는 2026-08-24 에
 * 있었다(md 1,315 · 비-md 133). 그 뒤 다섯 회차가 지났지만 **같은 볼트로 다시
 * 재려면 개인 데이터가 필요하다.** 그 데이터는 저장소에 없고 있어서도 안 된다.
 *
 * **그래서 볼트의 성질만 합성해 자동으로 잰다.** 수동 회차를 대신하는 것이
 * 아니라, 그 회차가 한 번 확인한 것이 **회귀하지 않는지**를 매번 잰다 — 수동
 * 검증은 한 시점의 사진이고, 그 뒤의 커밋이 그것을 깨뜨려도 아무도 모른다.
 */
let dir: string;
let docsRoot: string;
let db: Database;
let nodes: SqliteNodeRepository;
let stores: Parameters<typeof reconcile>[0];
let ws: string;
let vault: SyntheticVault;

/** 이 워크스페이스의 파일 노드 경로 전부. */
const 파일경로들 = () =>
  nodes
    .allIn(ws)
    .filter((n) => n.kind === 'file')
    .map((n) => nodes.pathOf(n.id));

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-vault-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));

  nodes = new SqliteNodeRepository(db);
  const workspaces = new SqliteWorkspaceRepository(db);
  const files = new FsWorkspaceFiles(docsRoot);

  stores = {
    nodes,
    workspaces,
    documents: new FsDocumentStore(docsRoot),
    files,
    audit: new SqliteAuditLog(db),
    queue: new SqliteFindingQueue(db),
    // 회차를 한 트랜잭션으로 묶는다 (`DR-STORAGE-002` AC-2).
    transaction: <T,>(fn: () => T): T => db.transaction(fn),
  };

  ws = (await createWorkspace({ workspaces, files }, '볼트')).id;
  // 워크스페이스의 디스크 자리 **안에** 볼트를 푼다 — 사용자가 자기 볼트를
  // 기본 워크스페이스에 그대로 넣는 상황이 기준 1 의 문면이다.
  vault = await makeSyntheticVault(join(docsRoot, ws));
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('수용 기준 1 — 옵시디언 볼트의 성질을 합성해 잰다', () => {
  it('`.obsidian` 아래는 트리에 서지 않는다', async () => {
    await reconcile(stores);

    // 모든 볼트에 있는 디렉토리이며 사용자의 문서가 아니다. 트리에 서면
    // 사용자는 자기가 만들지 않은 것을 자기 문서 사이에서 보게 되고,
    // 그것을 지우면 옵시디언 쪽 설정이 깨진다.
    expect(파일경로들().some((one) => one.includes('.obsidian'))).toBe(false);
  });

  it('md 가 아닌 파일도 트리에 선다', async () => {
    await reconcile(stores);
    const 경로들 = 파일경로들();

    // 실제 볼트의 133개가 그것이었다. md 만 세우면 그림과 첨부가 통째로
    // 사라지고, 사용자는 자기 볼트가 절반만 들어왔다고 읽는다.
    for (const one of vault.nonMarkdown) {
      expect(경로들, `${one} 이 트리에 없다`).toContain(one.replace(/\//g, '/'));
    }
  });

  it('일곱 겹 아래의 문서도 트리에 선다', async () => {
    await reconcile(stores);

    const 깊은것 = vault.deepPath.replace(/\\/g, '/');
    expect(파일경로들()).toContain(깊은것);
  });

  it('스캔한 수가 디스크의 수와 같다 — 하나도 빠뜨리지 않는다', async () => {
    await reconcile(stores);

    // 개수만 세는 것이 아니라 **디스크를 실제로 세어** 맞춘다. 상수로 적으면
    // 파일 시스템이 다른 기계에서 깨진다.
    expect(파일경로들()).toHaveLength(vault.visibleCount);
  });

  it('이름의 정규화 형태를 파일 시스템이 보존하면 두 문서가 각각 선다', async () => {
    await reconcile(stores);
    const 경로들 = 파일경로들();

    if (vault.keepsNormalization) {
      // Windows·Linux — NFC 와 NFD 는 서로 다른 이름이므로 둘 다 서야 한다.
      // 한쪽을 정규화해 다른 쪽과 같게 다루면 문서 하나가 조용히 사라진다.
      expect(경로들).toContain(vault.nfcName);
      expect(경로들).toContain(vault.nfdName);
    } else {
      // macOS — 파일 시스템이 둘을 하나로 합쳤으므로 하나만 선다.
      const 짝 = 경로들.filter((one) => one.normalize('NFC') === vault.nfcName.normalize('NFC'));
      expect(짝).toHaveLength(1);
    }
  });

  it('대소문자만 다른 이름을 파일 시스템이 가르면 두 문서가 각각 선다', async () => {
    await reconcile(stores);
    const 경로들 = 파일경로들();

    const 짝 = 경로들.filter((one) => one.toLowerCase() === vault.lowerName.toLowerCase());
    expect(짝).toHaveLength(vault.caseSensitive ? 2 : 1);
  });

  it('규모가 커져도 전부 선다', async () => {
    // 앞선 볼트를 지우고 규모만 큰 것으로 다시 만든다 — 실제 볼트의
    // 실측값이 1,300 이었고, 한 건씩 삽입하는 구현은 그 수에서 드러난다.
    await rm(join(docsRoot, ws), { recursive: true, force: true });
    await mkdir(join(docsRoot, ws), { recursive: true });
    const 큰볼트 = await makeSyntheticVault(join(docsRoot, ws), { bulkCount: 1_300 });

    await reconcile(stores);

    expect(파일경로들()).toHaveLength(큰볼트.visibleCount);
    // **이 시험 하나에만 제한을 준다.** 파일 1,300건을 만들고 읽는 일이라
    // 디스크가 바쁘면 그만큼 늘어난다 — 실측이 무부하 3.7초, 부하 아래
    // 4.9~45.3초로 열두 배 요동했고 전역 제한 20초를 넘겼다. 전역
    // `testTimeout` 을 올려 이것을 살리면 나머지 1384 항의 제한까지 함께
    // 느슨해지므로 그렇게 하지 않는다. 단언은 그대로다.
  }, 120_000);
});
