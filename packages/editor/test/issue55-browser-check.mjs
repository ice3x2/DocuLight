import { VIEW, openDemo, runBrowserChecks } from './_browser-harness.mjs';

await runBrowserChecks(async ({ page, check, beginMeasuring }) => {
  await openDemo(page);
  await page.evaluate((viewExpression) => {
    const view = (0, eval)(viewExpression);
    const doc = [
      '```ts', 'const answer = 42;', '```', '',
      '| 매우 긴 표 머리 | 둘 |', '| --- | --- |', '| 값 값 값 값 값 값 값 값 값 값 | 둘 |', '',
      '> 인용문입니다.', '',
      '```mermaid', 'graph LR; A-->B;', '```', '',
      '```mermaid', 'not valid mermaid !!!', '```', '', '끝 문단',
    ].join('\n');
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: doc }, selection: { anchor: doc.length } });
  }, VIEW);
  beginMeasuring();

  await page.waitForSelector('.dl-code .shiki');
  const code = await page.locator('.dl-code .shiki').first().evaluate((el) => ({
    background: getComputedStyle(el).backgroundColor,
    overflow: getComputedStyle(el).overflowX,
    lineHeight: getComputedStyle(el).lineHeight,
  }));
  check('code uses semantic surface and local horizontal scroll', code.overflow === 'auto' && code.lineHeight === '22px', JSON.stringify(code));

  const table = page.locator('.cm-atomic-table').first();
  await table.scrollIntoViewIfNeeded();
  check('table wrapper is keyboard-scrollable only when overflowing and named', await table.evaluate((el) => el.tabIndex === (el.scrollWidth > el.clientWidth ? 0 : -1) && el.getAttribute('aria-label') === '표'));

  const diagram = page.locator('.dl-mermaid').first();
  await diagram.scrollIntoViewIfNeeded();
  check('diagram wrapper is keyboard-scrollable only when overflowing and named', await diagram.evaluate((el) => el.tabIndex === (el.scrollWidth > el.clientWidth ? 0 : -1) && el.getAttribute('aria-label') === '다이어그램'));

  const error = page.locator('.dl-mermaid-error');
  await error.waitFor();
  check('diagram error uses safe message and exact source disclosure', await error.evaluate((el) => el.querySelector('strong')?.textContent === '다이어그램을 표시할 수 없습니다.' && el.querySelector('pre')?.textContent === 'not valid mermaid !!!'));
  const summary = error.locator('summary');
  await summary.click();
  await summary.focus();
  const expandedHeight = await error.evaluate((el) => el.getBoundingClientRect().height);
  await page.evaluate(() => { document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; });
  await page.waitForFunction(() => document.querySelector('.dl-mermaid-error details')?.open === true);
  check('error disclosure remains open and focused across theme repaint', await summary.evaluate((el) => el === document.activeElement && el.parentElement?.open === true));
  check('expanded disclosure participates in measured height', expandedHeight > 40, `${expandedHeight}px`);

  const quote = page.locator('.cm-atomic-blockquote').first();
  await quote.scrollIntoViewIfNeeded();
  check('quote uses a two-pixel action rail', (await quote.evaluate((el) => getComputedStyle(el).borderLeftWidth)) === '2px');
});
