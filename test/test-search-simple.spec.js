/**
 * Simple Search Test - Debug version
 */

const { test, expect } = require('@playwright/test');

test('Debug search panel', async ({ page }) => {
  // Navigate
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');

  console.log('\n=== Search Panel Debug ===\n');

  // Check if search toggle button exists
  const searchToggle = page.locator('#search-toggle-btn');
  const toggleExists = await searchToggle.count() > 0;
  console.log(`Search toggle button exists: ${toggleExists ? '✅' : '❌'}`);

  // Check if search panel exists
  const searchPanel = page.locator('#search-panel');
  const panelExists = await searchPanel.count() > 0;
  console.log(`Search panel exists: ${panelExists ? '✅' : '❌'}`);

  if (panelExists) {
    // Check initial state
    const isVisible = await searchPanel.isVisible();
    const displayStyle = await searchPanel.evaluate(el => window.getComputedStyle(el).display);
    console.log(`Initial state:`);
    console.log(`  isVisible: ${isVisible}`);
    console.log(`  display: ${displayStyle}\n`);

    // Click search toggle
    console.log(`Clicking search toggle...`);
    await searchToggle.click();
    await page.waitForTimeout(500);

    // Check state after click
    const isVisibleAfter = await searchPanel.isVisible();
    const displayStyleAfter = await searchPanel.evaluate(el => window.getComputedStyle(el).display);
    console.log(`After click:`);
    console.log(`  isVisible: ${isVisibleAfter} ${isVisibleAfter ? '✅' : '❌'}`);
    console.log(`  display: ${displayStyleAfter}\n`);

    // Take screenshot
    await page.screenshot({ path: 'search-panel-debug.png', fullPage: true });
    console.log(`Screenshot saved: search-panel-debug.png`);

    if (isVisibleAfter) {
      // Try search
      const searchInput = page.locator('#search-input');
      await searchInput.fill('프롬프트');
      await page.waitForTimeout(1000);

      const results = page.locator('.search-result-item');
      const count = await results.count();
      console.log(`\nSearch results: ${count} items\n`);

      if (count > 0) {
        const firstPath = await results.first().locator('.search-result-path').textContent();
        console.log(`First result: ${firstPath}`);
      }
    }
  }
});
