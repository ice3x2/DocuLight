import type { PrincipalRow, RevocationBody, RevocationScope } from '../api/client.js';
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
 * 주체 축 일괄 회수 (`FR-ACL-003`).
 *
 * **시스템 그룹을 후보에서 빼지 않는다** (`FR-PRINCIPAL-010` AC-1). 시스템
 * 그룹 잠금은 삭제와 개명만 금지하고 ACL 회수는 다루지 않으며, `default`
 * 그룹 앞으로 부여된 항목은 걷으면 영구히 사라지므로 실제 효과가 있는
 * 조작이다. 그래서 이 화면은 주체를 거르는 코드를 두지 않는다.
 */
export function BulkRevokePanel({
  workspaceId,
  subject,
  revocation,
  onPick,
  onRevoke,
}: {
  /** 주체 검색의 부여 자격 근거 (`R162`). 이 화면은 관리 전용이다. */
  workspaceId: string;
  subject?: PrincipalRow;
  revocation?: RevocationBody;
  onPick?: (row: PrincipalRow) => void;
  onRevoke?: (principalId: string) => void;
}) {
  const rows = revocation?.rows ?? [];

  return (
    <section>
      <h2>주체 단위 권한 회수</h2>

      <PrincipalPicker scope={`workspace:${workspaceId}`} onPick={onPick} />

      {revocation === undefined ? null : (
        <>
          <p data-testid="revocation-scope">{SCOPE_NOTE[revocation.scope]}</p>

          <table>
            <caption>{subject === undefined ? '걷힐 항목' : `${subject.name} 앞으로 부여된 항목`}</caption>
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

          <button
            type="button"
            // 걷을 것이 없으면 누를 수 없다 — 빈 실행은 아무것도 바꾸지
            // 않으면서 감사 행만 남긴다.
            disabled={subject === undefined || rows.length === 0}
            onClick={() => (subject === undefined ? undefined : onRevoke?.(subject.id))}
          >
            권한 전부 회수
          </button>
        </>
      )}
    </section>
  );
}
