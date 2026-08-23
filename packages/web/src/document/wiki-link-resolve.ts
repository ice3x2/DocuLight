import { fetchWikiTargets } from '../api/client.js';

/**
 * 본문의 위키링크 하나를 푼다 (`SEC-WORKSPACE-006` · `FR-WORKSPACE-009`).
 *
 * **두 사유가 같은 값으로 접힌다.** 없는 문서와 권한 없는 문서 모두
 * `null` 이다 — 서버가 이미 둘을 후보 목록에서 똑같이 빼므로, 여기서
 * 상태값을 하나 더 만들면 그 값이 곧 사유를 알린다(AC-5). 편집기는
 * 상태마다 다른 class 를 붙이기 때문에 그 갈림이 그대로 화면에 나온다.
 *
 * 수동으로 타이핑한 링크를 막지 않는다 (`FR-WORKSPACE-009` AC-1) — 막을
 * 자리가 애초에 없다. 풀리지 않으면 깨진 링크로 보일 뿐이다(AC-2).
 */
export async function resolveWikiLink(
  target: string,
): Promise<{ target: string; label: string } | null> {
  // 못 받으면 **풀리지 않은 것**으로 둔다. 던지면 편집기의 해석기가 그
  // 자리에서 멈추고 그 뒤로는 어떤 링크도 풀리지 않는다.
  const rows = await fetchWikiTargets(target).catch(() => []);

  // 접두 검색이라 `설계` 질의에 `설계도` 가 걸린다 — 정확히 같은 이름만
  // 푼다. 부분 일치를 받아들이면 사용자가 적지 않은 문서로 링크가 간다.
  const found = rows.find((row) => row.target === target);
  return found === undefined ? null : { target: found.target, label: found.label };
}
