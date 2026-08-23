import * as Dialog from '@radix-ui/react-dialog';
import { useId, useState } from 'react';

import { PrincipalPicker } from '../principal/PrincipalPicker.js';
import type { PrincipalRow, ShareRow, ShareViewBody } from '../api/client.js';

/**
 * 노드 하나의 공유 (`IR-ACL-002` · `IR-ACL-003`).
 *
 * 지정 방식은 **검색해서 추가**다 — 전체 주체 목록을 펼치지 않으므로
 * 디렉토리 열거 표면이 줄고, 그 사실이 최소 질의 길이·결과 상한의 근거가
 * 됐다. 검색 부품은 `PrincipalPicker` 하나를 그대로 쓴다
 * (`CON-PRINCIPAL-006`) — 여기서 자체 검색을 만들면 규칙이 갈린다.
 *
 * **문서와 디렉토리가 같은 부품을 쓴다** (`IR-ACL-003` AC-5). 노드 종류로
 * 갈래를 두지 않는 것이 그 요구이며, 서버 응답의 모양도 둘이 같다.
 */
export function ShareModal({
  nodeId,
  nodeName,
  view,
  onGrant,
  onRevoke,
}: {
  nodeId: string;
  nodeName: string;
  /** 서버가 준 것. 아직 안 왔으면 `undefined`. */
  view?: ShareViewBody;
  onGrant?: (principalId: string, level: 'view' | 'edit') => void;
  onRevoke?: (entryId: string) => void;
}) {
  const titleId = useId();
  const [고른주체, set고른주체] = useState<PrincipalRow | null>(null);
  const [레벨, set레벨] = useState<'view' | 'edit'>('view');

  return (
    <Dialog.Root>
      <Dialog.Trigger aria-label={`${nodeName} 공유`}>공유</Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content aria-labelledby={titleId}>
          <Dialog.Title id={titleId}>{nodeName} 공유</Dialog.Title>

          {/* 수치는 편집 보유자에게도 온다 (`SEC-ACL-015` AC-5). */}
          {/* 이 화면의 지표는 `접근 가능` 하나다 (`IR-ACL-001` AC-3).
              `ACL 접근자` 는 상속 끊김 감사 목록이 쓰는 지표이고(AC-4),
              둘을 한 줄에 나란히 두면 사용자가 어느 쪽을 읽는지 갈린다.
              두 축이 필요한 화면은 그쪽이지 여기가 아니다. */}
          <p data-testid="share-metrics">
            접근 가능 {view?.metrics.reachable ?? 0}명
          </p>

          <PrincipalPicker scope={`node:${nodeId}`} onPick={set고른주체} />

          {/* 추가된 주체마다 보기와 편집 중 하나 (`IR-ACL-003` AC-3). */}
          <label htmlFor={`${titleId}-level`}>권한</label>
          <select
            id={`${titleId}-level`}
            value={레벨}
            onChange={(event) => set레벨(event.target.value === 'edit' ? 'edit' : 'view')}
          >
            <option value="view">보기</option>
            <option value="edit">편집</option>
          </select>

          <button
            type="button"
            disabled={고른주체 === null}
            onClick={() => {
              if (고른주체 !== null) onGrant?.(고른주체.id, 레벨);
            }}
          >
            추가
          </button>

          {/* 목록은 관리 전용이라 `null` 로 온다 (`SEC-ACL-015` AC-1).
              부분 목록으로 대신하지 않는다 (AC-6) — 아예 그리지 않는다. */}
          {view?.rows == null ? null : (
            <ul aria-label="공유 대상">
              {view.rows.map((row) => (
                <ShareEntry key={row.entryId ?? `${row.principalId}@${row.source}`} row={row} {...(onRevoke === undefined ? {} : { onRevoke })} />
              ))}
            </ul>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * 한 줄. **상속 항목에는 회수 버튼이 없다** (`IR-ACL-002` AC-3).
 *
 * 판정 근거가 `entryId` 의 부재 하나다 — 별도 플래그를 보고 감추면 그
 * 플래그를 안 보는 화면이 생기고, 그때 버튼은 지울 것이 없는 요청을 낸다.
 */
function ShareEntry({ row, onRevoke }: { row: ShareRow; onRevoke?: (entryId: string) => void }) {
  return (
    <li data-inherited={row.inherited ? 'true' : 'false'}>
      <span>{row.principalName}</span>
      <span>{row.level === 'edit' ? '편집' : row.level === 'admin' ? '관리' : '보기'}</span>
      {row.entryId === null ? (
        // 출처가 있어야 관리자가 어디를 고쳐야 하는지 안다 (AC-2).
        <span data-testid="share-source">{row.source} 에서 상속</span>
      ) : (
        <button type="button" onClick={() => onRevoke?.(row.entryId!)}>
          {row.principalName} 회수
        </button>
      )}
    </li>
  );
}
