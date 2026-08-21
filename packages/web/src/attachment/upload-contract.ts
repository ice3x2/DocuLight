import type { TreeNodeView } from '../tree/tree-contract.js';

/**
 * 업로드 **두 경로의 공통 판정** (`FR-ATTACH-001` · `FR-ATTACH-004` ·
 * `FR-ATTACH-006` · `SEC-ATTACH-001` · `CON-ATTACH-001`).
 *
 * 트리 드롭과 편집기 붙여넣기는 대상이 다르지만 — 하나는 디렉토리, 하나는
 * 문서 — 크기 제한과 형식 무제한은 **같은 값**이어야 한다. 두 경로가 각자
 * 판정하면 한쪽에만 제한이 걸리거나 한쪽만 권한을 본다.
 *
 * 화면에서 걸러 내는 이유는 정직함 때문이다 — 받아 놓고 서버가 거절하면
 * 사용자에게는 파일이 사라진 것으로 보인다. 서버의 판정은 그대로 남는다:
 * 이것은 그 판정의 사본이 아니라 **먼저 알려 주는 자리**다.
 */

export type DropTarget = TreeNodeView;

export type UploadRule = 'no-files' | 'not-a-directory' | 'forbidden' | 'too-large';

export interface UploadRequest {
  /** 트리 드롭이면 그 디렉토리. */
  parentId?: string;
  /** 붙여넣기면 그 문서 — 첨부 권한이 소유 문서로 판정되기 때문이다. */
  ownerNodeId?: string;
  files: readonly File[];
}

export type UploadOutcome =
  | { ok: true; request: UploadRequest }
  | { ok: false; rule: UploadRule };

/** 설정에서 온 상한. 주지 않으면 화면에서는 거르지 않고 서버에 맡긴다. */
export interface UploadLimits {
  limitBytes?: number;
}

const canEdit = (level: TreeNodeView['level']) => level === 'edit' || level === 'admin';

function checkFiles(files: readonly File[], limits: UploadLimits): UploadRule | null {
  if (files.length === 0) return 'no-files';
  // 확장자·MIME 으로 거르지 않는다 (`CON-ATTACH-001`) — 차단 목록도
  // 허용 목록도 두지 않는 것이 조항이다.
  if (limits.limitBytes !== undefined && files.some((f) => f.size > limits.limitBytes!)) {
    return 'too-large';
  }
  return null;
}

/** 트리의 디렉토리에 떨궜다 (`FR-ATTACH-001`). */
export function acceptedDrop(
  target: DropTarget,
  files: readonly File[],
  limits: UploadLimits = {},
): UploadOutcome {
  const bad = checkFiles(files, limits);
  if (bad !== null) return { ok: false, rule: bad };

  if (target.kind !== 'directory') return { ok: false, rule: 'not-a-directory' };
  // pass-through 는 지나가는 자리이지 담는 자리가 아니다 — 그 디렉토리에
  // 대한 권한이 없어 이름만 보이는 상태다.
  if (target.visibility !== 'full' || !canEdit(target.level)) return { ok: false, rule: 'forbidden' };

  return { ok: true, request: { parentId: target.id, files } };
}

/** 편집기에 붙여넣거나 떨궜다 (`FR-ATTACH-004`). */
export function pasteUpload(
  document: { nodeId: string; level: TreeNodeView['level'] },
  files: readonly File[],
  limits: UploadLimits = {},
): UploadOutcome {
  const bad = checkFiles(files, limits);
  if (bad !== null) return { ok: false, rule: bad };

  // 디렉토리 권한을 보지 않는다(AC-3) — 어느 디렉토리에도 편집 권한이
  // 없지만 이 문서에만 편집 권한을 받은 사용자가 붙여넣을 수 있어야 한다.
  if (!canEdit(document.level)) return { ok: false, rule: 'forbidden' };

  return { ok: true, request: { ownerNodeId: document.nodeId, files } };
}
