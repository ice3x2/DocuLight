import { Command } from 'cmdk';
import { useEffect, useState } from 'react';

import { fetchPrincipals, type PrincipalRow } from '../api/client.js';

/**
 * 사용자·그룹 검색 (`CON-ARCH-004` AC-4).
 *
 * `cmdk` 위에 서는 것이 조항이 지목한 부품이며, 그 근거의 절반은 Phase 2
 * 커맨드 팔레트 재사용이다 — 지금 다른 것을 고르면 그때 두 벌이 된다.
 *
 * **사용자 관리와 그룹 관리가 같은 부품을 쓴다.** 권한은 주체에 붙지
 * 종류에 붙지 않으므로 둘을 가를 이유가 없고, 두 벌로 만들면 한쪽만
 * 고쳐진다.
 *
 * 거르는 일은 서버가 한다 — 여기서 다시 거르면 두 곳이 같은 규칙을 갖게
 * 되고 한쪽만 바뀐다.
 */
export function PrincipalSearch({ onPick }: { onPick?: (row: PrincipalRow) => void }) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<readonly PrincipalRow[]>([]);

  useEffect(() => {
    let live = true;
    void fetchPrincipals(query)
      .then((found) => {
        // 늦게 온 응답이 새 질의의 결과를 덮지 않게 한다 — 덮이면 사용자가
        // 방금 친 글자와 무관한 목록이 남는다.
        if (live) setRows(found);
      })
      .catch(() => {
        if (live) setRows([]);
      });
    return () => {
      live = false;
    };
  }, [query]);

  return (
    <Command label="사용자·그룹 검색" shouldFilter={false}>
      <Command.Input
        aria-label="사용자·그룹 검색"
        value={query}
        onValueChange={setQuery}
        placeholder="사용자 또는 그룹 이름"
      />

      <Command.List>
        {rows.length === 0 ? (
          <Command.Empty>결과가 없습니다.</Command.Empty>
        ) : (
          rows.map((row) => (
            <Command.Item key={row.id} value={row.id} onSelect={() => onPick?.(row)}>
              <span>{row.name}</span>
              {/* 종류를 함께 보인다 — 같은 이름의 사용자와 그룹이 있을 때
                  이름만으로는 무엇에 권한을 주는지 알 수 없다. */}
              <span>{row.kind === 'user' ? '사용자' : '그룹'}</span>
            </Command.Item>
          ))
        )}
      </Command.List>
    </Command>
  );
}
