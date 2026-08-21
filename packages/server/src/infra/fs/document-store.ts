import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import type { DocumentStore } from '../../domain/ports/document-store.js';
import { workspaceDirectory } from './workspace-layout.js';

/**
 * `docsRoot` 아래에 마크다운을 그대로 두는 저장소 (`DR-STORAGE-001`).
 *
 * 물리 구조는 `docsRoot/<워크스페이스 ID>/…` 단일 루트 하위 폴더다(`R40`).
 * 문서·디렉토리는 **실제 이름을 그대로 유지**하고 해시는 워크스페이스 한
 * 계층에만 적용한다(`R40-c`) — 그래서 옵시디언 볼트를 그대로 넣을 수 있다.
 */
export class FsDocumentStore implements DocumentStore {
  private readonly root: string;

  constructor(docsRoot: string) {
    this.root = resolve(docsRoot);
  }

  async write(workspaceId: string, relativePath: string, body: string): Promise<void> {
    const target = this.resolveInside(workspaceId, relativePath);
    await mkdir(dirname(target), { recursive: true });
    // 인코딩만 지정하고 그 밖의 변환을 하지 않는다 — 개행·후행 공백·BOM 을
    // 손대면 옵시디언이 쓴 원문과 달라진다.
    await writeFile(target, body, 'utf8');
  }

  async read(workspaceId: string, relativePath: string): Promise<string> {
    return readFile(this.resolveInside(workspaceId, relativePath), 'utf8');
  }

  async exists(workspaceId: string, relativePath: string): Promise<boolean> {
    try {
      await access(this.resolveInside(workspaceId, relativePath));
      return true;
    } catch {
      // 존재하지 않음은 예외 상황이 아니라 정상 분기다. 호출자가 이것을
      // try/catch 로 판정하지 않도록 여기서 불리언으로 바꾼다.
      return false;
    }
  }

  async list(workspaceId: string): Promise<string[]> {
    const root = workspaceDirectory(this.root, workspaceId);
    // 루트는 **반드시 읽혀야 한다.** 못 읽는 것을 빈 것으로 흡수하면
    // 재조정이 그 상태를 「전부 사라졌다」로 읽어, 멀쩡한 문서 전량에
    // tombstone 을 찍고 대기열을 그 수만큼 채운다. 워크스페이스 디렉토리가
    // 통째로 없는 것은 파일이 지워진 것이 아니라 **닿을 수 없는 것**이다.
    return (await walk(root, root, true)).sort();
  }

  /**
   * 워크스페이스 루트 안으로 떨어지는 절대 경로를 만든다.
   *
   * **경로 탈출은 fail-closed 다.** 저장소가 자기 루트 밖을 읽고 쓰면 그 위의
   * 어떤 권한 판정도 의미가 없어진다 — `SEC-STORAGE-006` 이 DB 레코드 없는
   * 경로 요청을 거부하는 것과 같은 방향이다.
   */
  private resolveInside(workspaceId: string, relativePath: string): string {
    if (isAbsolute(relativePath)) {
      throw new Error(`path escapes the workspace root (absolute): ${relativePath}`);
    }

    // 워크스페이스 자리는 레이아웃 모듈이 정한다 — 여기서 다시 조립하면
    // 쓰는 자리와 만드는 자리가 갈린다.
    const workspaceRoot = workspaceDirectory(this.root, workspaceId);
    const target = resolve(join(workspaceRoot, relativePath));
    const rel = relative(workspaceRoot, target);

    if (rel === '' || rel.startsWith('..' + sep) || rel === '..') {
      throw new Error(`path escapes the workspace root (outside): ${relativePath}`);
    }
    return target;
  }
}

/**
 * 디렉토리 아래 모든 **파일**의 상대 경로. 구분자는 `/` 로 통일한다 —
 * Windows 의 역슬래시를 그대로 흘리면 같은 파일이 OS 마다 다른 경로로
 * 읽혀 재조정이 매번 신규 노드를 만든다.
 */
async function walk(at: string, base: string, isRoot = false): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(at, { withFileTypes: true });
  } catch (error) {
    // 루트에서는 어떤 오류도 흡수하지 않는다 — 위 `list` 주석 참조.
    //
    // 하위에서 스캔 도중 사라진 것(`ENOENT`)은 빈 것과 같다. 그 아래
    // 파일들은 실제로 없어졌고 tombstone 이 맞는 처분이다. 권한·입출력
    // 오류는 그렇지 않으므로 그대로 올린다.
    if (isRoot || (error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new Error(`cannot read ${at}`, { cause: error });
    }
    return [];
  }

  const found: string[] = [];
  for (const entry of entries) {
    const full = join(at, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await walk(full, base)));
    } else {
      found.push(relative(base, full).split(sep).join('/'));
    }
  }
  return found;
}
