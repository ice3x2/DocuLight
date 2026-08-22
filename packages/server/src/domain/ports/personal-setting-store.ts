import type { PrincipalId } from '../principal/principal.js';

/**
 * 개인 설정의 경계. 도메인이 소유한다 (`DR-SHELL-002`).
 *
 * **주체가 키의 일부다.** `SettingStore` 와 형태가 닮았지만 그 인터페이스를
 * 물려 쓰지 않는 이유가 이것이다 — 주체 없는 `get(key)` 를 한 자리라도
 * 남겨 두면 그 자리가 전 사용자 공용 값이 되고, 그 사실은 두 사람이 같은
 * 항목을 쓸 때만 드러난다.
 *
 * 값이 없을 때의 기본값은 **호출자가 정한다.** 저장소가 기본값을 알면
 * 그것이 두 번째 정본이 되어 도메인이 정한 기본값과 갈릴 자리가 생긴다.
 */
export interface PersonalSettingStore {
  get(principalId: PrincipalId, key: string): string | undefined;
  set(principalId: PrincipalId, key: string, value: string): void;
}
