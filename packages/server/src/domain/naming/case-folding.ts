/**
 * 이름 비교의 정규화를 **한 곳에 고정한다** (`FR-WORKSPACE-005` 구현 노트가
 * 요구하는 자리).
 *
 * 두 가지를 함께 한다.
 *
 * **① 로케일 독립 케이스 폴딩.** `toLocaleLowerCase` 를 쓰지 않는다 — 터키어
 * 로케일에서 `I` 가 `ı` 로 내려가 같은 이름이 서버 로케일에 따라 다르게
 * 판정된다. 대문자화를 먼저 거치는 이유는 그것이 `ß → SS` 같은 **다대일**
 * 폴딩을 살리기 때문이다. 소문자화만 하면 `straße` 와 `STRASSE` 가 갈린다.
 *
 * **② 유니코드 정규화(NFC).** macOS 가 만든 NFD 이름과 Windows 가 만든 NFC
 * 이름은 바이트가 다르지만 같은 이름이다. 정규화하지 않으면 한글 이름이
 * 만든 쪽에 따라 다른 이름으로 읽힌다.
 *
 * **정확히 무엇이 아닌지** — 이것은 ICU 의 Unicode default case folding
 * 자체가 아니라 런타임 기본 API 로 만든 근사다. 알려진 차이는 점 없는 `ı`
 * (U+0131)로, 기본 폴딩은 그것을 자기 자신으로 두지만 여기서는 `i` 로
 * 접힌다. 이 제품의 주 사용 언어인 한글에는 대소문자가 없어 실무 영향이
 * 작다고 보고 의존성을 늘리지 않았다.
 */
export function foldCase(name: string): string {
  return name.normalize('NFC').toUpperCase().toLowerCase();
}
