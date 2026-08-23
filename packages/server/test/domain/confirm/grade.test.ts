import { describe, expect, it } from 'vitest';

import {
  ASSIGNED_GRADES,
  derivedGrade,
  gradeFor,
  newVersionGrade,
  retentionGrade,
  wideningGrade,
  type Operation,
} from '../../../src/domain/confirm/grade.js';

describe('FR-CONFIRM-002 — 등급은 가역성과 즉시성 두 축으로 배정한다', () => {
  it('AC-1: 가역이고 효과가 즉시 드러나면 L1', () => {
    expect(derivedGrade({ reversible: true, immediate: true, broad: false })).toBe('L1');
  });

  it('AC-2: 비가역이면 최소 L2', () => {
    expect(derivedGrade({ reversible: false, immediate: true, broad: false })).toBe('L2');
  });

  it('AC-3: 가역이어도 효과가 잠재·지연되면 최소 L2', () => {
    // 되돌릴 수 있어도 **지금 아무 일도 일어나지 않는** 조작은 사용자가
    // 결과를 확인할 수 없어 확인이 필요하다.
    expect(derivedGrade({ reversible: true, immediate: false, broad: false })).toBe('L2');
  });

  it('AC-4: L2 조건을 충족하면서 광범위하면 L3', () => {
    expect(derivedGrade({ reversible: false, immediate: true, broad: true })).toBe('L3');
    expect(derivedGrade({ reversible: true, immediate: false, broad: true })).toBe('L3');
  });

  it('AC-4: L2 조건을 못 채우면 광범위해도 L3 이 아니다', () => {
    // 「광범위」 하나만으로 올리면 가역·즉시한 다건 조작까지 타이핑을
    // 요구하게 되고, 그러면 사용자가 토큰을 기계적으로 친다.
    expect(derivedGrade({ reversible: true, immediate: true, broad: true })).toBe('L1');
  });
});

describe('FR-CONFIRM-006 — 배정표가 그 조작들의 정본이다', () => {
  const 표: [Operation, string][] = [
    ['trash', 'L1'],
    ['purge-one', 'L2'],
    ['purge-many', 'L3'],
    ['grant-suspended', 'L2'],
    ['revoke-default-group', 'L3'],
    ['delete-group', 'L3'],
    ['revoke-pat', 'L2'],
    ['revoke-node-entry', 'L1'],
    ['remove-group-member', 'L1'],
    ['reject-signup', 'L1'],
  ];

  it.each(표)('%s 는 %s 이다', (operation, grade) => {
    expect(gradeFor(operation)).toBe(grade);
  });

  it('열거가 그 열 조작 전량이다', () => {
    expect(Object.keys(ASSIGNED_GRADES).sort()).toEqual(표.map(([op]) => op).sort());
  });
});

describe('FR-CONFIRM-003 — 직접 지정이 도출보다 앞선다', () => {
  it('AC-1: 도출값과 달라도 직접 지정이 이긴다', () => {
    // `trash` 는 비가역이 아니지만 「가역이고 즉시」로 도출해도 L1 이라
    // 구별이 안 된다. `revoke-node-entry` 로 잰다 — 넓히기의 반대인
    // 좁히기는 도출로는 L1 이고 배정표도 L1 이므로, 도출이 L2 가 되는
    // 조작을 배정표가 L1 로 되돌리는지 본다.
    expect(gradeFor('revoke-node-entry', { reversible: false, immediate: true, broad: false })).toBe('L1');
  });

  it('AC-2 · AC-3: 배정표에 없는 조작은 도출값을 쓴다', () => {
    // 새 요구가 등급을 직접 지정할 때 이 함수의 문면을 고치지 않아도
    // 그 지정이 유효해야 한다 — 열거에 없으면 도출로 떨어질 뿐이다.
    expect(gradeFor('아직-없는-조작' as Operation, { reversible: false, immediate: true, broad: true })).toBe('L3');
  });
});

describe('SEC-CONFIRM-002 — 넓히기는 가역성 축에서 비가역이다', () => {
  it('AC-1 · AC-2: 항목을 지울 수 있다는 이유로 L1 이 되지 않는다', () => {
    // 권한 항목을 지워도 이미 열람된 내용은 회수할 수 없다.
    expect(wideningGrade({ subject: 'set', target: 'file' })).toBe('L2');
    expect(wideningGrade({ subject: 'single', target: 'container' })).toBe('L2');
  });
});

describe('FR-CONFIRM-011 — 넓히기는 주체 명시성과 대상 범위 두 축', () => {
  it('AC-1: 명시적 단건 주체 + 문서 노드는 L1', () => {
    expect(wideningGrade({ subject: 'single', target: 'file' })).toBe('L1');
  });

  it('AC-2: 주체가 집합이면 문서여도 L2', () => {
    expect(wideningGrade({ subject: 'set', target: 'file' })).toBe('L2');
  });

  it('AC-3: 대상이 컨테이너면 단건이어도 L2', () => {
    expect(wideningGrade({ subject: 'single', target: 'container' })).toBe('L2');
  });

  it('AC-6: 어떤 조합도 L3 이 되지 않는다', () => {
    for (const subject of ['single', 'set'] as const) {
      for (const target of ['file', 'container'] as const) {
        expect(wideningGrade({ subject, target })).not.toBe('L3');
      }
    }
  });
});

describe('FR-CONFIRM-007 — 보존 기간 축소는 영향 건수로 갈린다', () => {
  it('AC-1: 영향 건수가 1 이상이면 L3', () => {
    expect(retentionGrade(1)).toEqual({ grade: 'L3', token: '1' });
    expect(retentionGrade(42)).toEqual({ grade: 'L3', token: '42' });
  });

  it('AC-2: 0 이면 L2 이고 타이핑을 요구하지 않는다', () => {
    expect(retentionGrade(0)).toEqual({ grade: 'L2', token: null });
  });

  it('AC-3: 토큰은 영향 건수 그 자체다', () => {
    expect(retentionGrade(7).token).toBe('7');
  });
});

describe('FR-CONFIRM-010 — 새 버전 올리기는 파일 형식으로 갈린다', () => {
  it('AC-1: 마크다운은 L1', () => {
    expect(newVersionGrade('회의록.md')).toBe('L1');
  });

  it('AC-2: 바이너리는 L2', () => {
    expect(newVersionGrade('설계.zip')).toBe('L2');
    expect(newVersionGrade('그림.png')).toBe('L2');
  });
});
