import { useState } from 'react';

import type { PrincipalRow, RevocationBody, RevocationScope } from '../api/client.js';
import { ConfirmGate } from '../confirm/ConfirmGate.js';
import { PrincipalPicker } from '../principal/PrincipalPicker.js';

/**
 * 적용 범위 문구 (`FR-PRINCIPAL-004`).
 *
 * 서버가 준 값으로 고른다 — 화면이 요청자 레벨을 다시 판정하면 실제로
 * 걷히는 범위와 갈리고, 회수는 되돌리려면 재부여가 필요해 그 차이를
 * 사후에 알아차리기 어렵다.
 *
 * 슈퍼유저에게 관리 범위 한정 문구를 그대로 보이지 않는다 (AC-3) — 논리
 * 모순은 없지만 그 문구를 본 슈퍼유저는 자신이 부분 회수를 한다고 오해한
 * 채 전 인스턴스 회수를 실행한다.
 */
const SCOPE_NOTE: Record<RevocationScope, string> = {
  instance: '이 회수는 전 인스턴스에 적용됩니다.',
  'managed-workspaces': '이 회수는 당신이 관리하는 워크스페이스에만 적용됩니다.',
};

/**
 * 시스템 그룹을 골랐을 때의 안내 (`FR-CONFIRM-020` AC-3).
 *
 * **주체마다 각각 선다.** 묶음 하나로 접으면 어느 주체가 시스템 그룹인지
 * 알 수 없고, 그 그룹 앞 항목은 걷으면 영구히 사라진다.
 */
const SYSTEM_GROUP_NOTE = '시스템 그룹입니다. 걷은 항목은 가입·활성화 절차로 되살아나지 않습니다.';

/**
 * 주체 축 일괄 회수 (`FR-ACL-003` · `FR-CONFIRM-020`~`FR-CONFIRM-022`).
 *
 * **주체를 여럿 고를 수 있다** (`FR-CONFIRM-020` AC-1). 반대로 임의 노드를
 * 다중 선택해 걷는 자리는 두지 않는다 (AC-4) — 이 화면의 축은 주체이고,
 * 노드 축 선택칸이 서면 그 자체로 다른 조작이 된다.
 *
 * **시스템 그룹을 후보에서 빼지 않는다** (`FR-PRINCIPAL-010` AC-1). 시스템
 * 그룹 잠금은 삭제와 개명만 금지하고 ACL 회수는 다루지 않으며, `default`
 * 그룹 앞으로 부여된 항목은 걷으면 영구히 사라지므로 실제 효과가 있는
 * 조작이다. 그래서 이 화면은 주체를 거르는 코드를 두지 않는다.
 */
export function BulkRevokePanel({
  workspaceId,
  subjects = [],
  revocation,
  onPick,
  onRevoke,
}: {
  /** 주체 검색의 부여 자격 근거 (`R162`). 이 화면은 관리 전용이다. */
  workspaceId: string;
  subjects?: readonly PrincipalRow[];
  revocation?: RevocationBody;
  onPick?: (row: PrincipalRow) => void;
  onRevoke?: (principalIds: readonly string[]) => void;
}) {
  const [관문열림, set관문열림] = useState(false);
  const rows = revocation?.rows ?? [];

  /**
   * 영향 건수 (`FR-CONFIRM-022`).
   *
   * **총합으로 판정한다** (AC-6). 주체별로 판정하면 0 건인 주체가 조용히
   * 빠지고, 어느 주체가 빠졌는지가 곧 그 주체에게 항목이 없다는 신호다.
   *
   * 0 건이면 강등이 아니라 **차단**이다 (AC-5) — 강등하면 「확인만 하고
   * 아무 일도 일어나지 않는」 경로가 생기고, 그 무해한 통과가 곧 0 건이라는
   * 신호가 된다.
   */
  const 영향 = rows.length;
  const 실행가능 = subjects.length > 0 && 영향 > 0;

  return (
    <section>
      <h2>주체 단위 권한 회수</h2>

      <PrincipalPicker scope={`workspace:${workspaceId}`} onPick={onPick} />

      {subjects.length === 0 ? null : (
        <ul data-testid="revocation-subjects">
          {subjects.map((subject) => (
            <li key={subject.id}>
              <span>{subject.name}</span>
              {subject.system === true ? (
                <span data-testid="system-group-notice">{SYSTEM_GROUP_NOTE}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {revocation === undefined ? null : (
        <>
          <p data-testid="revocation-scope">{SCOPE_NOTE[revocation.scope]}</p>

          <table>
            <caption>걷힐 항목</caption>
            <thead>
              <tr>
                <th scope="col">워크스페이스</th>
                <th scope="col">경로</th>
                <th scope="col">레벨</th>
                <th scope="col">부여자</th>
                <th scope="col">부여 시각</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.entryId}>
                  <td>{row.workspaceName}</td>
                  {/* 워크스페이스 자체에 걸린 항목에는 경로가 없다 — 빈
                      칸으로 두면 경로를 못 읽은 것과 구별되지 않는다. */}
                  <td>{row.path ?? '워크스페이스 전체'}</td>
                  <td>{row.level}</td>
                  <td>{row.grantedBy ?? '시스템'}</td>
                  <td>{row.grantedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <button type="button" disabled={!실행가능} onClick={() => set관문열림(true)}>
            권한 전부 회수
          </button>

          {/* 확인은 **묶음 1회**다 (`FR-CONFIRM-021`). 주체마다 받으면
              스무 명을 오프보딩할 때 사용자가 스무 번째를 읽지 않는다.

              토큰이 영향 건수 그 자체다 (`FR-CONFIRM-022` AC-1) — 임의
              문구를 치게 하면 그 수를 읽지 않고 칠 수 있는데, 이 조작에서
              확인해야 하는 것이 정확히 그 수다. */}
          <ConfirmGate
            open={관문열림}
            grade="L3"
            title="선택한 주체의 권한을 회수합니다"
            token={String(영향)}
            onConfirm={() => {
              set관문열림(false);
              onRevoke?.(subjects.map((subject) => subject.id));
            }}
            onCancel={() => set관문열림(false)}
          >
            {/* 주체 수와 항목 수를 함께 보인다 (AC-2). 어느 하나만 보이면
                「몇 사람의 몇 건인가」를 실행자가 알 수 없다. 건수에
                분모를 붙이지 않는다 (AC-3). */}
            <p data-testid="revocation-tally">
              주체 {subjects.length}명 · 항목 {영향}건
            </p>
          </ConfirmGate>
        </>
      )}
    </section>
  );
}
