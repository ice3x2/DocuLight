import type { PrincipalId } from '../principal/principal.js';
import { isPastRetention } from '../retention/retention.js';

/**
 * 휴지통 항목 하나 (`DR-STORAGE-004` AC-1).
 *
 * 네 값이 **사이드카에 그대로 실린다.** DB 의 같은 행은 그 사이드카의
 * 캐시이며, 둘이 어긋나면 사이드카가 이긴다(AC-3) — DB 가 손상돼도
 * 파일시스템만으로 목록을 되세울 수 있어야 하기 때문이다(AC-2).
 */
export interface TrashEntry {
  nodeId: string;
  workspaceId: string;
  /** 삭제 시점의 워크스페이스 루트 기준 경로. 복구가 이 값으로 돌아간다. */
  originalPath: string;
  deletedAt: string;
  deletedBy: PrincipalId;
}

/**
 * 보존 기간이 지났는가 (`FR-STORAGE-007` AC-2 · AC-4).
 *
 * `0` 은 무제한이다 — 「기간이 0일」이 아니라 「기간을 두지 않는다」는
 * 뜻이며, 그래서 0 이면 어떤 항목도 기간을 이유로 사라지지 않는다.
 *
 * 판정 자체는 감사 로그와 **같은 술어**를 쓴다 (`R154`) — 각자 쓰면 `0` 의
 * 뜻이 한쪽에서만 바뀌는 날이 온다.
 */
export function isExpired(entry: TrashEntry, retentionDays: number, now: Date): boolean {
  return isPastRetention(entry.deletedAt, retentionDays, now);
}
