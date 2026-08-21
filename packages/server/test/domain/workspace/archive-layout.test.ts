import { describe, expect, it } from 'vitest';

import {
  ARCHIVE_DIRECTORY,
  archiveRootOf,
  archivePathOf,
} from '../../../src/domain/workspace/archive.js';

describe('DR-STORAGE-006 — 아카이브 디렉토리의 자리', () => {
  it('AC-3: docsRoot 아래 한 곳이며 워크스페이스마다 만들지 않는다', () => {
    // 워크스페이스마다 두면 아카이브한 워크스페이스가 자기 자신 안에
    // 들어가야 하고, 그 자리는 워크스페이스를 지우면 함께 사라진다.
    expect(archiveRootOf('/srv/docs')).toBe(`/srv/docs/${ARCHIVE_DIRECTORY}`);
    expect(archiveRootOf('/srv/docs')).not.toContain('ws-');
  });

  it('AC-4: 아카이브된 워크스페이스는 그 아래 워크스페이스 ID 경로에 놓인다', () => {
    expect(archivePathOf('/srv/docs', 'ws-abc')).toBe(`/srv/docs/${ARCHIVE_DIRECTORY}/ws-abc`);
  });

  it('AC-4: 이름이 아니라 ID 로 놓인다 — 개명이 아카이브 자리를 옮기지 못한다', () => {
    expect(archivePathOf('/srv/docs', 'ws-abc')).not.toContain('기획팀');
  });

  it('두 워크스페이스가 같은 아카이브 루트를 공유하고 서로 다른 자리에 놓인다', () => {
    expect(archivePathOf('/srv/docs', 'a')).not.toBe(archivePathOf('/srv/docs', 'b'));
    expect(archivePathOf('/srv/docs', 'a').startsWith(archiveRootOf('/srv/docs'))).toBe(true);
    expect(archivePathOf('/srv/docs', 'b').startsWith(archiveRootOf('/srv/docs'))).toBe(true);
  });
});
