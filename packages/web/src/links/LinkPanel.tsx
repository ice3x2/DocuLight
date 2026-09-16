/**
 * 백링크·아웃고잉 링크 패널 (`CON-EDITOR-002` AC-2 · AC-3).
 *
 * **두 패널이 같은 부품이다.** 담는 것이 「이 문서를 가리키는 것」과 「이
 * 문서가 가리키는 것」으로 다를 뿐 줄의 모양은 같다 — 따로 만들면 한쪽에만
 * 손이 가서 같은 목록이 두 탭에서 다르게 보인다.
 *
 * 목록은 서버가 이미 걸러 준 것이다. 여기서 다시 거르지 않는다.
 */
export interface LinkRowView {
  /** 풀렸으면 그 노드, 아니면 `null`. */
  nodeId: string | null;
  name: string;
  workspaceName: string | null;
  resolved: boolean;
}

export function LinkPanel({
  label,
  rows,
  empty,
  onOpen,
}: {
  label: string;
  rows: readonly LinkRowView[];
  empty?: string;
  onOpen?: (nodeId: string) => void;
}) {
  return (
    <div data-link-panel>
      <ul aria-label={label} data-link-list>
      {rows.map((row, index) => (
        <li key={`${row.nodeId ?? `미해결:${row.name}`}:${index}`} data-resolved={row.resolved} data-link-row>
          {row.resolved && row.nodeId !== null ? (
            <button type="button" onClick={() => onOpen?.(row.nodeId!)}>
              <span data-link-title>{row.name}</span>
              {row.workspaceName !== null && <span data-link-workspace>{row.workspaceName}</span>}
            </button>
          ) : (
            // 아직 그 이름의 문서가 없다. 줄을 지우지 않는 이유는 사용자가
            // 적은 링크가 사라진 것으로 읽히기 때문이다 — 누를 것이 없을 뿐
            // 적은 것은 그대로 있다.
            <span data-link-unresolved-row><span data-link-title>{row.name}</span><span data-link-unresolved>미해결</span></span>
          )}
        </li>
      ))}
      </ul>
      {rows.length === 0 && empty !== undefined && <EmptyState title={empty} />}
    </div>
  );
}
import { EmptyState } from '../components/ui/states.js';
