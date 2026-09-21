import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GroupRoster } from '../src/principal/GroupRoster.js';
import { PrincipalPicker } from '../src/principal/PrincipalPicker.js';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const group = {
  id: 'group-1', name: '기획팀', system: false, systemType: null,
  mode: 'managed' as const, canAdd: true, effectiveMembersComplete: true,
  members: [{ id: 'user-1', name: '같은 이름', status: 'active' as const }],
  effectiveMembers: [{ id: 'user-1', name: '같은 이름', status: 'active' as const }],
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

describe('IR-PRINCIPAL-003 — 그룹 조회와 구성원 추가 요청 수명', () => {
  it('AC-1: loading/error를 empty와 구분하고 retry는 roster GET만 수행한다', async () => {
    const retry = vi.fn();
    const view = render(<GroupRoster roster={{ state: 'loading' }} />);
    expect(screen.getByRole('status').textContent).toContain('그룹 목록을 불러오는 중');
    expect(screen.queryByText('표시할 그룹 항목이 없습니다.')).toBeNull();

    view.rerender(<GroupRoster roster={{ state: 'error', onRetry: retry }} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '그룹 목록 다시 불러오기' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('row', { name: /기획팀/ })).toBeNull();
  });

  it('AC-2/3: user-only 검색은 existing ID를 비활성화하고 같은 이름을 ID로 구분한다', async () => {
    const picked = vi.fn();
    const fetch = vi.fn(async () => new Response(JSON.stringify([
      { id: 'user-1', name: '같은 이름', kind: 'user', status: 'active', system: false },
      { id: 'user-2', name: '같은 이름', kind: 'user', status: 'active', system: false },
    ]), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    render(<PrincipalPicker scope="group:group-1" mode="user-only" excludedIds={['user-1']} onPick={picked} />);
    await userEvent.setup().type(screen.getByRole('combobox'), '같은');
    const options = await screen.findAllByRole('option');
    expect(fetch.mock.calls[0]?.[0]).toContain('kind=user');
    expect(options[0]?.textContent).toContain('이미 멤버입니다.');
    expect(options[0]?.getAttribute('aria-disabled')).toBe('true');
    expect(options[0]?.textContent).toContain('user-1');
    expect(options[1]?.textContent).toContain('user-2');
    fireEvent.click(options[0]!);
    expect(picked).not.toHaveBeenCalled();
    fireEvent.click(options[1]!);
    expect(picked).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-2', kind: 'user' }));
  });

  it('H2/M3: missing, conflicting, or incomplete projection disables add without claiming an empty active membership', () => {
    const malformed = { id: 'missing', name: '누락', system: false, members: [] } as typeof group;
    const conflicting = { ...group, id: 'conflict', system: true, systemType: 'default' as const, mode: 'managed' as const, members: [], effectiveMembers: [] };
    const incomplete = { ...group, id: 'incomplete', effectiveMembersComplete: false as true, members: [] };
    render(<GroupRoster groups={[malformed, conflicting, incomplete, { ...group, id: 'complete', members: [], effectiveMembers: [] }]} onAddMember={vi.fn()} />);

    for (const name of ['누락', '기획팀']) {
      expect(screen.getAllByRole('row', { name: new RegExp(name) }).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText('멤버 정보를 확인할 수 없어 추가할 수 없습니다.')).toHaveLength(3);
    expect(screen.getAllByText('멤버가 없습니다.')).toHaveLength(1);
    expect(screen.queryByText('제공된 멤버 항목이 없습니다.')).toBeNull();
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
  });

  it('H5: user-only response rejects group, rejected, and malformed rows before selection', async () => {
    const picked = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([
      { id: 'group-2', name: '그룹 행', kind: 'group', status: 'active', system: false },
      { id: 'rejected-2', name: '거절 행', kind: 'user', status: 'rejected', system: false },
      { id: '', name: '깨진 행', kind: 'user', status: 'active', system: false },
      { id: 'active-2', name: '활성 행', kind: 'user', status: 'active', system: false },
    ]), { status: 200, headers: { 'content-type': 'application/json' } })));
    render(<PrincipalPicker scope="group:group-1" mode="user-only" onPick={picked} />);
    await userEvent.setup().type(screen.getByRole('combobox'), '행검색');
    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]?.textContent).toContain('활성 행');
    fireEvent.click(options[0]!);
    expect(picked).toHaveBeenCalledWith(expect.objectContaining({ id: 'active-2', kind: 'user', status: 'active' }));
  });

  it('C0/H1: combined defensive cap is applied before user-only eligibility filtering without top-up', async () => {
    const firstTwenty = [
      { id: 'invalid-group', name: '앞의 잘못된 그룹', kind: 'group', status: 'active', system: false },
      ...Array.from({ length: 19 }, (_, index) => ({ id: `early-${index}`, name: `앞 후보 ${index}`, kind: 'user', status: 'active', system: false })),
    ];
    const afterCap = [
      { id: 'late-valid-20', name: '뒤 후보 20', kind: 'user', status: 'active', system: false },
      { id: 'late-valid-21', name: '뒤 후보 21', kind: 'user', status: 'active', system: false },
    ];
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([...firstTwenty, ...afterCap]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })));

    render(<PrincipalPicker scope="group:group-1" mode="user-only" />);
    await userEvent.setup().type(screen.getByRole('combobox'), '후보');
    const options = await screen.findAllByRole('option');

    expect(options).toHaveLength(19);
    expect(options.some((option) => option.textContent?.includes('뒤 후보'))).toBe(false);
  });

  it('AC-4/5: same-group duplicate를 동기 차단하고 accepted write와 refresh failure를 분리한다', async () => {
    const pending = deferred<{ ok: true; refreshFailed: true }>();
    const add = vi.fn(() => pending.promise);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([
      { id: 'user-2', name: '둘째', kind: 'user', status: 'active', system: false },
    ]), { status: 200, headers: { 'content-type': 'application/json' } })));
    render(<GroupRoster groups={[group]} onAddMember={add} />);
    const user = userEvent.setup();
    await user.type(screen.getByRole('combobox'), '둘째');
    const option = await screen.findByRole('option');
    await Promise.all([user.click(option), user.click(option)]);
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith('group-1', 'user-2');
    pending.resolve({ ok: true, refreshFailed: true });
    expect(await screen.findByText('멤버 추가 요청이 수락되었습니다.')).toBeDefined();
    expect(screen.getByRole('alert').textContent).toContain('그룹 목록을 새로 불러오지 못했습니다');
    expect(screen.queryByText('둘째', { selector: '[data-group-members] *' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: '기획팀 멤버 검색' }));
  });

  it('AC-5: accepted receipt는 후속 roster error가 행을 숨겨도 보존된다', async () => {
    const retry = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([
      { id: 'user-2', name: '둘째', kind: 'user', status: 'active', system: false },
    ]), { status: 200, headers: { 'content-type': 'application/json' } })));
    const view = render(<GroupRoster roster={{ state: 'ready', groups: [group], revision: 1 }} onAddMember={async () => ({ ok: true, refreshFailed: true })} />);
    await userEvent.setup().type(screen.getByRole('combobox'), '둘째');
    fireEvent.click(await screen.findByRole('option'));
    await screen.findByText('멤버 추가 요청이 수락되었습니다.');

    view.rerender(<GroupRoster roster={{ state: 'error', revision: 1, onRetry: retry }} onAddMember={async () => ({ ok: true, refreshFailed: true })} />);
    expect(screen.getByText('멤버 추가 요청이 수락되었습니다.')).toBeDefined();
    expect(screen.getByText(/그룹 목록을 새로 불러오지 못했습니다/)).toBeDefined();
  });

  it('AC-6: stale completion은 notice나 focus를 다른 그룹에 남기지 않는다', async () => {
    const pending = deferred<{ ok: true; refreshFailed: false }>();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([
      { id: 'user-2', name: '둘째', kind: 'user', status: 'active', system: false },
    ]), { status: 200, headers: { 'content-type': 'application/json' } })));
    const view = render(<GroupRoster groups={[group]} requestContext={{ principalId: 'root', authGeneration: 1, categoryGeneration: 1, queryGeneration: 1 }} onAddMember={() => pending.promise} />);
    await userEvent.setup().type(screen.getByRole('combobox'), '둘째');
    const option = await screen.findByRole('option');
    option.focus();
    fireEvent.click(option);
    view.rerender(<GroupRoster groups={[]} requestContext={{ principalId: 'root', authGeneration: 1, categoryGeneration: 2, queryGeneration: 2 }} onAddMember={() => pending.promise} />);
    const safe = screen.getByText('표시할 그룹 항목이 없습니다.');
    safe.setAttribute('tabindex', '-1'); safe.focus();
    pending.resolve({ ok: true, refreshFailed: false });
    await waitFor(() => expect(screen.queryByText('멤버 추가 요청이 수락되었습니다.')).toBeNull());
    expect(document.activeElement).toBe(safe);
  });

  it('AC-5/6: uncertain 결과는 새 ready revision까지 재실행을 막고 GET reconciliation만 제공한다', async () => {
    const retry = vi.fn();
    const add = vi.fn(async () => ({ ok: false as const, kind: 'uncertain' as const }));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([
      { id: 'user-2', name: '둘째', kind: 'user', status: 'active', system: false },
    ]), { status: 200, headers: { 'content-type': 'application/json' } })));
    const view = render(<GroupRoster roster={{ state: 'ready', groups: [group], revision: 1, onRetry: retry }} onAddMember={add} />);
    await userEvent.setup().type(screen.getByRole('combobox'), '둘째');
    fireEvent.click(await screen.findByRole('option'));
    expect((await screen.findByRole('alert')).textContent).toContain('처리 결과를 확인하지 못했습니다');
    await userEvent.setup().click(screen.getByRole('button', { name: '그룹 목록 새로 불러오기' }));
    expect(retry).toHaveBeenCalledTimes(1);
    view.rerender(<GroupRoster roster={{ state: 'ready', groups: [group], revision: 2, onRetry: retry }} onAddMember={add} />);
    await waitFor(() => expect((within(screen.getByRole('row', { name: /기획팀/ })).getByRole('combobox') as HTMLInputElement).disabled).toBe(false));
    expect(add).toHaveBeenCalledTimes(1);
  });
});
