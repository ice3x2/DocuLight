/**
 * 인스턴스 설정의 경계. 도메인이 소유한다.
 *
 * 키-값인 이유는 이 wave 가 실제로 저장해야 하는 설정이 하나(가입 모드)
 * 뿐이기 때문이다 — 칸을 미리 늘리면 쓰이지 않는 칸의 기본값이 규범처럼
 * 읽힌다.
 *
 * 값이 없을 때의 기본값은 **호출자가 정한다.** 저장소가 기본값을 알면
 * 그것이 두 번째 정본이 되어, 도메인이 정한 기본값과 갈릴 자리가 생긴다.
 */
export interface SettingStore {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
}
