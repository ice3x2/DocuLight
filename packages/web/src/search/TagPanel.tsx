import type { TagIndexBody } from '../api/client.js';

/**
 * 우측 `태그` 탭 (`FR-SHELL-009` · `FR-SHELL-010` · `FR-SHELL-011`).
 *
 * **색인만 소유한다** — 어떤 태그가 얼마나 있는가까지다. 그 태그가 달린
 * 문서가 무엇인가는 좌측 검색 탭의 것이고(`FR-SHELL-010` AC-3), 여기서도
 * 결과를 그리면 같은 물음에 답하는 자리가 둘이 되어 같은 필터를 두 번 쓴다.
 *
 * **다시 정렬하지 않는다** (`FR-SHELL-011` AC-5). 비교 함수는 서버의 공용
 * 한 자리에 있고, 화면이 또 정렬하면 그 비교식이 두 벌이 된다.
 */
export function TagPanel({
  index,
  workspaces = [],
  scope = '',
  onScope,
  onPick,
}: {
  /** 서버가 준 색인. 아직 안 왔으면 `undefined`. */
  index?: TagIndexBody;
  /** 범위 선택기의 선택지 (`FR-SHELL-009` AC-2). */
  workspaces?: readonly { id: string; name: string }[];
  /** 지금 범위. 빈 문자열이 「전체」다. */
  scope?: string;
  onScope?: (workspaceId: string) => void;
  onPick?: (tag: string) => void;
}) {
  if (index === undefined) return null;

  return (
    <section aria-label="태그">
      {workspaces.length === 0 ? null : (
        <>
          <label htmlFor="tag-scope">범위</label>
          <select id="tag-scope" value={scope} onChange={(event) => onScope?.(event.target.value)}>
            <option value="">전체</option>
            {workspaces.map((one) => (
              <option key={one.id} value={one.id}>
                {one.name}
              </option>
            ))}
          </select>
        </>
      )}

      {/* 기준 문구는 **서버가 준 값 그대로**이고 조건 없이 상시 선다
          (`FR-SHELL-009` AC-6) — 화면이 문구를 지으면 숨은 항목의 유무에
          따라 갈릴 자리가 생기고, 그 갈림이 곧 존재 신호가 된다. */}
      <p data-testid="tag-basis">{index.basis}</p>

      <ul>
        {index.tags.map((one) => (
          <li key={one.name} data-testid="tag-row">
            {/* 누르면 좌측 검색 탭이 그 태그를 질의로 든다
                (`FR-SHELL-010` AC-1 · AC-2). */}
            <button type="button" onClick={() => onPick?.(one.name)}>
              {one.name} {one.documents}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
