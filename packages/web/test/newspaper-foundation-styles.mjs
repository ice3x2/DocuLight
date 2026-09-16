import { chromium } from '../../editor/node_modules/playwright/index.mjs';
import { createServer } from 'vite';

const expected = {
  app: 'rgb(233, 231, 226)',
  document: 'rgb(245, 244, 239)',
  sidebar: 'rgb(222, 221, 214)',
  control: 'rgb(250, 249, 245)',
  text: 'rgb(36, 37, 33)',
  sidebarSecondary: 'rgb(94, 95, 88)',
  controlBorder: 'rgb(122, 123, 113)',
  primary: 'rgb(54, 91, 112)',
  primaryHover: 'rgb(44, 75, 93)',
  selected: 'rgb(223, 231, 233)',
  danger: 'rgb(150, 63, 56)',
  disabledSurface: 'rgb(227, 226, 219)',
  disabledText: 'rgb(116, 118, 109)',
};

const cases = [
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1920x1080', width: 1920, height: 1080 },
  // This exercises the CSS viewport produced by 200% zoom at 1280x720. It is
  // deliberately not reported as proof that a desktop browser zoom control moved.
  { name: '640x360 effective viewport (200% applicability only)', width: 640, height: 360 },
];

const failures = [];
const check = (name, pass, detail) => {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name} — ${detail}`);
  if (!pass) failures.push(name);
};

const px = (value) => Number.parseFloat(value);
const luminance = (color) => {
  const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [];
  if (channels.length !== 3) return Number.NaN;
  return channels
    .map((value) => value / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
};
const contrast = (foreground, background) => {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
};

const server = await createServer({
  configFile: false,
  root: new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'),
  server: { host: '127.0.0.1', port: 0 },
  appType: 'mpa',
});

await server.listen();
const address = server.httpServer.address();
if (address === null || typeof address === 'string') throw new Error('Vite did not expose a TCP port');
const fixtureUrl = `http://127.0.0.1:${address.port}/test/newspaper-foundation-fixture.html`;

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of cases) {
    const page = await browser.newPage({ viewport });
    await page.goto(fixtureUrl, { waitUntil: 'networkidle' });

    const styles = await page.evaluate(() => {
      const read = (selector) => {
        const element = document.querySelector(selector);
        if (!(element instanceof HTMLElement)) throw new Error(`Missing fixture element: ${selector}`);
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          background: style.backgroundColor,
          color: style.color,
          borderColor: style.borderColor,
          borderRadius: style.borderRadius,
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          minHeight: style.minHeight,
          height: rect.height,
          width: rect.width,
          scrollWidth: element.scrollWidth,
          scrollHeight: element.scrollHeight,
          clientWidth: element.clientWidth,
          clientHeight: element.clientHeight,
          opacity: style.opacity,
          userSelect: style.userSelect,
          whiteSpace: style.whiteSpace,
          rowGap: style.rowGap,
        };
      };
      return {
        body: read('body'),
        document: read('#document'),
        sidebar: read('#sidebar'),
        sidebarSecondary: read('#sidebar-secondary'),
        normalInput: read('#normal-name'),
        invalidInput: read('#name'),
        label: read('#name-label'),
        help: read('#name-help'),
        error: read('#name-error'),
        selected: read('#selected-row'),
        readonly: read('#readonly-value'),
        disabled: read('#disabled-action'),
        primary: read('#primary-action'),
        portal: read('#portal'),
        fieldStack: read('#field-stack'),
        sectionStack: read('#section-stack'),
        errorSemantics: (() => {
          const input = document.querySelector('#name');
          const error = document.querySelector('#name-error');
          const icon = error?.querySelector('[data-slot="field-error-icon"]');
          if (!(input instanceof HTMLInputElement) || !(error instanceof HTMLElement) || !(icon instanceof HTMLElement)) {
            throw new Error('Missing invalid-field communication fixture');
          }
          const iconRect = icon.getBoundingClientRect();
          return {
            invalid: input.getAttribute('aria-invalid'),
            describedBy: input.getAttribute('aria-describedby')?.split(/\s+/) ?? [],
            errorId: error.id,
            errorText: error.textContent?.trim() ?? '',
            iconHidden: icon.getAttribute('aria-hidden'),
            iconText: icon.textContent?.trim() ?? '',
            iconWidth: iconRect.width,
            iconHeight: iconRect.height,
          };
        })(),
      };
    });

    const prefix = `[${viewport.name}]`;
    check(`${prefix} semantic surfaces`,
      styles.body.background === expected.app &&
        styles.document.background === expected.document &&
        styles.sidebar.background === expected.sidebar &&
        styles.portal.background === expected.control,
      `body=${styles.body.background}, document=${styles.document.background}, sidebar=${styles.sidebar.background}, portal=${styles.portal.background}`);
    check(`${prefix} exact light text and interaction colors`,
      styles.body.color === expected.text &&
        styles.sidebarSecondary.color === expected.sidebarSecondary &&
        styles.normalInput.borderColor === expected.controlBorder &&
        styles.invalidInput.borderColor === expected.danger &&
        styles.primary.background === expected.primary &&
        styles.selected.background === expected.selected &&
        styles.error.color === expected.danger,
      `text=${styles.body.color}, sidebar-secondary=${styles.sidebarSecondary.color}, normal-input-border=${styles.normalInput.borderColor}, invalid-input-border=${styles.invalidInput.borderColor}, primary=${styles.primary.background}, selected=${styles.selected.background}, error=${styles.error.color}`);
    check(`${prefix} invalid field communicates without color alone`,
      styles.errorSemantics.invalid === 'true' &&
        styles.errorSemantics.describedBy.includes(styles.errorSemantics.errorId) &&
        styles.errorSemantics.errorText.length > 1 &&
        styles.errorSemantics.iconHidden === 'true' &&
        styles.errorSemantics.iconText === '!' &&
        styles.errorSemantics.iconWidth > 0 && styles.errorSemantics.iconHeight > 0,
      `aria-invalid=${styles.errorSemantics.invalid}, described-by=${styles.errorSemantics.describedBy.join(',')}, error=${JSON.stringify(styles.errorSemantics.errorText)}, icon=${styles.errorSemantics.iconText}/${styles.errorSemantics.iconHidden}/${styles.errorSemantics.iconWidth}x${styles.errorSemantics.iconHeight}`);
    check(`${prefix} control geometry and typography`,
      styles.invalidInput.height >= 36 && styles.primary.height >= 36 &&
        px(styles.invalidInput.borderRadius) === 4 && px(styles.primary.borderRadius) === 4 &&
        px(styles.label.fontSize) === 13 && px(styles.label.lineHeight) === 20 &&
        px(styles.invalidInput.fontSize) === 14 && px(styles.invalidInput.lineHeight) === 22 &&
        px(styles.help.fontSize) === 12 && px(styles.help.lineHeight) === 18 &&
        px(styles.error.fontSize) === 12 && px(styles.error.lineHeight) === 18 &&
        px(styles.fieldStack.rowGap) === 20 && px(styles.sectionStack.rowGap) === 32,
      `input=${styles.invalidInput.height}px/${styles.invalidInput.borderRadius}/${styles.invalidInput.fontSize}/${styles.invalidInput.lineHeight}, button=${styles.primary.height}px/${styles.primary.borderRadius}, label=${styles.label.fontSize}/${styles.label.lineHeight}, help=${styles.help.fontSize}/${styles.help.lineHeight}, gaps=${styles.fieldStack.rowGap}/${styles.sectionStack.rowGap}`);
    check(`${prefix} long Korean wraps without horizontal clipping`,
      styles.help.scrollWidth <= styles.help.clientWidth &&
        styles.selected.scrollWidth <= styles.selected.clientWidth &&
        styles.help.scrollHeight > 18 && styles.selected.scrollHeight > 22,
      `help=${styles.help.scrollWidth}/${styles.help.clientWidth}x${styles.help.scrollHeight}, selected=${styles.selected.scrollWidth}/${styles.selected.clientWidth}x${styles.selected.scrollHeight}`);
    check(`${prefix} readonly and disabled remain distinguishable`,
      styles.readonly.userSelect !== 'none' && styles.disabled.opacity === '1' &&
        styles.disabled.background === expected.disabledSurface && styles.disabled.color === expected.disabledText,
      `readonly user-select=${styles.readonly.userSelect}, disabled opacity=${styles.disabled.opacity}, background=${styles.disabled.background}, color=${styles.disabled.color}`);
    const textRatio = contrast(styles.body.color, styles.body.background);
    const sidebarRatio = contrast(styles.sidebarSecondary.color, styles.sidebar.background);
    const normalInputBoundaryRatio = contrast(styles.normalInput.borderColor, styles.normalInput.background);
    const invalidInputBoundaryRatio = contrast(styles.invalidInput.borderColor, styles.invalidInput.background);
    const primaryBoundaryRatio = contrast(styles.primary.background, styles.document.background);
    check(`${prefix} actual contrast pairs meet the contract`,
      textRatio >= 4.5 && sidebarRatio >= 4.5 && normalInputBoundaryRatio >= 3 && invalidInputBoundaryRatio >= 3 && primaryBoundaryRatio >= 3,
      `text=${textRatio.toFixed(2)}, sidebar=${sidebarRatio.toFixed(2)}, normal-input-boundary=${normalInputBoundaryRatio.toFixed(2)}, invalid-input-boundary=${invalidInputBoundaryRatio.toFixed(2)}, primary-boundary=${primaryBoundaryRatio.toFixed(2)}`);

    await page.close();
  }

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(fixtureUrl, { waitUntil: 'networkidle' });
  await page.locator('#primary-action').hover();
  check('primary hover uses the approved role color',
    (await page.locator('#primary-action').evaluate((node) => getComputedStyle(node).backgroundColor)) === expected.primaryHover,
    `background=${await page.locator('#primary-action').evaluate((node) => getComputedStyle(node).backgroundColor)}`);

  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await page.keyboard.press('Tab');
  const firstFocus = await page.evaluate(() => document.activeElement?.id);
  await page.keyboard.press('Tab');
  const secondFocus = await page.evaluate(() => document.activeElement?.id);
  await page.keyboard.press('Shift+Tab');
  const reverseFocus = await page.evaluate(() => document.activeElement?.id);
  const focus = await page.locator(`#${reverseFocus}`).evaluate((node) => {
    const style = getComputedStyle(node);
    return { width: style.outlineWidth, offset: style.outlineOffset, style: style.outlineStyle };
  });
  check('keyboard order and visible separated focus',
    firstFocus === 'name' && secondFocus === 'choice' && reverseFocus === 'name' &&
      px(focus.width) >= 2 && px(focus.offset) >= 2 && focus.style !== 'none',
    `forward=${firstFocus}->${secondFocus}, reverse=${reverseFocus}, outline=${focus.width}/${focus.offset}/${focus.style}`);

  await page.locator('#primary-action').focus();
  await page.keyboard.press('Enter');
  const activationCount = await page.locator('#activation-count').textContent();
  check('keyboard button activation remains available',
    activationCount === '1',
    `activation-count=${activationCount}`);

  await page.locator('#name').focus();
  await page.locator('#name').dispatchEvent('compositionstart', { data: '한' });
  await page.keyboard.press('Enter');
  const composingState = await page.evaluate(() => ({
    active: document.activeElement?.id,
    submits: document.querySelector('#submit-count')?.textContent,
    border: getComputedStyle(document.querySelector('#name')).borderColor,
  }));
  await page.locator('#name').dispatchEvent('compositionend', { data: '한' });
  check('IME composition keeps focus/style and does not submit',
    composingState.active === 'name' && composingState.submits === '0' && composingState.border === expected.danger,
    `active=${composingState.active}, submits=${composingState.submits}, border=${composingState.border}`);
  await page.close();
} finally {
  await browser.close();
  await server.close();
}

console.log(`\n${failures.length === 0 ? 'PASS' : 'FAIL'}: ${cases.length} viewport cases; ${failures.length} failed assertions`);
process.exitCode = failures.length === 0 ? 0 : 1;
