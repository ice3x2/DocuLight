import * as Popover from '@radix-ui/react-popover';
import { Command } from 'cmdk';

import type { SearchDocumentBody } from '../api/client.js';
import { AXIS_LABELS, DEFAULT_AXES, SEARCH_AXES, type SearchAxis } from './search-axes.js';

/**
 * 좌측 검색 탭 (`FR-SHELL-001` · `FR-SHELL-013` · `CON-SHELL-002`).
 *
 * **텍스트 검색이다.** AI·벡터 검색으로 전환하는 토글을 두지 않는다
 * (`CON-SHELL-002` AC-2) — 의미 검색은 MCP 표면에서만 부른다. 토글이
 * 생기는 순간 같은 입력이 두 경로로 갈리고, 사용자는 어느 쪽 결과를
 * 보고 있는지 알 수 없게 된다.
 *
 * **결과를 소유하는 표면이 여기 하나다** (`FR-SHELL-013` AC-1) — 우측
 * 태그 탭은 색인만 갖는다.
 *
 * `cmdk` 위에 서는 것은 `CON-ARCH-004` AC-4 가, 팝오버가 Radix 인 것은
 * 같은 조항 AC-2 가 지목하기 때문이다.
 */
export function SearchPanel({
  documents = [],
  query = '',
  axes = DEFAULT_AXES,
  onQuery,
  onAxes,
  onOpen,
}: {
  /** 서버가 이미 거르고 발췌까지 만든 결과. */
  documents?: readonly SearchDocumentBody[];
  /**
   * 지금 질의. **바깥이 든다.**
   *
   * 여기서 들면 태그를 눌러 채우는 경로(`FR-SHELL-010` · `FR-EDITOR-007`
   * AC-11)가 이 컴포넌트 밖에서 들어오지 못한다 — 채우는 자리가 둘이면
   * 둘 중 하나가 화면에 보이는 값이 되고, 어느 쪽인지는 렌더 순서가 정한다.
   */
  query?: string;
  /** 켜진 대상. 되살리는 일이 바깥의 것이라 값도 바깥이 든다 (AC-7). */
  axes?: readonly SearchAxis[];
  onQuery?: (query: string) => void;
  onAxes?: (axes: readonly SearchAxis[]) => void;
  onOpen?: (nodeId: string) => void;
}) {
  const on = new Set(axes);
  const toggle = (axis: SearchAxis) =>
    onAxes?.(SEARCH_AXES.filter((one) => (one === axis ? !on.has(one) : on.has(one))));

  return (
    <Command label="검색" shouldFilter={false}>
      <Command.Input
        aria-label="검색"
        value={query}
        // 거르는 일은 서버가 한다 — 여기서 다시 거르면 두 곳이 같은
        // 규칙을 갖게 되고 한쪽만 바뀐다.
        onValueChange={(next) => onQuery?.(next)}
        placeholder="문서 제목 · 본문 · 태그 · 첨부파일 이름"
      />

      {/* 검색창 오른쪽의 필터 버튼 (`FR-SHELL-013` AC-5). */}
      <Popover.Root>
        <Popover.Trigger aria-label="검색 대상">필터</Popover.Trigger>
        <Popover.Portal>
          <Popover.Content>
            {SEARCH_AXES.map((axis) => (
              <button
                key={axis}
                type="button"
                role="checkbox"
                aria-label={AXIS_LABELS[axis]}
                aria-checked={on.has(axis)}
                onClick={() => toggle(axis)}
              >
                {AXIS_LABELS[axis]}
              </button>
            ))}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {/* 목록이 **자기 안에서** 스크롤한다 (AC-12) — 화면 전체가 스크롤되면
          검색창이 위로 밀려 사라지고, 질의를 고치려면 되돌아와야 한다.

          건수를 적지 않는다 (AC-11 · `SEC-WORKSPACE-004` AC-8) — 거르기 전
          개수나 분모를 함께 보이면 그 차액이 곧 볼 수 없는 문서의 수다. */}
      <div role="region" aria-label="검색 결과" data-scroll="y">
        <Command.List>
          {documents.length === 0 ? (
            <Command.Empty>결과가 없습니다.</Command.Empty>
          ) : (
            documents.map((one) => (
              <Command.Item
                key={one.nodeId}
                value={one.nodeId}
                data-testid="search-document"
                onSelect={() => onOpen?.(one.nodeId)}
              >
                {/* 머리행은 문서마다 하나다 (AC-10). */}
                <span>{one.name}</span>
                <span>{one.workspaceName}</span>
                {one.excerpts.map((excerpt, at) => (
                  <span key={`${excerpt.axis}-${at}`} data-testid="search-excerpt">
                    {excerpt.text}
                  </span>
                ))}
              </Command.Item>
            ))
          )}
        </Command.List>
      </div>
    </Command>
  );
}
