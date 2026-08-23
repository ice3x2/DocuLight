import * as Dialog from '@radix-ui/react-dialog';
import { useId, useState } from 'react';

import { ConfirmGate } from '../confirm/ConfirmGate.js';

import { PrincipalPicker } from '../principal/PrincipalPicker.js';
import {
  BROKEN_INHERITANCE_NOTICE,
  inheritanceNotice,
  type ContainerKind,
} from '../confirm/notices.js';
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
  nodeKind = 'file',
  view,
  onGrant,
  onRevoke,
  onBreakInheritance,
  onInheritFromParent,
}: {
  nodeId: string;
  nodeName: string;
  /**
   * 컨테이너인가 (`FR-CONFIRM-013`). 상속 고지는 하위가 있는 자리에만
   * 붙는다 — 문서에 붙이면 문구 자체가 거짓이 된다.
   */
  nodeKind?: 'file' | ContainerKind;
  /** 서버가 준 것. 아직 안 왔으면 `undefined`. */
  view?: ShareViewBody;
  onGrant?: (principalId: string, level: 'view' | 'edit') => void;
  onRevoke?: (entryId: string) => void;
  onBreakInheritance?: () => void;
  onInheritFromParent?: () => void;
}) {
  const titleId = useId();
  /** 지금 열려 있는 확인. 둘을 한 상태로 두어야 겹쳐 뜨지 않는다. */
  const [관문, set관문] = useState<'break' | 'inherit' | null>(null);
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
              `ACL 접근자` 는 상속 끊김 노드 감사 목록이 쓰는 지표이고(AC-4),
              둘을 한 줄에 나란히 두면 사용자가 어느 쪽을 읽는지 갈린다.
              두 축이 필요한 화면은 그쪽이지 여기가 아니다. */}
          <p data-testid="share-metrics">
            접근 가능 {view?.metrics.reachable ?? 0}명
          </p>

          {/* 컨테이너면 **언제나** 두 고지가 함께 선다.

              상속 끊김 고지를 끊긴 하위가 있을 때만 띄우면 문구의 등장
              여부가 곧 그 존재를 알린다 (`SEC-CONFIRM-004`) — 그래서 이
              화면은 끊긴 하위의 유무를 받지 않는다. */}
          {nodeKind === 'file' ? null : (
            <>
              <p data-testid="inheritance-notice">{inheritanceNotice(nodeKind)}</p>
              <p data-testid="broken-inheritance-notice">{BROKEN_INHERITANCE_NOTICE}</p>
            </>
          )}

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

          {/* 상속 조작 둘.

              워크스페이스에는 **토글 자체를 렌더하지 않는다**
              (`FR-CONFIRM-015` AC-5) — 상속의 시작점이라 끊을 상위가 없고,
              비활성으로 두면 언젠가 열릴 것처럼 읽힌다.

              부모 권한 가져오기는 **관리 전용**이다 (`SEC-CONFIRM-007`
              AC-2). 편집자가 열거할 수 없는 집합을 통째로 부여하는
              조작이라, 열면 「누구인지 알 수 없는 11명에게 부여하시겠습니까」
              라는 성립 불가능한 확인이 된다. 상속이 이어져 있으면 가져올
              것이 없으므로 그때도 서지 않는다.

              워크스페이스에서도 서지 않는다 (`SEC-WORKSPACE-001` AC-3) —
              상속의 시작점이라 가져올 부모가 아예 없다. 상속 여부만 보고
              가리면 그 값이 어떤 이유로든 거짓이 되는 순간 워크스페이스
              화면에 이 버튼이 선다. */}
          {view !== undefined && view.nodeKind !== 'workspace' ? (
            <button type="button" data-testid="break-inheritance" onClick={() => set관문('break')}>
              상속 끊기
            </button>
          ) : null}

          {view !== undefined &&
          view.nodeKind !== 'workspace' &&
          !view.inheritsAcl &&
          view.level === 'admin' ? (
            <button type="button" data-testid="inherit-from-parent" onClick={() => set관문('inherit')}>
              부모 권한 가져오기
            </button>
          ) : null}

          {/* 상속 끊기의 등급은 대상 노드 유형으로 갈린다 (`FR-CONFIRM-015`).
              디렉토리는 본문 유실이 서브트리 규모로 확대되므로 `L3` 이고
              토큰은 영향 건수 그 자체다 — 임의 문구를 치게 하면 그 수를
              읽지 않고 칠 수 있는데, 확인해야 하는 것이 정확히 그 수다. */}
          <ConfirmGate
            open={관문 === 'break'}
            grade={view?.nodeKind === 'directory' ? 'L3' : 'L2'}
            title={`${nodeName} 의 상속을 끊습니다`}
            {...(view?.nodeKind === 'directory' ? { token: String(view.reached) } : {})}
            onConfirm={() => {
              set관문(null);
              onBreakInheritance?.();
            }}
            onCancel={() => set관문(null)}
          />

          <ConfirmGate
            open={관문 === 'inherit'}
            grade="L2"
            title={`${nodeName} 에 부모의 권한을 가져옵니다`}
            onConfirm={() => {
              set관문(null);
              onInheritFromParent?.();
            }}
            onCancel={() => set관문(null)}
          />

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
