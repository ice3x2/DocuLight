/**
 * 검색 대상 넷 (`FR-SHELL-013` AC-5~AC-8).
 *
 * **목록과 기본값이 여기 한 자리다.** 화면과 저장 복원이 각자 적으면
 * 사용자가 끈 축이 다음 방문에 조용히 켜진다.
 */

export const SEARCH_AXES = ['name', 'body', 'tag', 'attachment'] as const;

export type SearchAxis = (typeof SEARCH_AXES)[number];

/** 체크박스에 붙는 이름. 서버가 쓰는 값과 사람이 읽는 말을 여기서 잇는다. */
export const AXIS_LABELS: Readonly<Record<SearchAxis, string>> = {
  name: '이름',
  body: '본문',
  tag: '태그',
  attachment: '첨부 이름',
};

/**
 * 처음 열었을 때 켜져 있는 축 (AC-6).
 *
 * 이름 하나다 — 넷을 다 켜 두면 첫 질의가 인스턴스 전체를 읽고, 사용자는
 * 자기가 무엇을 켰는지 모른 채 그 비용을 낸다.
 */
export const DEFAULT_AXES: readonly SearchAxis[] = ['name'];

/**
 * 저장된 값에서 조합을 되살린다 (AC-7).
 *
 * **깨졌으면 기본값으로 돌아간다.** 부분적으로 살려 내면 사용자가 고른
 * 적 없는 조합이 서고, 그것은 저장된 값보다 나쁘다 — 어디서 온 조합인지
 * 아무도 설명할 수 없다.
 */
export function axesFrom(stored: string | null): SearchAxis[] {
  const parts = (stored ?? '').split(',').filter((one) => one !== '');
  const known = parts.every((one): one is SearchAxis =>
    (SEARCH_AXES as readonly string[]).includes(one),
  );
  return parts.length === 0 || !known ? [...DEFAULT_AXES] : parts;
}

/** 저장할 문자열. 되살리는 쪽과 짝이라 같은 파일에 둔다. */
export const axesTo = (axes: readonly SearchAxis[]): string => axes.join(',');

/**
 * 마지막 조합이 사는 자리 (`FR-SHELL-013` AC-7).
 *
 * 브라우저 로컬이다 — 이 값은 **검색창의 상태**이지 사용자 설정이 아니고
 * (`IR-SHELL-004` 의 셋에 들지 않는다), 기기마다 달라도 무방하다. 읽고
 * 쓰는 자리를 함수 뒤로 미는 이유는 저장소가 없는 환경(시험·서버 렌더)이
 * 있기 때문이다.
 */
const KEY = 'doculight.search-axes';

export function readAxes(): string | null {
  try {
    return globalThis.localStorage?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
}

export function writeAxes(value: string): void {
  try {
    globalThis.localStorage?.setItem(KEY, value);
  } catch {
    // 저장이 막힌 환경에서도 검색 자체는 돌아야 한다 — 다음 방문에
    // 기본값으로 시작할 뿐이다.
  }
}
