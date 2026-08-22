import type { SettingStore } from '../../domain/ports/setting-store.js';
import { covers } from '../../domain/retention/retention.js';

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

/**
 * 보존 일수로 읽은 값. 숫자가 아니거나 음수면 그 설정의 기본값.
 *
 * 오타가 조용히 `0`(무제한)이나 `NaN` 으로 읽히면 그 인스턴스의 보존 정책이
 * 아무도 의도하지 않은 값으로 도는데, 두 축 다 되돌릴 수 없는 소멸을 낸다.
 */
export function retentionDaysOf(store: SettingStore, key: RetentionKey): number {
  const stored = Number(readSetting(store, key));
  return Number.isFinite(stored) && stored >= 0 ? stored : Number(DEFAULTS[key]);
}

/** 기간이 서로를 덮어야 하는 두 설정 (`R154`). */
type RetentionKey = 'trash-retention-days' | 'audit-retention-days';

export type SettingsRule = 'unknown-key' | 'retention-inverted';
export type SettingsOutcome = { ok: true } | { ok: false; rule: SettingsRule };

/**
 * DB 에 쓴다 — 런타임 설정의 저장소는 이것 하나다 (`DR-SHELL-001` AC-1).
 *
 * **여러 키를 한 번에 받는 이유는 판정이 조합에 걸리기 때문이다** (`R154`) —
 * 한 키씩만 받으면 「감사를 올리고 휴지통을 올린다」를 그 순서로만 할 수
 * 있게 되고, 관리자가 그 순서를 스스로 알아내야 한다.
 *
 * 예외가 아니라 값으로 답한다 — 어긋난 조합은 예외 상황이 아니라 **예상되는
 * 입력**이고, 그 갈래를 부르는 쪽이 화면 문구로 옮긴다.
 */
export function writeSettings(
  store: SettingStore,
  patch: Readonly<Record<string, string>>,
): SettingsOutcome {
  for (const key of Object.keys(patch)) {
    if (!(key in DEFAULTS)) return { ok: false, rule: 'unknown-key' };
  }

  const after = (key: RetentionKey): number => {
    const proposed = patch[key];
    if (proposed === undefined) return retentionDaysOf(store, key);
    const parsed = Number(proposed);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number(DEFAULTS[key]);
  };

  // 감사 기록이 휴지통 항목보다 먼저 사라지면, 지워진 문서는 아직 복구할 수
  // 있는데 누가 지웠는지는 이미 모르는 상태가 된다. 화면이 아니라 여기서
  // 막는 이유는 화면에만 두면 API 로 그대로 뚫리기 때문이다.
  if (!covers(after('audit-retention-days'), after('trash-retention-days'))) {
    return { ok: false, rule: 'retention-inverted' };
  }

  for (const [key, value] of Object.entries(patch)) store.set(key, value);
  return { ok: true };
}

/**
 * 한 칸만 쓴다. 규칙은 `writeSettings` 와 **같은 것 하나**를 쓴다 — 검사를
 * 건너뛰는 두 번째 쓰기 경로를 두면 그것이 곧 우회로가 된다.
 */
export function writeSetting(store: SettingStore, key: InstanceSettingKey, value: string): void {
  const saved = writeSettings(store, { [key]: value });
  if (!saved.ok) throw new Error(`rejected instance setting ${key}: ${saved.rule}`);
}
