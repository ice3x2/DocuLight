import { useCallback, useEffect, useState } from 'react';

import { listVersions, loadVersion, restoreVersion, type VersionRow } from '../api/client.js';
import { MergeView } from './MergeView.js';

/**
 * 버전 기록 (`IR-STORAGE-001` · `FR-SHELL-002` AC-3).
 *
 * 비교 화면이 **충돌 병합과 같은 컴포넌트**다(AC-3). 둘을 따로 만들면
 * 한쪽에만 손이 가서 같은 조작이 두 화면에서 다르게 동작하는데, 사용자에게는
 * 둘 다 「나란히 놓고 고르는 일」이다.
 *
 * 작성자와 시각을 함께 보여 준다 — 「누가」가 없으면 사용자는 어느 것을
 * 고를지 알 수 없다. 그 칸이 있는 것이 `G28` 판정의 이유였다.
 */
export function VersionHistory({
  nodeId,
  currentBody,
  onRestored,
}: {
  nodeId: string;
  /** 지금 편집 중인 본문 — 비교의 오른쪽이다. */
  currentBody: string;
  onRestored?: (seq: number) => void;
}) {
  const [rows, setRows] = useState<readonly VersionRow[] | null>(null);
  const [comparing, setComparing] = useState<{ seq: number; body: string } | null>(null);

  useEffect(() => {
    void listVersions(nodeId)
      .then(setRows)
      // 못 받으면 「없다」가 아니라 「모른다」다 — 빈 목록으로 접으면
      // 사용자가 버전이 사라졌다고 읽는다.
      .catch(() => setRows(null));
  }, [nodeId]);

  const compare = useCallback(
    async (seq: number) => {
      const version = await loadVersion(nodeId, seq).catch(() => null);
      if (version !== null) setComparing({ seq, body: version.body });
    },
    [nodeId],
  );

  const restore = useCallback(
    async (seq: number) => {
      await restoreVersion(nodeId, seq).catch(() => undefined);
      onRestored?.(seq);
    },
    [nodeId, onRestored],
  );

  if (rows === null) return <p>버전 기록을 불러오는 중입니다.</p>;
  if (rows.length === 0) return <p>보관된 버전이 없습니다.</p>;

  return (
    <div>
      <ul aria-label="버전 기록">
        {rows.map((row) => (
          <li key={row.seq}>
            <span>{row.seq}판</span>
            <span>{row.createdAt}</span>
            <span>{row.author}</span>
            <button type="button" onClick={() => void compare(row.seq)}>
              {row.seq}판 비교
            </button>
            <button type="button" onClick={() => void restore(row.seq)}>
              {row.seq}판 복원
            </button>
          </li>
        ))}
      </ul>

      {comparing !== null && (
        <MergeView
          label="버전 비교"
          left={comparing.body}
          right={currentBody}
          onResolve={() => void restore(comparing.seq)}
        />
      )}
    </div>
  );
}
