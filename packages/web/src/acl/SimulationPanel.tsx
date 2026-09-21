import type { PrincipalRow, SimulationBody } from '../api/client.js';
import { PrincipalPicker } from '../principal/PrincipalPicker.js';
import type { AuditQuery } from './BulkRevokePanel.js';

/**
 * 왜 저 사람이 저 문서를 못 보는가 (`FR-ACL-004`).
 *
 * **못 보는 노드도 행으로 그린다** (AC-6). 그 행이 이 화면의 답이므로
 * 빼면 화면이 목적을 잃는다 — 빈 목록은 「권한이 없다」와 「노드가 없다」를
 * 구별하지 못한다.
 *
 * 출처를 함께 그린다 (AC-5). 상속으로 받은 것과 직접 받은 것이 구별되지
 * 않으면 관리자가 어디를 고쳐야 하는지 알 수 없다.
 */
const SOURCE: Record<'direct' | 'inherited', string> = {
  direct: '직접 부여',
  inherited: '상속',
};

export function SimulationPanel({
  contextKey = '',
  workspaceId,
  selectedSubject,
  query,
  onPick,
}: {
  contextKey?: string;
  /** 주체 검색의 부여 자격 근거 (`R162`). 이 화면은 관리 전용이다. */
  workspaceId: string;
  selectedSubject: PrincipalRow | null;
  query: AuditQuery<SimulationBody>;
  onPick?: (row: PrincipalRow) => void;
}) {
  const current = query;
  const mismatched = current.state === 'ready' && selectedSubject !== null && current.data.subjectId !== selectedSubject.id;
  const missingIdentity = selectedSubject === null && current.state === 'ready';
  return (
    <section className="acl-audit-section">
      <h2>유효 권한 시뮬레이션</h2>

      <PrincipalPicker contextKey={contextKey} scope={`workspace:${workspaceId}`} onPick={onPick} />

      {selectedSubject === null && current.state === 'idle' ? <p>시뮬레이션할 주체를 선택하세요.</p> : null}
      {selectedSubject === null ? null : <p data-testid="simulation-subject">{selectedSubject.name} · {selectedSubject.kind === 'user' ? '사용자' : '그룹'}</p>}
      {current.state === 'loading' ? <p role="status">유효 권한을 확인하는 중…</p> : null}
      {current.state === 'error' ? <div role="alert"><p>유효 권한을 확인하지 못했습니다.</p><button type="button" onClick={current.onRetry}>시뮬레이션 다시 시도</button></div> : null}
      {mismatched ? <p role="alert">응답이 선택한 주체와 일치하지 않습니다. 다시 조회하세요.</p> : null}
      {missingIdentity ? <p role="alert">시뮬레이션 주체를 선택해야 결과를 표시할 수 있습니다.</p> : null}
      {current.state === 'ready' && !missingIdentity && !mismatched && current.data.nodes.length === 0 ? <p>표시할 유효 권한 결과가 없습니다.</p> : null}
      {current.state === 'ready' && !missingIdentity && !mismatched && current.data.nodes.length > 0 ? (
        <div className="acl-table-scroll" role="region" aria-label="시뮬레이션 결과 표" tabIndex={0}><table>
          <caption>조회 시점의 권한</caption>
          <thead>
            <tr>
              <th scope="col">워크스페이스</th>
              <th scope="col">경로</th>
              <th scope="col">레벨</th>
              <th scope="col">출처</th>
            </tr>
          </thead>
          <tbody>
            {current.data.nodes.map((node) => (
              <tr key={node.nodeId}>
                <td>{node.workspaceName}</td>
                <td>{node.path}</td>
                <td>{node.level ?? '볼 수 없음'}</td>
                <td>{node.source === null ? '—' : SOURCE[node.source]}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      ) : null}
    </section>
  );
}
