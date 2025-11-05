/**
 * Detailed Search Test - Issues verification
 */

const { test } = require('@playwright/test');

test('Search and click result - verify scroll and icons', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');

  console.log('\n=== Detailed Search Test ===\n');

  // Open search
  await page.locator('#search-toggle-btn').click();
  await page.waitForTimeout(300);

  // Search for "프롬프트"
  await page.locator('#search-input').fill('프롬프트');
  await page.waitForTimeout(1000);

  // Get results
  const results = page.locator('.search-result-item');
  const count = await results.count();
  console.log(`Total search results: ${count}\n`);

  // Check first result
  const firstResult = results.first();
  const path = await firstResult.locator('.search-result-path').textContent();
  console.log(`First result: ${path}`);

  // Check if it has multiple matches
  const metaInfo = firstResult.locator('.search-result-meta');
  const hasMetaInfo = await metaInfo.count() > 0;
  if (hasMetaInfo) {
    const metaText = await metaInfo.textContent();
    console.log(`  ${metaText}`);
    console.log(`  ❌ Problem: Only shows count, not actual locations\n`);
  }

  // Take screenshot before click
  await page.screenshot({ path: 'search-before-click.png', fullPage: true });
  console.log(`Screenshot saved: search-before-click.png`);

  // Get initial scroll position
  const scrollBefore = await page.evaluate(() => {
    const mainContent = document.querySelector('.main-content');
    return mainContent ? mainContent.scrollTop : 0;
  });
  console.log(`\nScroll position before click: ${scrollBefore}px`);

  // Click first result
  console.log(`Clicking first result...`);
  await firstResult.click();
  await page.waitForTimeout(2000); // Wait for file load + mermaid rendering

  // Check if icons are visible
  const treeControls = page.locator('#tree-controls');
  const iconsVisible = await treeControls.isVisible();
  console.log(`\nTree controls visible after click: ${iconsVisible ? '✅' : '❌'}`);

  if (!iconsVisible) {
    console.log(`  ❌ Problem: Icons disappeared!`);
  }

  // Check scroll position after click
  const scrollAfter = await page.evaluate(() => {
    const mainContent = document.querySelector('.main-content');
    return mainContent ? mainContent.scrollTop : 0;
  });
  console.log(`Scroll position after click: ${scrollAfter}px`);

  if (scrollAfter === 0 || scrollAfter === scrollBefore) {
    console.log(`  ❌ Problem: Did not scroll to search location!`);
  } else {
    console.log(`  ✅ Scrolled to location`);
  }

  // Take screenshot after click
  await page.screenshot({ path: 'search-after-click.png', fullPage: true });
  console.log(`\nScreenshot saved: search-after-click.png`);

  // Test second search (icon disappearing issue)
  console.log(`\n=== Testing Second Search ===`);

  // Open search again
  await page.locator('#search-toggle-btn').click();
  await page.waitForTimeout(300);

  // Check if icons are still visible
  const iconsVisibleAfterSecondSearch = await treeControls.isVisible();
  console.log(`Icons visible after second search open: ${iconsVisibleAfterSecondSearch ? '✅' : '❌'}`);

  if (!iconsVisibleAfterSecondSearch) {
    console.log(`  ❌ Problem: Icons disappeared on second search!`);
  }

  // Take screenshot
  await page.screenshot({ path: 'search-second-open.png' });
  console.log(`Screenshot saved: search-second-open.png\n`);
});
