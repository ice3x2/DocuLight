import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LinkPanel, type LinkRowView } from '../src/links/LinkPanel.js';

afterEach(cleanup);

const 풀린것: LinkRowView = {
  nodeId: 'n1',
  name: '설계.md',
  workspaceName: '기획팀',
  resolved: true,
};

/** 없는 문서와 권한 없는 문서는 서버가 **같은 값**으로 준다. */
const 미해결: LinkRowView = { nodeId: null, name: '없는것', workspaceName: null, resolved: false };
const 권한없음: LinkRowView = { nodeId: null, name: '설계', workspaceName: null, resolved: false };

describe('SEC-WORKSPACE-005 · SEC-WORKSPACE-006 — 미해결 줄의 모양', () => {
  it('`SEC-WORKSPACE-005` AC-1: 미해결 줄도 지워지지 않고 목록에 남는다', () => {
    render(<LinkPanel label="아웃고잉 링크" rows={[풀린것, 미해결]} />);

    expect(within(screen.getByRole('list', { name: '아웃고잉 링크' })).getAllByRole('listitem')).toHaveLength(2);
  });

  it('`SEC-WORKSPACE-005` AC-4: 두 미해결의 렌더가 글자까지 같다', () => {
    const { container } = render(<LinkPanel label="아웃고잉 링크" rows={[미해결, 권한없음]} />);

    const 줄 = [...container.querySelectorAll('li')].map((one) => ({
      resolved: one.getAttribute('data-resolved'),
      // 이름만 다르다 — 그 밖의 무엇이 갈리면 그 차이가 사유를 알린다.
      shape: (one.textContent ?? '').replace(미해결.name, '').replace(권한없음.name, ''),
      // 줄 **안쪽까지** 훑는다 — 바깥에만 없는지 보면 안쪽 요소에 붙은
      // 툴팁이 그대로 통과한다.
      titles: [one, ...one.querySelectorAll('*')].map((el) => el.getAttribute('title')),
      icons: [one, ...one.querySelectorAll('*')].map((el) => el.getAttribute('data-icon')),
    }));

    expect(줄[0]).toEqual(줄[1]);
  });

  it('`SEC-WORKSPACE-006` AC-4: 링크 글자가 본문에 적힌 대로 보인다', () => {
    render(<LinkPanel label="아웃고잉 링크" rows={[권한없음]} />);

    // 마스킹하거나 생략하면 사용자가 자기가 적은 것을 못 알아본다.
    expect(screen.getByText('설계')).toBeDefined();
  });

  it('`SEC-WORKSPACE-006` AC-5: 미해결 줄에 사유를 담는 값이 없다', () => {
    const { container } = render(<LinkPanel label="아웃고잉 링크" rows={[권한없음]} />);

    const 줄 = container.querySelector('li')!;
    const 속성 = [줄, ...줄.querySelectorAll('*')].flatMap((el) =>
      [...el.attributes].map((one) => `${one.name}=${one.value}`),
    );
    expect(속성.filter((one) => /reason|forbidden|private|사유|권한|비공개/.test(one))).toEqual([]);
    expect(줄.textContent ?? '').not.toMatch(/권한|비공개|없음/);
  });

  it('풀린 줄만 누를 수 있다 — 누를 것이 없는 줄에 버튼을 두면 고장으로 읽힌다', () => {
    render(<LinkPanel label="아웃고잉 링크" rows={[풀린것, 권한없음]} />);

    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
