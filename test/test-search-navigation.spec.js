/**
 * Search Navigation Test
 * Test search functionality and navigation to search results
 */

const { test, expect } = require('@playwright/test');

test.describe('Search Navigation Tests', () => {
  test('Search for "프롬프트" and verify results', async ({ page }) => {
    // Navigate to DocLight
    await page.goto('http://localhost:3000');
    await page.waitForSelector('#tree-menu', { timeout: 5000 });

    // Click search toggle button
    const searchToggle = page.locator('#search-toggle-btn');
    await searchToggle.click();

    // Wait for search panel to be visible
    await page.waitForSelector('#search-panel', { state: 'visible', timeout: 3000 });

    // Type search query
    const searchInput = page.locator('#search-input');
    await searchInput.fill('프롬프트');

    // Wait for search results (300ms debounce + API call)
    await page.waitForTimeout(600);

    // Check if results appeared
    const searchResults = page.locator('.search-result-item');
    const resultCount = await searchResults.count();

    console.log(`\n=== Search Results ===`);
    console.log(`Found ${resultCount} results for "프롬프트"\n`);

    // Get first result details
    if (resultCount > 0) {
      const firstResult = searchResults.first();
      const path = await firstResult.getAttribute('data-path');
      const pathText = await firstResult.locator('.search-result-path').textContent();
      const matchCount = await firstResult.locator('.search-result-meta').textContent().catch(() => '1 match');

      console.log(`First Result:`);
      console.log(`  Path: ${pathText}`);
      console.log(`  Dataset Path: ${path}`);
      console.log(`  Matches: ${matchCount}\n`);

      // Get current scroll position before click
      const contentDiv = page.locator('#markdown-content');
      const scrollBefore = await page.evaluate(() => {
        const mainContent = document.querySelector('.main-content');
        return mainContent ? mainContent.scrollTop : 0;
      });

      console.log(`Scroll position before click: ${scrollBefore}px`);

      // Click first result
      await firstResult.click();

      // Wait for file to load
      await page.waitForTimeout(1000);

      // Check if tree controls are visible (icons should not disappear)
      const treeControls = page.locator('#tree-controls');
      const isVisible = await treeControls.isVisible();
      console.log(`Tree controls visible after click: ${isVisible} ${isVisible ? '✅' : '❌'}`);

      // Get scroll position after click
      const scrollAfter = await page.evaluate(() => {
        const mainContent = document.querySelector('.main-content');
        return mainContent ? mainContent.scrollTop : 0;
      });

      console.log(`Scroll position after click: ${scrollAfter}px`);
      console.log(`Scroll changed: ${scrollAfter !== scrollBefore ? '✅' : '❌'}\n`);

      // Take screenshot for verification
      await page.screenshot({ path: 'search-test-result.png', fullPage: true });
      console.log(`Screenshot saved: search-test-result.png`);

      // Get current breadcrumb to verify file loaded
      const breadcrumb = await page.locator('#breadcrumb').textContent();
      console.log(`\nLoaded file: ${breadcrumb}`);

      // Check if search panel is closed
      const searchPanelVisible = await page.locator('#search-panel').isVisible();
      console.log(`Search panel closed: ${!searchPanelVisible ? '✅' : '❌'}`);

      // Test second search (icons disappearing issue)
      console.log(`\n=== Testing Second Search ===`);

      // Open search again
      await searchToggle.click();
      await page.waitForTimeout(300);

      // Check if icons are still visible
      const iconsVisibleAfterSecondSearch = await treeControls.isVisible();
      console.log(`Icons visible after opening search again: ${iconsVisibleAfterSecondSearch ? '✅' : '❌'}`);

      // Take screenshot
      await page.screenshot({ path: 'search-test-second-open.png' });
      console.log(`Screenshot saved: search-test-second-open.png`);
    }
  });

  test('Check search results display for many matches', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForSelector('#tree-menu', { timeout: 5000 });

    // Open search
    await page.locator('#search-toggle-btn').click();
    await page.waitForSelector('#search-panel', { state: 'visible' });

    // Search for common term
    await page.locator('#search-input').fill('프롬프트');
    await page.waitForTimeout(600);

    // Get all results
    const results = page.locator('.search-result-item');
    const count = await results.count();

    console.log(`\n=== Search Results Display Check ===`);
    console.log(`Total results: ${count}\n`);

    // Check first few results for match display
    for (let i = 0; i < Math.min(3, count); i++) {
      const result = results.nth(i);
      const path = await result.locator('.search-result-path').textContent();
      const hasMetaInfo = await result.locator('.search-result-meta').count() > 0;

      if (hasMetaInfo) {
        const metaText = await result.locator('.search-result-meta').textContent();
        console.log(`Result ${i + 1}: ${path}`);
        console.log(`  Meta: ${metaText}`);
        console.log(`  Problem: Only shows count, not actual match locations ❌\n`);
      } else {
        console.log(`Result ${i + 1}: ${path}`);
        console.log(`  Single match displayed ✅\n`);
      }
    }

    await page.screenshot({ path: 'search-results-display.png' });
    console.log(`Screenshot saved: search-results-display.png`);
  });
});
