import { readFile } from 'node:fs/promises';

import { migrateAccounts } from './app/migration/migrate-accounts.js';
import { migrateContent } from './app/migration/migrate-content.js';
import { DEFAULT_WORKSPACE_NAME } from './app/workspace/bootstrap-default-workspace.js';
import { loadConfig } from './config/config.js';
import { FsLegacyContentImporter } from './infra/fs/legacy-content-importer.js';
import { bootstrap } from './main.js';

/**
 * 1.0 → 2.0 일회성 이행 도구 (`MIG-AUTH-001` AC-3 · `MIG-AUTH-002`).
 *
 * **제품 진입점과 분리된 자리다** (`waves.jsonl` 결정 `D-W4-03`). `main.ts`
 * 에 걸면 한 번 쓰고 마는 경로가 매 기동마다 조립에 실리고, 조립 방벽이
 * 그것을 「상시 필요한 부품」으로 요구하게 된다.
 *
 * 1.0 저장소를 **읽기만 한다.** 이 도구는 그쪽에 아무것도 쓰지 않으며,
 * 1.0 을 읽기 전용으로 동결하는 것은 코드가 아니라 운영 절차가 한다
 * (`docs/ops/1.0-freeze-and-cutover.md` · 결정 `D-W4-02`).
 *
 * 실행:
 *
 * ```
 * npm run migrate --workspace @doculight/server -- \
 *   --legacy-users <1.0>/data/users.json --legacy-docs <1.0 docsRoot>
 * ```
 */

interface MigrationArgs {
  legacyUsers?: string;
  legacyDocs?: string;
}

/**
 * `--키 값` 쌍만 읽는다.
 *
 * 짝이 맞지 않는 인자는 **조용히 무시하지 않는다** — 오타 난 경로가 무시되면
 * 이행이 「계정 0건 옮김」으로 성공한 것처럼 끝난다.
 */
export function parseMigrationArgs(argv: readonly string[]): MigrationArgs | { error: string } {
  const args: MigrationArgs = {};

  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (value === undefined) return { error: `${key} 에 값이 없습니다` };

    if (key === '--legacy-users') args.legacyUsers = value;
    else if (key === '--legacy-docs') args.legacyDocs = value;
    else return { error: `알 수 없는 인자 ${key}` };
  }

  if (args.legacyUsers === undefined && args.legacyDocs === undefined) {
    return { error: '--legacy-users 또는 --legacy-docs 중 하나는 있어야 합니다' };
  }
  return args;
}

async function run(): Promise<number> {
  const parsed = parseMigrationArgs(process.argv.slice(2));
  if ('error' in parsed) {
    console.error(`이행 인자 오류 — ${parsed.error}`);
    return 2;
  }

  const config = loadConfig();
  const runtime = await bootstrap(config);
  const stores = { ...runtime.stores, legacy: new FsLegacyContentImporter(config.docsRoot) };

  if (parsed.legacyUsers !== undefined) {
    const raw = JSON.parse(await readFile(parsed.legacyUsers, 'utf8')) as unknown;
    const created = migrateAccounts(stores, raw);
    console.log(`계정 ${created.length}건을 옮겼습니다 (전원 active · default 그룹).`);
    console.log('1.0 전역 API Key 는 옮기지 않았습니다 — 클라이언트는 PAT 를 새로 발급받아야 합니다.');
  }

  if (parsed.legacyDocs !== undefined) {
    const workspace = stores.workspaces
      .list()
      .find((one) => one.name === DEFAULT_WORKSPACE_NAME);
    if (workspace === undefined) {
      console.error(`기본 워크스페이스 ${DEFAULT_WORKSPACE_NAME} 가 없습니다.`);
      return 1;
    }

    const result = await migrateContent(stores, {
      legacyDocsRoot: parsed.legacyDocs,
      workspaceId: workspace.id,
    });
    console.log(
      `문서 ${result.copied}개를 복사해 노드 ${result.created}개를 세우고 ${result.indexed}개를 색인했습니다.`,
    );
    console.log('벡터 인덱스는 1.0 에서 옮기지 않고 2.0 에서 다시 세웠습니다.');
  }

  return 0;
}

// `node migrate.js` 로 직접 실행될 때만 돈다 — 방벽의 도달 판정이 이 파일을
// 진입점으로 삼아 import 하므로, 조건 없이 실행하면 그 시험이 이행을 돌린다.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  process.exitCode = await run();
}
