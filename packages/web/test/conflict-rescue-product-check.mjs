import { readFile } from 'node:fs/promises';
import { runBrowserChecks, login, loginAs, openInEditor, removeDocument } from './_web-harness.mjs';

await runBrowserChecks(async ({ page, check, note }) => {
  await login(page);
  const stamp = Date.now();
  let prepared;
  let secondContext;
  try {
    prepared = await page.evaluate(async (value) => {
      const tree = await (await fetch('/api/tree')).json();
      const workspace = tree[0]?.workspace;
      if (!workspace) return { error: 'workspace unavailable' };
      const user = { name: `rescue-${value}`, password: `Rescue-${value}-pass` };
      const createdUser = await fetch('/api/roster/users', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(user) });
      if (!createdUser.ok) return { error: `user ${createdUser.status}` };
      const principalId = (await createdUser.json()).id;
      const createdNode = await fetch('/api/nodes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId: workspace.id, parentId: null, kind: 'file', name: `rescue-${value}.md` }) });
      if (!createdNode.ok) return { error: `node ${createdNode.status}` };
      const node = await createdNode.json();
      const createdTarget = await fetch('/api/nodes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId: workspace.id, parentId: null, kind: 'file', name: `rescue-target-${value}.md` }) });
      if (!createdTarget.ok) return { error: `target ${createdTarget.status}` };
      const target = await createdTarget.json();
      const initial = await (await fetch(`/api/documents/${node.id}`)).json();
      await fetch(`/api/documents/${node.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: '# initial\n', baseHash: initial.hash }) });
      const grant = await fetch(`/api/nodes/${node.id}/share`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ principalId, level: 'edit' }) });
      if (!grant.ok) return { error: `grant ${grant.status}` };
      const targetGrant = await fetch(`/api/nodes/${target.id}/share`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ principalId, level: 'edit' }) });
      if (!targetGrant.ok) return { error: `target grant ${targetGrant.status}` };
      const share = await (await fetch(`/api/nodes/${node.id}/share`)).json();
      const entryId = share.rows?.find((row) => row.principalId === principalId && !row.inherited)?.entryId;
      return { node, target, user, entryId };
    }, stamp);
    if (prepared.error || !prepared.entryId) throw new Error(prepared.error ?? 'direct ACL entry unavailable');

    secondContext = await page.context().browser().newContext({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
    const second = await secondContext.newPage();
    await loginAs(second, prepared.user.name, prepared.user.password);
    await openInEditor(second, prepared.node.id, prepared.node.name);
    const tabs = second.getByRole('tablist', { name: '열린 문서' }).getByRole('tab');
    const initialTabCount = await tabs.count();
    const treeNode = () => second.getByRole('button', { name: prepared.node.name }).first();
    const treeTarget = () => second.getByRole('button', { name: prepared.target.name }).first();

    await treeTarget().click();
    await second.waitForURL((current) => current.pathname.includes(prepared.target.id));
    check('saved 탭의 일반 교체는 확인을 열지 않는다', await second.getByRole('alertdialog').count() === 0, 'no confirmation');
    check('saved 일반 교체는 기존 탭 정체성을 유지한다', await tabs.count() === initialTabCount, `tabs ${await tabs.count()}`);
    await treeNode().click({ modifiers: ['Control'] });
    await second.waitForURL((current) => current.pathname.includes(prepared.node.id));
    check('Ctrl+click은 별도 탭을 열고 선택한다', await tabs.count() === initialTabCount + 1 && (await tabs.filter({ hasText: prepared.node.name }).getAttribute('data-state')) === 'active', `tabs ${await tabs.count()}`);

    const editor = second.locator('[data-document-body] .cm-content');
    if (await second.getByRole('button', { name: '소스' }).count() === 0) await second.getByRole('button', { name: '편집' }).click();
    await editor.waitFor();
    await second.getByRole('button', { name: '소스' }).click();
    const source = second.getByRole('textbox', { name: '원문' });
    await source.click(); await source.press('Control+End'); await second.keyboard.insertText('선택과 실행취소');
    await second.keyboard.press('Shift+ArrowLeft');
    const selectionBefore = await source.evaluate((element) => element.value.slice(element.selectionStart, element.selectionEnd));
    await second.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    await second.setViewportSize({ width: 1440, height: 900 });
    const selectionAfter = await source.evaluate((element) => element.value.slice(element.selectionStart, element.selectionEnd));
    check('theme/layout 변경이 실제 편집기 선택을 보존한다', selectionBefore?.length === 1 && selectionAfter === selectionBefore, `${selectionBefore}/${selectionAfter}`);
    await second.keyboard.press('ArrowRight'); await second.keyboard.press('Control+z');
    const afterUndo = await source.inputValue();
    await second.keyboard.press('Control+y');
    const afterRedo = await source.inputValue();
    check('theme/layout 뒤 undo/redo가 계속 동작한다', !afterUndo.includes('선택과 실행취소') && afterRedo.includes('선택과 실행취소'), `undo=${afterUndo.includes('선택과 실행취소')} redo=${afterRedo.includes('선택과 실행취소')}`);
    await second.getByRole('button', { name: '라이브 프리뷰' }).click();

    await editor.click(); await editor.press('Control+End'); await second.keyboard.insertText('저장 중 교체');
    await treeTarget().click();
    await second.waitForURL((current) => current.pathname.includes(prepared.target.id));
    check('saving 탭의 일반 교체도 확인을 열지 않는다', await second.getByRole('alertdialog').count() === 0, 'no confirmation');
    await treeNode().click({ modifiers: ['Control'] });
    await second.waitForURL((current) => current.pathname.includes(prepared.node.id));
    if (await second.getByRole('button', { name: '소스' }).count() === 0) await second.getByRole('button', { name: '편집' }).click();
    await editor.waitFor();

    await second.route(`**/api/documents/${prepared.node.id}`, async (route) => {
      if (route.request().method() === 'PUT') await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'temporary_failure' }) });
      else await route.continue();
    });
    await editor.click(); await editor.press('Control+End'); await second.keyboard.insertText('일반 전송 실패 초안');
    await second.waitForFunction(() => document.querySelector('[data-document-body] .cm-content')?.textContent?.includes('일반 전송 실패 초안'));
    await second.keyboard.press('Control+S');
    const transportAlert = second.getByRole('alert'); await transportAlert.waitFor();
    check('generic transport 실패도 이유를 노출하지 않는 rejected 안내다', (await transportAlert.textContent()).includes('저장하지 못했습니다.') && !(await transportAlert.textContent()).includes('503'), await transportAlert.textContent());
    await second.keyboard.press('Control+S');
    check('반복 rejected 저장에도 초안과 단일 안내가 유지된다', await second.getByRole('alert').count() === 1 && (await editor.textContent()).includes('일반 전송 실패 초안'), `alerts ${await second.getByRole('alert').count()}`);
    await treeTarget().click();
    const transportDialog = second.getByRole('alertdialog', { name: '편집 중인 문서' }); await transportDialog.waitFor();
    await second.mouse.click(2, 2);
    check('rejected 교체 확인은 바깥 클릭으로 닫히지 않는다', await transportDialog.isVisible(), 'dialog remains');
    await second.keyboard.press('Escape');
    await transportDialog.waitFor({ state: 'detached' });
    check('rejected 교체 Escape는 교체 없이 초안을 보존한다', (await editor.textContent()).includes('일반 전송 실패 초안'), 'dialog closed, draft remains');
    await second.unroute(`**/api/documents/${prepared.node.id}`);
    await second.reload({ waitUntil: 'networkidle' });

    await second.getByRole('button', { name: '편집' }).click();
    await editor.waitFor(); await editor.click(); await second.keyboard.press('Control+A');
    const beforeRevoke = '# 권한 회수 전 초안\n한글 😀\n후행 공백  ';
    await second.keyboard.insertText(beforeRevoke);
    await second.waitForFunction(() => document.querySelector('[data-document-body] .cm-content')?.textContent?.includes('권한 회수 전 초안'));

    const revoked = await page.evaluate(async (entryId) => { const response = await fetch(`/api/acl-entries/${entryId}`, { method: 'DELETE' }); return response.status; }, prepared.entryId);
    check('권한 회수 요청이 성공한다', revoked === 204, `DELETE status ${revoked}`);
    await second.keyboard.press('Control+S');
    const alert = second.getByRole('alert');
    await alert.waitFor();
    check('실제 권한 상실 저장이 generic rejected 안내로 이어진다', (await alert.textContent()).includes('저장하지 못했습니다. 편집 내용은 그대로 남아 있습니다.'), await alert.textContent());

    await editor.click(); await editor.press('Control+End');
    const appended = '\n거부 뒤에도 쓴 줄\n'; await second.keyboard.insertText(appended);
    const expected = beforeRevoke + appended;
    const downloadPromise = second.waitForEvent('download');
    await second.getByRole('button', { name: '편집 중인 본문 내려받기' }).click();
    const download = await downloadPromise;
    const downloaded = await readFile(await download.path(), 'utf8');
    check('실제 다운로드가 거부 뒤 최신 로컬 본문 바이트를 보존한다', downloaded === expected, `expected ${expected.length} bytes, got ${downloaded.length}`);
    check('실제 다운로드 파일명은 현재 문서 이름이다', download.suggestedFilename() === prepared.node.name, download.suggestedFilename());
    check('다운로드 뒤 rejected 상태와 편집 본문이 유지된다', await alert.isVisible() && (await editor.textContent()).includes('거부 뒤에도 쓴 줄'), 'alert/editor remain');
    const targetButton = second.getByRole('button', { name: prepared.target.name }).first();
    await targetButton.click();
    const dialog = second.getByRole('alertdialog', { name: '편집 중인 문서' }); await dialog.waitFor();
    const stay = dialog.getByRole('button', { name: '머무르기' });
    check('실제 rejected 교체 확인은 머무르기에 초기 초점을 둔다', await stay.evaluate((element) => element === document.activeElement), 'cancel initially focused');
    await second.mouse.click(2, 2);
    check('실제 ACL rejected 교체 확인도 바깥 클릭으로 닫히지 않는다', await dialog.isVisible(), 'dialog remains');
    await second.keyboard.press('Escape');
    check('실제 rejected 교체 취소가 원문과 거부 상태를 보존한다', await alert.isVisible() && (await editor.textContent()).includes('거부 뒤에도 쓴 줄'), 'draft/rejection remain');
    await targetButton.evaluate((element) => new Promise((resolve) => {
      if (element === document.activeElement || document.activeElement?.getAttribute('aria-label') === '브레드크럼') return resolve(true);
      const frame = () => element === document.activeElement || document.activeElement?.getAttribute('aria-label') === '브레드크럼' ? resolve(true) : requestAnimationFrame(frame);
      requestAnimationFrame(frame); setTimeout(() => resolve(false), 2_000);
    }));
    const focusReturned = await targetButton.evaluate((element) => element === document.activeElement || document.activeElement?.getAttribute('aria-label') === '브레드크럼');
    check('rejected 교체 취소가 호출 항목 또는 안정된 문서 헤더로 초점을 돌린다', focusReturned, 'invoker/fallback focus restored');
    await targetButton.click();
    await second.getByRole('alertdialog').getByRole('button', { name: '그래도 열기' }).click();
    await second.waitForURL((current) => current.pathname.includes(prepared.target.id));
    check('명시적 accept 뒤에만 선택한 대상이 열린다', second.url().includes(prepared.target.id), second.url());
  } catch (error) {
    note(String(error));
    check('실제 권한 상실 본문 구제를 실행한다', false, String(error));
  } finally {
    await secondContext?.close();
    if (prepared?.node?.id) await removeDocument(page, prepared.node.id).catch(() => undefined);
    if (prepared?.target?.id) await removeDocument(page, prepared.target.id).catch(() => undefined);
  }
});
