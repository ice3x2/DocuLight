import type { MetadataStore } from '../../domain/ports/metadata-store.js';
import type { PersonalSettingStore } from '../../domain/ports/personal-setting-store.js';
import type { PrincipalId } from '../../domain/principal/principal.js';

/**
 * 개인 설정의 SQLite 어댑터 (`DR-SHELL-002` AC-1 · AC-2 · AC-4).
 *
 * 표가 `instance_setting` 과 갈려 있다 — 같은 표에 두면 주체 칸이 없는
 * 기존 줄과 있는 줄이 섞이고, 그 순간 AC-2 를 지킬 방법이 사라진다.
 */
export class SqlitePersonalSettingStore implements PersonalSettingStore {
  constructor(private readonly store: MetadataStore) {}

  get(principalId: PrincipalId, key: string): string | undefined {
    return this.store.get<{ value: string }>(
      'SELECT value FROM personal_setting WHERE principal_id = ? AND key = ?',
      [principalId, key],
    )?.value;
  }

  set(principalId: PrincipalId, key: string, value: string): void {
    this.store.run(
      'INSERT INTO personal_setting (principal_id, key, value) VALUES (?, ?, ?) ON CONFLICT (principal_id, key) DO UPDATE SET value = excluded.value',
      [principalId, key, value],
    );
  }
}
