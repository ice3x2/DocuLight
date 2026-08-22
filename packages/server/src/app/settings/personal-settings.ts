import type { PersonalSettingStore } from '../../domain/ports/personal-setting-store.js';
import type { PrincipalId } from '../../domain/principal/principal.js';

/**
 * 사용자마다 따로 갖는 설정 셋 (`IR-SHELL-004` · `DR-SHELL-002`).
 *
 * **셋이 전량이다.** 넷째를 여기 더하기 전에 `IR-SHELL-004` 와 원장 `R152`
 * 를 먼저 고쳐라 — 구현이 목록을 늘리면 요구가 정한 「전량」이 무엇을 세는
 * 말인지 흐려진다. 자동 저장 지연은 `R75` 가 제품 상수로 정했고, 글꼴과
 * 글자 크기는 근거 조항이 없다.
 *
 * 허용값을 여기 함께 두는 이유는 기본값만 두면 **아무 문자열이나** 저장돼
 * 화면이 모르는 값을 그리게 되기 때문이다. 잘못된 값은 저장 시점에 막힌다.
 */
const SETTINGS = {
  /** 문서를 열었을 때의 모드 (`R2`). 기본이 `보기` 인 것은 대가의 비대칭 때문이다 — 틀렸을 때 한쪽은 클릭 한 번이고 다른 쪽은 무버튼 자동 저장이 켜진 화면이다. */
  'default-view-mode': { fallback: 'view', allowed: ['view', 'edit'] },
  /** 편집 모드 안의 하위 뷰 (`R90`). */
  'default-edit-subview': { fallback: 'live-preview', allowed: ['live-preview', 'source'] },
  /** 외모 (`R24-a` 의 카테고리 이름이 괄호로 범위를 지정했다). */
  theme: { fallback: 'system', allowed: ['light', 'dark', 'system'] },
} as const;

export type PersonalSettingKey = keyof typeof SETTINGS;

export const PERSONAL_SETTING_KEYS = Object.keys(SETTINGS) as readonly PersonalSettingKey[];

/** 저장된 값. 쓴 적이 없으면 그 설정의 기본값 (`DR-SHELL-002` AC-3). */
export function readPersonalSetting(
  store: PersonalSettingStore,
  principalId: PrincipalId,
  key: PersonalSettingKey,
): string {
  return store.get(principalId, key) ?? SETTINGS[key].fallback;
}

export type PersonalSettingsRule = 'unknown-key' | 'unknown-value';
export type PersonalSettingsOutcome = { ok: true } | { ok: false; rule: PersonalSettingsRule };

const known = (key: string): key is PersonalSettingKey => key in SETTINGS;

/**
 * 이 사용자의 설정을 쓴다 (`DR-SHELL-002` AC-1 · AC-6).
 *
 * 예외가 아니라 값으로 답한다 — 모르는 키나 값은 예외 상황이 아니라
 * **예상되는 입력**(오래된 화면·손으로 부른 API)이고, 그 갈래를 부르는
 * 쪽이 화면 문구로 옮긴다.
 *
 * **하나라도 거절되면 아무것도 쓰지 않는다.** 앞의 것만 반영하고 실패를
 * 알리면 사용자는 절반이 저장된 화면을 보게 되고, 어느 절반인지 알 수 없다.
 */
export function writePersonalSettings(
  store: PersonalSettingStore,
  principalId: PrincipalId,
  patch: Readonly<Record<string, string>>,
): PersonalSettingsOutcome {
  for (const [key, value] of Object.entries(patch)) {
    if (!known(key)) return { ok: false, rule: 'unknown-key' };
    if (!(SETTINGS[key].allowed as readonly string[]).includes(value)) {
      return { ok: false, rule: 'unknown-value' };
    }
  }

  for (const [key, value] of Object.entries(patch)) store.set(principalId, key, value);
  return { ok: true };
}
