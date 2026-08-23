import type { PrincipalRow, SimulationBody } from '../api/client.js';
import { PrincipalPicker } from '../principal/PrincipalPicker.js';

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
  workspaceId,
  simulation,
  onPick,
}: {
  /** 주체 검색의 부여 자격 근거 (`R162`). 이 화면은 관리 전용이다. */
  workspaceId: string;
  simulation?: SimulationBody;
  onPick?: (row: PrincipalRow) => void;
}) {
  return (
    <section>
      <h2>유효 권한 시뮬레이션</h2>

      <PrincipalPicker scope={`workspace:${workspaceId}`} onPick={onPick} />

      {simulation === undefined ? null : (
        <table>
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
            {simulation.nodes.map((node) => (
              <tr key={node.nodeId}>
                <td>{node.workspaceName}</td>
                <td>{node.path}</td>
                <td>{node.level ?? '볼 수 없음'}</td>
                <td>{node.source === null ? '-' : SOURCE[node.source]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
