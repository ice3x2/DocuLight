import type { SettingStore } from '../../domain/ports/setting-store.js';

/**
 * 런타임에 바꿀 수 있는 설정들 (`DR-SHELL-001` · `IR-SHELL-002` AC-7).
 *
 * **키 목록과 기본값이 한 곳에 있다.** 서비스마다 자기 키 상수를 들고 있으면
 * 설정 모달이 그 목록을 다시 손으로 적게 되고, 두 목록은 곧 갈린다 — 갈린
 * 뒤에는 「저장했는데 안 바뀐다」로 나타난다.
 *
 * 값이 문자열인 것은 저장소가 문자열만 담기 때문이다. 해석은 그 설정을
 * 쓰는 쪽이 한다 — 여기서 숫자로 바꿔 주면 잘못된 값의 처리 방식이 설정마다
 * 달라야 하는데 그 판단이 이 모듈에 없다.
 */
const DEFAULTS = {
  // 설정 실수가 곧 공개 인스턴스가 되지 않도록 `open` 이 아니고, 설치 직후
  // 아무도 신청할 수 없어 관리자가 모른 채 기다리지 않도록 `invite-only` 도
  // 아니다 — 신청은 받되 사람이 한 번 본다.
  'signup-mode': 'approval',
  'upload-size-limit-bytes': '104857600',
  'retained-version-count': '20',
  'trash-retention-days': '30',
  'audit-retention-days': '365',
} as const;

export type InstanceSettingKey = keyof typeof DEFAULTS;

export const INSTANCE_SETTING_KEYS = Object.keys(DEFAULTS) as readonly InstanceSettingKey[];

function assertKnown(key: InstanceSettingKey): void {
  // 자유 문자열을 받으면 오타 하나가 새 설정을 만들고, 그 설정은 아무도
  // 읽지 않으므로 저장은 성공하는데 동작이 안 바뀐다.
  if (!(key in DEFAULTS)) throw new Error(`unknown instance setting: ${key}`);
}

/** 저장된 값. 쓴 적이 없으면 그 설정의 기본값. */
export function readSetting(store: SettingStore, key: InstanceSettingKey): string {
  assertKnown(key);
  return store.get(key) ?? DEFAULTS[key];
}

/** DB 에 쓴다 — 런타임 설정의 저장소는 이것 하나다 (`DR-SHELL-001` AC-1). */
export function writeSetting(store: SettingStore, key: InstanceSettingKey, value: string): void {
  assertKnown(key);
  store.set(key, value);
}
