import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { MetadataStore } from '../../domain/ports/metadata-store.js';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

/**
 * `NNN_name.sql` 을 번호 순서로 적용한다. 이미 적용된 것은 건너뛴다.
 *
 * 파일명 앞의 숫자가 순서를 정한다 — 디렉토리 나열 순서에 기대면 OS 마다
 * 다른 순서로 적용되어 같은 코드가 다른 스키마를 만든다.
 */
export function runMigrations(store: MetadataStore): string[] {
  store.run(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      name        TEXT PRIMARY KEY,
      applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    store.all<{ name: string }>('SELECT name FROM schema_migration').map((r) => r.name),
  );

  const pending = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .filter((name) => !applied.has(name));

  for (const name of pending) {
    const sql = readFileSync(join(MIGRATIONS_DIR, name), 'utf8');
    // 마이그레이션 하나는 전부 적용되거나 전혀 적용되지 않는다 — 절반만
    // 적용된 스키마는 다음 기동에서 "이미 적용됨"으로 읽혀 영원히 어긋난다.
    store.transaction(() => {
      store.run(sql);
      store.run('INSERT INTO schema_migration (name) VALUES (?)', [name]);
    });
  }

  return pending;
}
