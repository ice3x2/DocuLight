import { cp, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import type { LegacyContentImporter } from '../../domain/ports/legacy-content.js';
import type { WorkspaceId } from '../../domain/workspace/workspace.js';
import { createWorkspaceDirectory } from './workspace-layout.js';
import { SIDECAR_FILENAME } from './workspace-sidecar.js';

/**
 * 1.0 콘텐츠를 파일시스템으로 들이는 어댑터 (`MIG-AUTH-001` AC-3 · AC-4).
 *
 * `cp` 의 재귀 복사를 쓴다 — 바이트를 그대로 옮기는 것이 이 어댑터의 전부이고,
 * 직접 읽어 쓰면 인코딩을 고르는 자리가 생겨 비-md 가 그 자리에서 깨진다.
 *
 * **사이드카는 덮지 않는다.** `.workspace.json` 은 DB 값으로 쓰인 워크스페이스의
 * 권위 사본이고(`R40-d`), 1.0 볼트에 같은 이름이 있으면 그것이 덮여 재조정이
 * 그 워크스페이스를 남의 자리로 읽는다.
 */
export class FsLegacyContentImporter implements LegacyContentImporter {
  constructor(private readonly docsRoot: string) {}

  async importInto(workspaceId: WorkspaceId, sourceDirectory: string): Promise<number> {
    const target = await createWorkspaceDirectory(this.docsRoot, workspaceId);

    await cp(sourceDirectory, target, {
      recursive: true,
      // 이미 있는 파일을 덮지 않는다 — 이행을 두 번 돌리는 것이 정상 복구
      // 경로인데(도중에 끊길 수 있다) 덮으면 그 사이에 2.0 에서 편집한
      // 내용이 1.0 판으로 되돌아간다.
      force: false,
      errorOnExist: false,
      filter: (source) => !source.endsWith(SIDECAR_FILENAME),
    });

    return countFiles(target);
  }
}

/** 워크스페이스 디렉토리 안의 파일 수. 사이드카는 콘텐츠가 아니라 빼고 센다. */
async function countFiles(at: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(at)) {
    const full = join(at, entry);
    if ((await stat(full)).isDirectory()) {
      total += await countFiles(full);
      continue;
    }
    if (entry !== SIDECAR_FILENAME) total += 1;
  }
  return total;
}
