import type { BrokenInheritanceBody } from '../api/client.js';
import type { AuditQuery } from './BulkRevokePanel.js';

/**
 * 고립 노드의 문구 (`IR-ACL-001` AC-6 · `FR-ACL-005` AC-5).
 *
 * 「아무도 볼 수 없습니다」 라고 쓰지 않는다 — 이 목록을 보고 있는 요청자
 * 자신이 반례라 거짓 진술이 된다. 그리고 접근 가능 수치는 어느 노드에서도
 * 0 이 될 수 없으므로(상방 게이트가 언제나 닿는다) 그 사실을 문구가 함께
 * 밝힌다.
 */
const ISOLATED =
  '권한으로 접근할 수 있는 사람이 없습니다. 지금은 워크스페이스 관리자와 슈퍼유저만 볼 수 있습니다.';

/**
 * 상속이 끊긴 노드를 모아 본다 (`FR-ACL-005`).
 *
 * **`ACL 접근자` 를 쓰고 `접근 가능` 을 쓰지 않는다** (AC-4). 이 목록의
 * 목적이 「권한으로 도달할 수 있는 사람이 없는 노드」를 찾는 것이라, 상방
 * 게이트를 포함하는 지표를 쓰면 어느 행도 0 이 되지 않아 목적이 무너진다.
 */
export function InheritanceAuditPanel({
  query,
}: {
  query: AuditQuery<BrokenInheritanceBody>;
}) {
  const current = query;

  if (current.state === 'idle') return <p>상속 끊김 감사를 아직 조회하지 않았습니다.</p>;
  if (current.state === 'loading') return <p role="status">상속 끊김을 확인하는 중…</p>;
  if (current.state === 'error') return <div role="alert"><p>상속 끊김을 확인하지 못했습니다.</p><button type="button" onClick={current.onRetry}>상속 감사 다시 시도</button></div>;
  if (current.data.rows.length === 0) return <p data-testid="broken-empty">상속이 끊긴 노드가 없습니다.</p>;

  return (
    <ul className="acl-inheritance-list">
      {current.data.rows.map((row) => (
        <li key={row.nodeId} data-testid={`broken-row-${row.nodeId}`}>
          <span>{row.workspaceName}</span>
          <span>{row.path}</span>
          <span>ACL 접근자 {row.aclAccessors}명</span>
          {row.aclAccessors === 0 ? <span>{ISOLATED}</span> : null}
          <p>상속 변경의 영향을 확인할 수 없습니다.</p>
          <button type="button" disabled aria-describedby={`restore-unavailable-${row.nodeId}`}>
            {row.path} 상속으로 되돌리기
          </button>
          <span id={`restore-unavailable-${row.nodeId}`} className="sr-only">영향 미리보기가 지원될 때까지 사용할 수 없습니다.</span>
        </li>
      ))}
    </ul>
  );
}
