import { Command } from 'cmdk';
import { useState } from 'react';

/**
 * 좌측 검색 탭 (`FR-SHELL-001` · `CON-SHELL-002`).
 *
 * **텍스트 검색이다.** AI·벡터 검색으로 전환하는 토글을 두지 않는다
 * (`CON-SHELL-002` AC-2) — 의미 검색은 MCP 표면에서만 부른다. 토글이
 * 생기는 순간 같은 입력이 두 경로로 갈리고, 사용자는 어느 쪽 결과를
 * 보고 있는지 알 수 없게 된다.
 *
 * `cmdk` 위에 서는 것은 `CON-ARCH-004` AC-4 가 그것을 지목하기 때문이며,
 * 부수로 키보드 이동과 `combobox` 배선이 함께 온다.
 */
export interface SearchHit {
  nodeId: string;
  name: string;
  workspaceName: string;
  /** 찾은 자리의 앞뒤 — 왜 걸렸는지가 보이지 않으면 목록이 무의미하다. */
  excerpt: string;
}

export function SearchPanel({
  hits = [],
  onQuery,
  onOpen,
}: {
  hits?: readonly SearchHit[];
  onQuery?: (query: string) => void;
  onOpen?: (nodeId: string) => void;
}) {
  const [query, setQuery] = useState('');

  return (
    <Command label="검색" shouldFilter={false}>
      <Command.Input
        aria-label="검색"
        value={query}
        onValueChange={(next) => {
          setQuery(next);
          // 거르는 일은 서버가 한다 — 여기서 다시 거르면 두 곳이 같은
          // 규칙을 갖게 되고 한쪽만 바뀐다.
          onQuery?.(next);
        }}
        placeholder="문서 제목 · 본문 · 태그 · 첨부파일 이름"
      />

      <Command.List>
        {hits.length === 0 ? (
          <Command.Empty>결과가 없습니다.</Command.Empty>
        ) : (
          hits.map((hit) => (
            <Command.Item key={hit.nodeId} value={hit.nodeId} onSelect={() => onOpen?.(hit.nodeId)}>
              <span>{hit.name}</span>
              <span>{hit.workspaceName}</span>
              <span>{hit.excerpt}</span>
            </Command.Item>
          ))
        )}
      </Command.List>
    </Command>
  );
}
