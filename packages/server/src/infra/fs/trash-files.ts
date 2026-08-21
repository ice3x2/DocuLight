import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { TrashFiles } from '../../domain/ports/trash-files.js';
import type { TrashEntry } from '../../domain/trash/trash-entry.js';
import {
  TRASH_DIRECTORY,
  TRASH_SIDECAR,
  trashDirectoryOf,
} from '../../domain/trash/trash-layout.js';

/**
 * 휴지통의 파일시스템 어댑터.
 *
 * 사이드카를 **먼저** 쓰고 파일을 옮긴다. 순서가 반대면 옮긴 뒤 사이드카를
 * 쓰기 전에 실패했을 때 어디서 왔는지 모르는 항목이 남는다 — 그 항목은
 * 목록에도 뜨지 않고 복구도 안 된다.
 */
export class FsTrashFiles implements TrashFiles {
  constructor(private readonly docsRoot: string) {}

  private dirFor(entry: TrashEntry): string {
    return join(this.docsRoot, entry.workspaceId, trashDirectoryOf(entry.nodeId));
  }

  async moveIn(entry: TrashEntry, originalName: string): Promise<void> {
    const target = this.dirFor(entry);
    await mkdir(target, { recursive: true });

    // 사이드카가 먼저다 — 이것이 있으면 실체가 없어도 그 항목의 정체를 안다.
    await writeFile(join(target, TRASH_SIDECAR), JSON.stringify(entry, null, 2), 'utf8');

    const from = join(this.docsRoot, entry.workspaceId, entry.originalPath);
    await rename(from, join(target, originalName));
  }

  async moveOut(entry: TrashEntry, originalName: string, restoreTo: string): Promise<void> {
    const to = join(this.docsRoot, entry.workspaceId, restoreTo);
    await mkdir(dirname(to), { recursive: true });
    await rename(join(this.dirFor(entry), originalName), to);

    // 실체가 제자리로 간 뒤에 사이드카를 지운다. 먼저 지우면 그 사이에서
    // 실패했을 때 정체 모를 항목이 남는다.
    await rm(this.dirFor(entry), { recursive: true, force: true });
  }

  async purge(entry: TrashEntry): Promise<void> {
    // 실체와 사이드카가 같은 디렉토리에 있으므로 한 번에 사라진다
    // (`SEC-STORAGE-003` AC-4 · `DR-STORAGE-004` AC-4).
    await rm(this.dirFor(entry), { recursive: true, force: true });
  }

  async readSidecars(workspaceId: string): Promise<TrashEntry[]> {
    const root = join(this.docsRoot, workspaceId, TRASH_DIRECTORY);

    let names: string[];
    try {
      names = await readdir(root);
    } catch {
      // 휴지통 디렉토리가 아직 없는 것은 「비어 있다」와 같다 — 아무것도
      // 지운 적 없는 워크스페이스가 그렇다.
      return [];
    }

    const entries: TrashEntry[] = [];
    for (const name of names) {
      try {
        const raw = await readFile(join(root, name, TRASH_SIDECAR), 'utf8');
        entries.push(JSON.parse(raw) as TrashEntry);
      } catch {
        // 사이드카를 못 읽는 디렉토리는 **건너뛴다.** 던지면 손상된 항목
        // 하나가 목록 전체를 못 세우게 만든다 — 재구성의 목적이 손상
        // 복구인데 그러면 그 목적이 자기 부정된다.
      }
    }
    return entries;
  }
}
