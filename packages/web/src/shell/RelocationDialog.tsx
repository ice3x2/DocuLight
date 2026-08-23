import { useId } from 'react';

import { RelocationPreview, type Relocation } from '../acl/RelocationPreview.js';

/**
 * 복사 다이얼로그의 안내 문구 (`SEC-SHELL-003` AC-3 · 원장 `R105-a`).
 *
 * **조건 없이 언제나 같은 문구다.** 숨은 노드가 있을 때만 띄우면 그 표시
 * 자체가 존재 오라클이 된다 — 사용자는 문구의 유무만으로 자기가 못 보는
 * 노드가 거기 있다는 것을 알게 된다.
 *
 * 그래서 이 부품에는 **숨은 노드의 유무를 받을 소품이 없다.** 칸이 있으면
 * 언젠가 그것으로 문구를 가르게 된다.
 */
const COPY_NOTICE = '권한에 따라 일부 항목이 제외될 수 있습니다';

/**
 * 옮기거나 복사할 자리를 고른다 (`FR-SHELL-003` · `SEC-SHELL-003` ·
 * `FR-ACL-006` · `FR-ACL-002`).
 *
 * 두 조작이 한 부품인 이유는 **고르는 것이 같기 때문**이다 — 목적지를
 * 고르고 접근자 프리뷰를 보고 실행한다. 나누면 프리뷰가 두 곳에 서고,
 * 그때 지표명이 갈린다.
 *
 * 다른 것은 안내 문구 하나다. 이동은 원본을 옮기므로 「일부가 제외」라는
 * 개념 자체가 없다.
 */
export function RelocationDialog({
  kind,
  open,
  sourceName,
  destinations = [],
  destinationId,
  relocation,
  level,
  result,
  onDestination,
  onConfirm,
  onCancel,
}: {
  kind: 'move' | 'copy';
  open: boolean;
  sourceName: string;
  destinations?: readonly { id: string; path: string }[];
  destinationId?: string;
  relocation?: Relocation;
  level?: 'view' | 'edit' | 'admin';
  /**
   * 실행 결과 (`SEC-SHELL-003` AC-4). **복사된 항목 수 하나뿐이다** —
   * 분모를 실을 칸을 두면 그 차액이 곧 숨은 노드의 개수가 된다.
   */
  result?: { copied: number };
  onDestination?: (destinationId: string) => void;
  onConfirm?: () => void;
  onCancel?: () => void;
}) {
  const titleId = useId();
  const selectId = useId();

  if (!open) return null;

  return (
    <div role="dialog" aria-labelledby={titleId}>
      <h2 id={titleId}>
        {sourceName} {kind === 'copy' ? '복사' : '이동'}
      </h2>

      <label htmlFor={selectId}>목적지</label>
      <select
        id={selectId}
        value={destinationId ?? ''}
        onChange={(event) => onDestination?.(event.target.value)}
      >
        <option value="">선택하세요</option>
        {destinations.map((destination) => (
          <option key={destination.id} value={destination.id}>
            {destination.path}
          </option>
        ))}
      </select>

      {relocation === undefined ? null : (
        <RelocationPreview relocation={relocation} {...(level === undefined ? {} : { level })} />
      )}

      {kind === 'copy' ? <p data-testid="copy-notice">{COPY_NOTICE}</p> : null}

      {/* 결과가 없을 때 0 을 그리지 않는다 — 아직 안 한 것과 0 개를 복사한
          것이 같은 모양이 되면 사용자가 실패로 읽는다. */}
      {result === undefined ? null : (
        <p role="status">{result.copied}개 항목을 {kind === 'copy' ? '복사' : '이동'}했습니다.</p>
      )}

      <button type="button" onClick={onCancel}>
        취소
      </button>
      <button type="button" disabled={destinationId === undefined} onClick={onConfirm}>
        실행
      </button>
    </div>
  );
}
