import { Command } from 'cmdk';
import { useEffect, useState } from 'react';

import { fetchPrincipals, type PrincipalRow, type PrincipalStatus } from '../api/client.js';

/**
 * 주체를 고르는 **하나뿐인 부품** (`CON-PRINCIPAL-006`).
 *
 * `cmdk` 위에 서는 것이 조항이 지목한 부품이며(`CON-ARCH-004` AC-4), 그
 * 근거의 절반은 Phase 2 커맨드 팔레트 재사용이다 — 지금 다른 것을 고르면
 * 그때 두 벌이 된다.
 *
 * **사용자와 그룹이 같은 부품을 쓴다.** 권한은 주체에 붙지 종류에 붙지
 * 않으므로 둘을 가를 이유가 없고, 두 벌로 만들면 한쪽만 고쳐진다.
 *
 * 새 화면이 주체 선택을 필요로 하면 검색 규칙을 다시 정하지 말고 이것을
 * 배치하라 (AC-4) — 규칙이 화면마다 갈리는 순간, 열거 상한이 막으려는
 * 표면이 다른 화면에 그대로 남는다.
 */

/**
 * 최소 질의 길이 (`SEC-PRINCIPAL-003` AC-1).
 *
 * 좌측 검색 탭(`FR-SHELL-014`)에도 같은 값이 있으나 **다른 조항**이다.
 * 값이 같다는 이유로 한 상수로 묶지 마라.
 */
const MINIMUM_QUERY = 2;

/**
 * 결과 상한 (`SEC-PRINCIPAL-003` AC-3).
 *
 * 서버도 같은 값으로 자른다. **한 규칙을 두 곳이 나눠 갖는 것이 아니라**
 * 신뢰 경계 양쪽이 각각 막는 것이다 — 서버 쪽이 정본이고(엔드포인트는
 * 화면 없이도 부를 수 있다), 이쪽은 그리는 줄 수를 막는다. 「더 보기」로
 * 스물한 번째를 이어 받는 경로를 만들면 상한이 없는 것과 같아진다.
 */
const RESULT_LIMIT = 20;

/**
 * 상태 배지 문구 (`SEC-PRINCIPAL-002` AC-4 · AC-5).
 *
 * `suspended` 를 중립어 `비활성` 으로 쓰는 이유는, 부여하는 제3자에게 그
 * 계정의 징계나 오프보딩을 함의하는 표현을 노출하지 않기 위해서다.
 *
 * **이 부품을 슈퍼유저 전용 사용자 관리 화면에 두지 마라.** 원장 `R112-d`
 * 로 그 화면은 계정 4상태(`활성`·`대기`·`정지`·`거절`)를 그대로 표시해야
 * 하는데, 여기 두면 `rejected` 가 목록에서 사라지고 `suspended` 가
 * `비활성` 으로 읽혀 그 화면이 운영해야 할 게이트가 보이지 않게 된다.
 * 그 화면은 `FR-PRINCIPAL-009` 가 소유한다.
 *
 * `활성`·`대기` 는 `R60` 이 그 상태에 붙인 낱말을 그대로 쓴다 — 조항이
 * 고정한 것은 `suspended` 뿐이지만, 나머지를 새로 지으면 같은 상태가 화면
 * 마다 다른 이름으로 불린다.
 */
const BADGE: Record<PrincipalStatus, string> = {
  active: '활성',
  pending: '대기',
  suspended: '비활성',
};

export function PrincipalPicker({ onPick }: { onPick?: (row: PrincipalRow) => void }) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<readonly PrincipalRow[]>([]);

  useEffect(() => {
    // 짧은 질의는 **묻지도 않는다**. 서버가 거절하더라도 한 글자씩 묻는
    // 것 자체가 열거 시도를 반복할 수 있게 만든다.
    if (query.trim().length < MINIMUM_QUERY) {
      setRows([]);
      return;
    }

    let live = true;
    void fetchPrincipals(query)
      .then((found) => {
        // 늦게 온 응답이 새 질의의 결과를 덮지 않게 한다 — 덮이면 사용자가
        // 방금 친 글자와 무관한 목록이 남는다.
        if (live) setRows(found.slice(0, RESULT_LIMIT));
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
              <span data-testid="principal-status">{BADGE[row.status]}</span>
            </Command.Item>
          ))
        )}
      </Command.List>
    </Command>
  );
}
