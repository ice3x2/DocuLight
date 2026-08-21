import type { MetadataStore } from '../../domain/ports/metadata-store.js';
import type { SettingStore } from '../../domain/ports/setting-store.js';

/**
 * 인스턴스 설정의 SQLite 어댑터.
 *
 * DB 에 두는 것이 `FR-AUTH-004` AC-4 다 — 파일이나 환경변수에 두면
 * 재기동 때 그 값이 어디서 오는지가 배포 환경마다 갈린다.
 */
export class SqliteSettingStore implements SettingStore {
  constructor(private readonly store: MetadataStore) {}

  get(key: string): string | undefined {
    return this.store.get<{ value: string }>('SELECT value FROM instance_setting WHERE key = ?', [
      key,
    ])?.value;
  }

  set(key: string, value: string): void {
    this.store.run(
      'INSERT INTO instance_setting (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      [key, value],
    );
  }
}
