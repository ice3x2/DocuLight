import { describe, expect, it } from 'vitest';

import {
  AUTOSAVE_DEBOUNCE_MS,
  conflictDetected,
  edited,
  forceSave,
  idleAutosave,
  initialAutosave,
  resolvedOnce,
  saveRejected,
  saveSucceeded,
  type AutosaveState,
} from '../src/document/autosave.js';

const fresh = (): AutosaveState => initialAutosave('hash-0');

describe('FR-STORAGE-001 — 버튼 없는 자동 저장', () => {
  it('AC-1: 입력이 멈추면 디바운스 뒤에 저장을 낸다', () => {
    const typed = edited(fresh(), '# 고침');

    expect(idleAutosave(typed, AUTOSAVE_DEBOUNCE_MS)).toMatchObject({ save: true, body: '# 고침' });
  });

  it('AC-1: 디바운스가 아직 안 지났으면 저장하지 않는다', () => {
    const typed = edited(fresh(), '# 고침');

    expect(idleAutosave(typed, AUTOSAVE_DEBOUNCE_MS - 1).save).toBe(false);
  });

  it('고친 것이 없으면 시간이 지나도 저장하지 않는다 — 같은 내용을 반복해 쓰면 버전이 헛돈다', () => {
    expect(idleAutosave(fresh(), AUTOSAVE_DEBOUNCE_MS * 10).save).toBe(false);
  });

  it('AC-3 · AC-4: Ctrl+S 는 디바운스를 기다리지 않고 스냅샷을 강제한다', () => {
    const typed = edited(fresh(), '# 고침');
    const forced = forceSave(typed);

    expect(forced).toMatchObject({ save: true, body: '# 고침', forceSnapshot: true });
  });

  it('AC-4: 일반 자동 저장은 스냅샷을 강제하지 않는다 — 세션당 1회 규칙이 그대로 산다', () => {
    const typed = edited(fresh(), '# 고침');

    expect(idleAutosave(typed, AUTOSAVE_DEBOUNCE_MS).forceSnapshot).toBe(false);
  });
});

describe('FR-STORAGE-001 — 충돌 시 중단과 재개', () => {
  it('AC-5: 충돌을 감지하면 자동 저장이 멈추고 배너 상태가 된다', () => {
    const stuck = conflictDetected(edited(fresh(), '# 내 것'), '# 남의 것');

    expect(stuck.status).toBe('conflict');
    expect(stuck.serverBody).toBe('# 남의 것');
  });

  it('AC-5: 중단 상태에서는 디바운스가 지나도 저장을 내지 않는다', () => {
    const stuck = conflictDetected(edited(fresh(), '# 내 것'), '# 남의 것');

    // 계속 내보내면 서버가 매번 거절하고, 그 사이 사용자는 자기 편집이
    // 저장되고 있다고 믿는다.
    expect(idleAutosave(edited(stuck, '# 더 고침'), AUTOSAVE_DEBOUNCE_MS).save).toBe(false);
  });

  it('AC-7: 중단 상태에서도 입력이 보존된다', () => {
    const stuck = conflictDetected(edited(fresh(), '# 내 것'), '# 남의 것');
    const more = edited(stuck, '# 내 것 + 더');

    expect(more.body).toBe('# 내 것 + 더');
    expect(more.status).toBe('conflict');
  });

  it('AC-6: 머지 뷰에서 1회 해소하면 재개된다', () => {
    const stuck = conflictDetected(edited(fresh(), '# 내 것'), '# 남의 것');

    const resumed = resolvedOnce(stuck, { body: '# 합친 것', hash: 'hash-1' });

    expect(resumed.status).toBe('idle');
    expect(resumed.baseHash).toBe('hash-1');
    expect(idleAutosave(edited(resumed, '# 이어서'), AUTOSAVE_DEBOUNCE_MS).save).toBe(true);
  });

  it('저장이 성공하면 다음 저장의 기준 해시가 갱신된다 — 안 하면 다음 저장이 거짓 충돌이 된다', () => {
    const saved = saveSucceeded(edited(fresh(), '# 고침'), 'hash-1');

    expect(saved.baseHash).toBe('hash-1');
    expect(idleAutosave(saved, AUTOSAVE_DEBOUNCE_MS).save).toBe(false);
  });

  it('AC-7 · FR-SHELL-012 AC-4: 저장 거부도 중단이고 입력은 남는다', () => {
    const rejected = saveRejected(edited(fresh(), '# 고침'));

    expect(rejected.status).toBe('rejected');
    expect(rejected.body).toBe('# 고침');
    expect(idleAutosave(rejected, AUTOSAVE_DEBOUNCE_MS).save).toBe(false);
  });

  it('저장 성공 뒤 다시 고치면 그 편집이 저장된다 — 성공이 잠금이 되면 안 된다', () => {
    const saved = saveSucceeded(edited(fresh(), '# 1'), 'hash-1');

    expect(idleAutosave(edited(saved, '# 2'), AUTOSAVE_DEBOUNCE_MS)).toMatchObject({ save: true, body: '# 2' });
  });
});
