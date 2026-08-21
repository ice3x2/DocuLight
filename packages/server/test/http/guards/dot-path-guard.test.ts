import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listChildren } from '../../../src/app/node/list-children.js';
import {
  DOT_PATH_EXEMPTIONS,
  EXEMPT_ENDPOINTS,
  guardDotPath,
} from '../../../src/http/guards/dot-path-guard.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteNodeRepository } from '../../../src/infra/sqlite/node-repository.js';

const WORKSPACE = 'ws-0000';

let dir: string;
let db: Database;
let nodes: SqliteNodeRepository;
let root: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-dotguard-'));
  db = openDatabase(join(dir, 'doculight.db'));
  nodes = new SqliteNodeRepository(db);
  root = nodes.create({ workspaceId: WORKSPACE, parentId: null, kind: 'directory', name: '기획' });
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('SEC-STORAGE-004 — 점 경로는 숨기고 직접 접근을 거부한다', () => {
  it('SEC-STORAGE-004 AC-1 — 이름이 점으로 시작하는 파일·디렉토리는 트리 목록에 나타나지 않는다.', () => {
    // 점 노드는 응용 계층으로는 만들 수 없다(`SEC-STORAGE-005`). 실제로
    // 생기는 경로는 옵시디언 볼트를 그대로 넣었을 때의 재조정 등재다 —
    // 그래서 저장소로 직접 넣어 그 상태를 재현한다.
    nodes.create({ workspaceId: WORKSPACE, parentId: root, kind: 'directory', name: '.obsidian' });
    nodes.create({ workspaceId: WORKSPACE, parentId: root, kind: 'file', name: '.workspace.json' });
    nodes.create({ workspaceId: WORKSPACE, parentId: root, kind: 'file', name: '회의록.md' });
    nodes.create({ workspaceId: WORKSPACE, parentId: root, kind: 'directory', name: '2026' });

    const listed = listChildren(nodes, { workspaceId: WORKSPACE, parentId: root });

    expect(listed.map((n) => n.name).sort()).toEqual(['2026', '회의록.md']);
    // md 아닌 파일도 트리에 보이는 것이 원칙이고(`R47`), 여기서 빠지는
    // 것은 오직 점으로 시작하는 항목이다.
    expect(listed.some((n) => n.name.startsWith('.'))).toBe(false);
  });

  it('SEC-STORAGE-004 AC-2 — 점으로 시작하는 경로를 일반 파일 읽기·쓰기 API 로 직접 요청하면 거부된다.', () => {
    // 표시 계층에서만 숨기면 원문 raw 읽기로 그대로 뚫린다.
    for (const path of ['.workspace.json', '.trash', '.obsidian/app.json']) {
      expect(guardDotPath(path).allowed, `${path} 이 통과했다`).toBe(false);
    }

    // 읽기와 쓰기가 같은 판정을 쓴다 — 판정이 둘이면 한쪽만 고쳐진다.
    for (const path of ['기획/회의록.md', '2026/보고서.md', 'a.md']) {
      expect(guardDotPath(path).allowed, `${path} 이 거부됐다`).toBe(true);
    }
  });

  it('SEC-STORAGE-004 AC-5 — 위 두 예외 밖의 어떤 경로로도 점으로 시작하는 항목의 원문을 읽을 수 없다.', () => {
    // 허용 목록이어야 새 엔드포인트가 생겨도 기본이 거부로 남는다.
    // 차단 목록이면 fail-open 이 된다.
    expect(EXEMPT_ENDPOINTS).toEqual([]);

    // 예외 이름을 안다고 통과하지 않는다 — 등록되지 않았기 때문이다.
    for (const exemption of DOT_PATH_EXEMPTIONS) {
      expect(guardDotPath('.workspace.json', exemption).allowed, `${exemption} 로 뚫렸다`).toBe(
        false,
      );
    }
  });

  it('SEC-STORAGE-004 AC-6 — 경로 중간의 세그먼트가 점으로 시작해도 같은 거부가 적용된다.', () => {
    const middles = [
      '기획/.obsidian/app.json',
      '기획/2026/.trash/회의록.md',
      '기획/.versions/회의록.md/1.md',
      '../기획/회의록.md',
      '기획/../.trash/x.md',
    ];
    for (const path of middles) {
      expect(guardDotPath(path).allowed, `${path} 이 통과했다`).toBe(false);
    }

    // 역슬래시도 구분자로 본다. Windows 에서 구분자이므로 슬래시만 보면
    // `기획\.trash\x.md` 가 세그먼트 하나로 읽혀 그대로 통과한다.
    expect(guardDotPath('기획\\.trash\\x.md').allowed).toBe(false);

    // 세그먼트 **안쪽**의 점은 정상이다. 여기까지 막으면 확장자가 있는
    // 모든 이름이 거부된다.
    expect(guardDotPath('기획/회의록.md').allowed).toBe(true);
    expect(guardDotPath('기획/v1.2/노트.md').allowed).toBe(true);
  });
});
