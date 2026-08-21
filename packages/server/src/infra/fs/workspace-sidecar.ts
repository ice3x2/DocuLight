import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { WorkspaceFiles } from '../../domain/ports/workspace-files.js';
import type { Workspace, WorkspaceId } from '../../domain/workspace/workspace.js';
import { createWorkspaceDirectory, workspaceDirectory } from './workspace-layout.js';

/**
 * 워크스페이스 디렉토리 안의 재구성용 사본 (`DR-WORKSPACE-002` · `R40-b`).
 *
 * 이 파일이 없으면 해시 폴더만 남았을 때 어느 것이 무엇인지 알 방법이
 * 사라져, 디렉토리명을 해시로 둔 결정이 「파일시스템이 SSOT」라는 원칙을
 * 무너뜨린다.
 *
 * 점으로 시작하는 이름이라 트리에 보이지 않고 일반 읽기·쓰기 API 로도
 * 닿지 않는다(`SEC-STORAGE-004`).
 */
export const SIDECAR_FILENAME = '.workspace.json';

function isWorkspaceSidecar(value: unknown): value is Workspace {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { id, name, createdAt } = value as Record<string, unknown>;
  return typeof id === 'string' && typeof name === 'string' && typeof createdAt === 'string';
}

export class FsWorkspaceFiles implements WorkspaceFiles {
  constructor(private readonly docsRoot: string) {}

  async createDirectory(id: WorkspaceId): Promise<void> {
    await createWorkspaceDirectory(this.docsRoot, id);
  }

  async writeSidecar(workspace: Workspace): Promise<void> {
    const at = workspaceDirectory(this.docsRoot, workspace.id);
    await mkdir(at, { recursive: true });
    // 세 필드만 쓴다. 여분의 칸이 늘면 재구성이 무엇을 믿어야 할지 갈린다.
    const body = JSON.stringify(
      { id: workspace.id, name: workspace.name, createdAt: workspace.createdAt },
      null,
      2,
    );
    await writeFile(join(at, SIDECAR_FILENAME), `${body}\n`, 'utf8');
  }

  async readAllSidecars(): Promise<Workspace[]> {
    const entries = await readdir(this.docsRoot, { withFileTypes: true });
    const found: Workspace[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const sidecar = await this.readOne(join(this.docsRoot, entry.name, SIDECAR_FILENAME));
      if (sidecar !== undefined) {
        found.push(sidecar);
      }
    }
    return found;
  }

  private async readOne(at: string): Promise<Workspace | undefined> {
    let raw: string;
    try {
      raw = await readFile(at, 'utf8');
    } catch {
      // 사이드카가 없는 디렉토리는 워크스페이스가 아니다. 이름만 보고
      // 등재하면 사용자가 docsRoot 에 둔 아무 디렉토리나 워크스페이스가
      // 된다. 없음은 예외 상황이 아니라 정상 분기라 여기서 흡수한다.
      return undefined;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // 깨진 파일은 없는 것과 같게 다룬다 — 절반만 읽어 복원하면 잘못된
      // 이름이 DB 에 정본으로 들어앉는다.
      return undefined;
    }

    return isWorkspaceSidecar(parsed) ? parsed : undefined;
  }
}
