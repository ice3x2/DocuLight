const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const root = path.resolve(__dirname, '../../../../..');
const requireFromEditor = createRequire(path.join(root, 'packages/editor/package.json'));
const { chromium } = requireFromEditor('playwright');
const artifact = path.join(root, 'docs/decision/newspaper-theme-dark.html');
const lightArtifact = path.join(root, 'docs/decision/newspaper-theme.html');
const output = __dirname;
const phase = process.argv[2];

if (!['red', 'green'].includes(phase)) {
  throw new Error('Usage: node hover-check.cjs <red|green>');
}

function rect(rectValue) {
  return {
    x: rectValue.x,
    y: rectValue.y,
    width: rectValue.width,
    height: rectValue.height,
  };
}

async function snapshot(page) {
  return page.evaluate(() => {
    const selectors = ['.frame', '.sidebar', '.main', '.inspector', '.tabs', '.toolbar', '.article-wrap'];
    const geometry = Object.fromEntries(selectors.map((selector) => {
      const value = document.querySelector(selector).getBoundingClientRect();
      return [selector, { x: value.x, y: value.y, width: value.width, height: value.height }];
    }));
    const anchors = [...document.querySelectorAll('.outline a')].map((element) => {
      const style = getComputedStyle(element);
      const value = element.getBoundingClientRect();
      return {
        text: element.textContent.trim(),
        className: element.className,
        rect: { x: value.x, y: value.y, width: value.width, height: value.height },
        color: style.color,
        textDecorationLine: style.textDecorationLine,
        textDecorationColor: style.textDecorationColor,
        textDecorationThickness: style.textDecorationThickness,
        textUnderlineOffset: style.textUnderlineOffset,
        outline: `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}`,
        outlineOffset: style.outlineOffset,
      };
    });
    return { geometry, anchors };
  });
}

function hasExactHoverDecoration(style) {
  return style.textDecorationLine.split(' ').includes('underline')
    && style.textDecorationColor === style.color
    && style.textDecorationThickness === '1px'
    && style.textUnderlineOffset === '3px';
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const url = `file:///${artifact.replace(/\\/g, '/')}`;
  await page.goto(url, { waitUntil: 'load' });

  const defaultState = await snapshot(page);
  const hoverRuns = [];
  const anchorCount = await page.locator('.outline a').count();
  for (let index = 0; index < anchorCount; index += 1) {
    const anchor = page.locator('.outline a').nth(index);
    const defaultStyle = defaultState.anchors[index];
    await anchor.hover();
    const hovered = await anchor.evaluate((element) => {
      const style = getComputedStyle(element);
      const value = element.getBoundingClientRect();
      return {
        color: style.color,
        textDecorationLine: style.textDecorationLine,
        textDecorationColor: style.textDecorationColor,
        textDecorationThickness: style.textDecorationThickness,
        textUnderlineOffset: style.textUnderlineOffset,
        outline: `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}`,
        outlineOffset: style.outlineOffset,
        rect: { x: value.x, y: value.y, width: value.width, height: value.height },
      };
    });
    await page.mouse.move(0, 0);
    const restored = await anchor.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        color: style.color,
        textDecorationLine: style.textDecorationLine,
        textDecorationColor: style.textDecorationColor,
        textDecorationThickness: style.textDecorationThickness,
        textUnderlineOffset: style.textUnderlineOffset,
      };
    });
    hoverRuns.push({
      index,
      text: defaultStyle.text,
      default: defaultStyle,
      hovered,
      restored,
      exactHoverDecoration: hasExactHoverDecoration(hovered),
      hoverGeometryUnchanged: JSON.stringify(defaultStyle.rect) === JSON.stringify(hovered.rect),
      mouseleaveRestored: ['color', 'textDecorationLine', 'textDecorationColor', 'textDecorationThickness', 'textUnderlineOffset']
        .every((property) => restored[property] === defaultStyle[property]),
    });
  }

  await page.goto(url, { waitUntil: 'load' });
  await page.keyboard.press('Tab');
  const focusBeforeHover = await page.evaluate(() => {
    const element = document.activeElement;
    const style = getComputedStyle(element);
    return {
      tag: element.tagName,
      text: element.textContent.trim(),
      outline: `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}`,
      outlineOffset: style.outlineOffset,
    };
  });
  await page.locator('.outline a').first().hover();
  const focusDuringHover = await page.evaluate(() => {
    const element = document.activeElement;
    const style = getComputedStyle(element);
    return {
      tag: element.tagName,
      text: element.textContent.trim(),
      outline: `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}`,
      outlineOffset: style.outlineOffset,
      color: style.color,
      textDecorationLine: style.textDecorationLine,
      textDecorationColor: style.textDecorationColor,
      textDecorationThickness: style.textDecorationThickness,
      textUnderlineOffset: style.textUnderlineOffset,
    };
  });
  await page.screenshot({ path: path.join(output, `${phase}-hover-focus.png`), fullPage: false });

  const lightBytes = fs.readFileSync(lightArtifact);
  const crypto = require('crypto');
  const report = {
    phase,
    command: `node ${path.relative(root, __filename).replace(/\\/g, '/')} ${phase}`,
    artifact: path.relative(root, artifact).replace(/\\/g, '/'),
    browser: await browser.version(),
    viewport: { width: 1440, height: 900 },
    lightArtifactSha256: crypto.createHash('sha256').update(lightBytes).digest('hex'),
    defaultState,
    hoverRuns,
    keyboardFocus: {
      beforeHover: focusBeforeHover,
      duringHover: focusDuringHover,
      maintained: focusBeforeHover.tag === 'A'
        && focusBeforeHover.outline === focusDuringHover.outline
        && focusBeforeHover.outlineOffset === focusDuringHover.outlineOffset
        && focusBeforeHover.outline.startsWith('2px solid '),
      exactHoverDecorationDuringFocus: hasExactHoverDecoration(focusDuringHover),
    },
  };

  if (phase === 'green') {
    const red = JSON.parse(fs.readFileSync(path.join(output, 'red-hover-measurements.json'), 'utf8'));
    report.beforeAfterGeometryUnchanged = JSON.stringify(red.defaultState.geometry) === JSON.stringify(defaultState.geometry)
      && JSON.stringify(red.defaultState.anchors.map((anchor) => anchor.rect))
        === JSON.stringify(defaultState.anchors.map((anchor) => anchor.rect));
  }

  report.pass = hoverRuns.length === 3
    && hoverRuns.every((run) => run.exactHoverDecoration && run.hoverGeometryUnchanged && run.mouseleaveRestored)
    && report.keyboardFocus.maintained
    && report.keyboardFocus.exactHoverDecorationDuringFocus
    && (phase !== 'green' || report.beforeAfterGeometryUnchanged);

  fs.writeFileSync(path.join(output, `${phase}-hover-measurements.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await context.close();
  await browser.close();

  if (!report.pass) {
    console.error(`FAIL ${phase}: exact computed hover contract is not satisfied; evidence saved.`);
    process.exitCode = 1;
    return;
  }
  console.log(`PASS ${phase}: computed hover, geometry, mouseleave, and keyboard-focus checks passed.`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
