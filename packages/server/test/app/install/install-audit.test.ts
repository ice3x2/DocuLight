import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  beginInstallSession,
  commitInstall,
  forgetInstallTokenForTest,
  mintInstallToken,
  type DefaultGroupLevel,
  type InstallStores,
} from '../../../src/app/install/install-service.js';
import { ACL_GRANT } from '../../../src/app/acl/grant-service.js';
import { WORKSPACE_CREATE } from '../../../src/app/workspace/create-workspace.js';
import { MEMBER_ADD } from '../../../src/app/principal/principal-service.js';
import { SUPERUSER_GROUP_ID, DEFAULT_GROUP_ID } from '../../../src/domain/principal/system-groups.js';
import { BcryptPasswordHasher } from '../../../src/infra/crypto/bcrypt-hasher.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { nodeStores } from '../../support/acl-fixture.js';

/**
 * 설치 마법사의 초기 권한 부여가 워크스페이스 생성과 **같게** 기록되는가
 * (`OBS-AUDIT-005` AC-10).
 *
 * 「그 화면이 아직 서지 않았다」는 이유로 재지 않고 넘어갈 수 없다 —
 * 마법사를 실행하는 함수는 이미 서 있고, 라우트가 서는 순간 무기록이
 * 제품에 그대로 나간다.
 */

let dir: string;
let docsRoot: string;
let db: Database;
let stores: InstallStores;

const 행 = (operation: string) =>
  db
    .all<{ operation: string; actor: string; subject_id: string | null; level: string | null }>(
      'SELECT operation, actor, subject_id, level FROM audit_log WHERE operation = ?',
      [operation],
    );

const 설치 = (defaultGroupLevel: DefaultGroupLevel = 'edit') => {
  const token = mintInstallToken(stores);
  const begun = beginInstallSession(stores, token);
  return commitInstall(stores, begun.ok ? begun.installSession : '', {
    superuserName: '설치자',
    password: '올바른-말-네-개',
    workspaceName: '기획팀',
    defaultGroupLevel,
    signupMode: 'approval',
  });
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-install-audit-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  forgetInstallTokenForTest();
  stores = {
    ...nodeStores(db),
    passwords: new BcryptPasswordHasher(),
    files: new FsWorkspaceFiles(docsRoot),
    clock: () => new Date('2026-08-23T09:00:00.000Z'),
    announce: () => undefined,
  };
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
  forgetInstallTokenForTest();
});

describe('OBS-AUDIT-005 — 설치 마법사의 초기 부여가 기록된다', () => {
  it('AC-10: 관리자 지정과 default 초기 권한이 각각 부여 행을 남긴다', async () => {
    expect((await 설치()).ok).toBe(true);

    const 부여 = 행(ACL_GRANT);
    expect(부여.map((row) => row.subject_id).sort()).toEqual(
      [DEFAULT_GROUP_ID, ...부여.map((row) => row.subject_id).filter((id) => id !== DEFAULT_GROUP_ID)].sort(),
    );
    // 두 부여가 **각각** 남는다 — 묶으면 어느 주체가 무엇을 받았는지
    // 담을 자리가 없다.
    expect(부여).toHaveLength(2);
    expect(부여.find((row) => row.subject_id === DEFAULT_GROUP_ID)?.level).toBe('edit');
    expect(부여.find((row) => row.subject_id !== DEFAULT_GROUP_ID)?.level).toBe('admin');
  });

  it('AC-10: default 초기 권한이 `없음` 이면 그 부여 행도 없다', async () => {
    expect((await 설치('none')).ok).toBe(true);

    // 항목을 만들지 않았으므로 부여도 없다 — 있으면 「부여됐으나 아무것도
    // 못 한다」는 네 번째 레벨이 감사에 생긴다.
    expect(행(ACL_GRANT).filter((row) => row.subject_id === DEFAULT_GROUP_ID)).toEqual([]);
  });

  it('AC-8: 설치가 만든 워크스페이스도 생성 행을 남긴다', async () => {
    await 설치();

    expect(행(WORKSPACE_CREATE)).toHaveLength(1);
  });

  it('`OBS-AUDIT-003` AC-2: 최초 슈퍼유저의 그룹 편입이 기록된다', async () => {
    await 설치();

    const [편입] = 행(MEMBER_ADD);
    // 이 한 줄이 없으면 「누가 슈퍼유저가 됐나」의 최초 사건만 이력에서
    // 빠지고, 그 뒤의 편입은 전부 남는다.
    expect(편입?.subject_id).toBe(stores.principals.membersOf(SUPERUSER_GROUP_ID)[0]);
  });
});
