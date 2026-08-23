import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { criteriaMet, shouldRecord, type Effect } from '../../../src/domain/audit/recordable.js';

const SERVER = existsSync(resolve(process.cwd(), 'src/main.ts'))
  ? process.cwd()
  : resolve(process.cwd(), 'packages/server');

describe('OBS-AUDIT-003 — 기록 대상은 열거가 아니라 기준으로 정한다', () => {
  it('AC-1: 노드의 존재·위치·본문을 바꾸면 기준 ① 에 걸린다', () => {
    expect(criteriaMet({ changesNode: true })).toEqual(['node-changed']);
    expect(shouldRecord({ changesNode: true })).toBe(true);
  });

  it('AC-2: 누가 도달하는가를 바꾸면 기준 ② 에 걸린다', () => {
    expect(criteriaMet({ changesReach: true })).toEqual(['reach-changed']);
    expect(shouldRecord({ changesReach: true })).toBe(true);
  });

  it('AC-3: 상방 게이트로 판정을 우회한 접근은 기준 ③ 에 걸린다', () => {
    expect(criteriaMet({ usesUpwardGate: true })).toEqual(['gate-bypass']);
    expect(shouldRecord({ usesUpwardGate: true })).toBe(true);
  });

  it('AC-4: 세 기준 어느 것에도 안 걸리는 순수 읽기는 기록하지 않는다', () => {
    expect(criteriaMet({})).toEqual([]);
    expect(shouldRecord({})).toBe(false);
  });

  it('세 축이 서로 독립이다 — 합치면 걸리는 자리가 준다', () => {
    // 논리곱으로 바뀌면 이동(①만)·부여(②만)가 전부 빠진다.
    expect(criteriaMet({ changesNode: true, changesReach: true, usesUpwardGate: true })).toEqual([
      'node-changed',
      'reach-changed',
      'gate-bypass',
    ]);
  });

  it('AC-5: 판정 코드에 조작 이름이 하나도 없다', () => {
    const code = readFileSync(join(SERVER, 'src', 'domain', 'audit', 'recordable.ts'), 'utf8');

    // 이름이 들어오는 순간 그것이 곧 고정 목록이고, 새 조작은 그 목록을
    // 갱신해야 기록된다 — 갱신을 빠뜨린 조작은 조용히 빠진다.
    for (const 이름 of ['acl.grant', 'acl.revoke', 'node.purge', 'node.copy', 'node.move']) {
      expect({ 이름, 있는가: code.includes(이름) }).toEqual({ 이름, 있는가: false });
    }
  });
});

describe('OBS-AUDIT-001 AC-3 — 원장이 예시로 든 여덟 조작이 모두 기준에 걸린다', () => {
  /**
   * 이 표는 **시험에만** 있다 (`OBS-AUDIT-001` AC-4).
   *
   * 제품 코드가 이 열거를 참조하면 그것이 곧 고정 목록이 되고, `OBS-AUDIT-003`
   * 이 기준으로 판정하기로 한 이유가 사라진다. 여기서는 「그 여덟이 기준에
   * 빠짐없이 걸리는가」를 확인할 뿐이다.
   */
  const 여덟: [string, Effect][] = [
    ['ACL 부여·회수', { changesReach: true }],
    ['상속 끊기·되돌리기', { changesReach: true }],
    ['그룹 멤버십 변경', { changesReach: true }],
    ['PAT 발급·폐기', { changesReach: true }],
    ['계정 상태 전환', { changesReach: true }],
    ['영구 삭제', { changesNode: true }],
    ['아카이브·복원', { changesNode: true }],
    ['관리 권한에 의한 열람', { usesUpwardGate: true }],
  ];

  it.each(여덟)('%s 이 최소 하나의 기준에 걸린다', (_이름, effect) => {
    expect(criteriaMet(effect).length).toBeGreaterThan(0);
  });

  it('어느 기준에도 안 걸리는 항목이 0개다', () => {
    expect(여덟.filter(([, effect]) => criteriaMet(effect).length === 0)).toEqual([]);
  });
});

describe('OBS-AUDIT-004 — 다른 화면이 행위자와 시각을 영구히 재현하면 기록하지 않는다', () => {
  it('AC-1: md 새 버전은 버전 목록이 영구히 재현하므로 기록하지 않는다', () => {
    const md: Effect = { changesNode: true, permanentlyReproduced: true };

    // 기준에는 **걸린다** — 본문이 바뀌기 때문이다. 빠지는 이유는 제외축이지
    // 기준 미해당이 아니며, 그 구별이 남아야 재현처가 사라졌을 때 되짚을 수 있다.
    expect(criteriaMet(md)).toEqual(['node-changed']);
    expect(shouldRecord(md)).toBe(false);
  });

  it('AC-2: 바이너리 새 버전은 재현처가 없으므로 기록한다', () => {
    expect(shouldRecord({ changesNode: true, permanentlyReproduced: false })).toBe(true);
  });

  it('AC-3: 기간 한정 재현은 제외 근거가 아니다', () => {
    // 보존 기간이 있는 재현처는 그 기간이 지나면 사실을 잃는다. 그런 곳을
    // 근거로 제외하면 기간이 지난 뒤 그 조작의 흔적이 어디에도 없다.
    // 그래서 이 소품은 「영구」일 때만 참이 된다 — 부르는 쪽이 기간 한정을
    // 참으로 넘기면 그것은 이 계약을 어긴 것이고, 아래가 그 계약이다.
    expect(shouldRecord({ changesNode: true })).toBe(true);
  });

  it('제외축이 기준을 대신하지 않는다 — 기준 미해당이면 재현 여부와 무관하게 기록 대상이 아니다', () => {
    expect(shouldRecord({ permanentlyReproduced: false })).toBe(false);
  });
});
