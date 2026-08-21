import BetterSqlite3 from 'better-sqlite3';

import type { MetadataStore } from '../../domain/ports/metadata-store.js';
import { runMigrations } from './migration-runner.js';

/** 저장소 포트에 닫는 동작을 더한 것. 소유자만 닫는다. */
export interface Database extends MetadataStore {
  close(): void;
}

/**
 * 단일 메타데이터 DB 를 연다 (`DR-STORAGE-002`). 여는 즉시 마이그레이션을
 * 적용하므로 호출자가 스키마 상태를 따로 챙기지 않는다.
 *
 * 켜는 것 둘 —
 * - **WAL**: 읽기가 쓰기를 막지 않는다. 매 요청 유효 권한을 계산하는
 *   `CON-ACL-001` 아래에서 읽기가 압도적으로 많다.
 * - **외래키 강제**: SQLite 는 기본이 꺼짐이다. 켜지 않으면 그룹 삭제가
 *   그 그룹 앞으로 부여된 ACL 항목을 남긴 채 성공한다(`FR-PRINCIPAL-002` 위반).
 */
export function openDatabase(file: string): Database {
  const handle = new BetterSqlite3(file);
  handle.pragma('journal_mode = WAL');
  handle.pragma('foreign_keys = ON');

  const store: Database = {
    run(sql, params = []) {
      // 여러 문장을 담은 마이그레이션은 prepare 가 받지 못하므로 exec 로 보낸다.
      if (params.length === 0 && /;\s*\S/.test(sql.trim().replace(/;\s*$/, ''))) {
        handle.exec(sql);
        return;
      }
      handle.prepare(sql).run(...params);
    },

    all(sql, params = []) {
      return handle.prepare(sql).all(...params) as never;
    },

    get(sql, params = []) {
      return handle.prepare(sql).get(...params) as never;
    },

    transaction(fn) {
      // better-sqlite3 의 transaction 은 던진 예외를 다시 던지며 롤백한다.
      return handle.transaction(fn)();
    },

    close() {
      handle.close();
    },
  };

  runMigrations(store);
  return store;
}
