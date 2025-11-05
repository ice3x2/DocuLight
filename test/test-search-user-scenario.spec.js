/**
 * User Scenario Test - Search and navigate
 * Simulate actual user interaction
 */

const { test } = require('@playwright/test');

test('User scenario: Search and click specific match', async ({ page }) => {
  // Enable console logging
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('Search') || text.includes('Scroll') || text.includes('search') || text.includes('scroll')) {
      console.log(`[Browser Console] ${text}`);
    }
  });

  console.log('\n=== User Scenario Test ===\n');

  // 1. Open DocLight
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');
  console.log('1. Opened DocLight');

  // Take screenshot
  await page.screenshot({ path: 'scenario-1-initial.png', fullPage: true });

  // 2. Click search button
  await page.locator('#search-toggle-btn').click();
  await page.waitForTimeout(500);
  console.log('2. Opened search panel');

  // Take screenshot
  await page.screenshot({ path: 'scenario-2-search-open.png', fullPage: true });

  // 3. Type search query
  await page.locator('#search-input').fill('프롬프트');
  console.log('3. Typed "프롬프트"');

  // Wait for search results
  await page.waitForTimeout(1000);

  // Take screenshot
  await page.screenshot({ path: 'scenario-3-search-results.png', fullPage: true });

  // 4. Count match items
  const matchItems = page.locator('.search-match-item');
  const matchCount = await matchItems.count();
  console.log(`4. Found ${matchCount} match items`);

  // Check if match items are visible and clickable
  if (matchCount > 0) {
    const firstMatch = matchItems.first();
    const isVisible = await firstMatch.isVisible();
    console.log(`   First match visible: ${isVisible ? '✅' : '❌'}`);

    // Get text content
    const matchText = await firstMatch.textContent();
    console.log(`   First match text: "${matchText.substring(0, 80)}..."`);
  }

  // 5. Click on a specific match item (Line 6)
  if (matchCount >= 3) {
    const thirdMatch = matchItems.nth(2); // Line 6 match
    const matchText = await thirdMatch.textContent();
    console.log(`\n5. Clicking match: "${matchText.substring(0, 60)}..."`);

    // Get scroll position before click
    const scrollBefore = await page.evaluate(() => {
      const mainContent = document.querySelector('.main-content');
      return mainContent ? mainContent.scrollTop : 0;
    });
    console.log(`   Scroll before: ${scrollBefore}px`);

    // Click the match
    await thirdMatch.click();

    // Wait for file load and scroll
    await page.waitForTimeout(2000);

    // Get scroll position after click
    const scrollAfter = await page.evaluate(() => {
      const mainContent = document.querySelector('.main-content');
      return mainContent ? mainContent.scrollTop : 0;
    });
    console.log(`   Scroll after: ${scrollAfter}px`);
    console.log(`   Scroll changed: ${scrollAfter !== scrollBefore ? '✅ YES' : '❌ NO'}`);

    // Take screenshot
    await page.screenshot({ path: 'scenario-4-after-click.png', fullPage: true });

    // Get breadcrumb
    const breadcrumb = await page.locator('#breadcrumb').textContent();
    console.log(`   Loaded file: ${breadcrumb}`);

    // Check if tree controls are visible
    const treeControlsVisible = await page.locator('#tree-controls').isVisible();
    console.log(`   Icons visible: ${treeControlsVisible ? '✅' : '❌'}`);
  }

  console.log('\n=== Test Complete ===\n');
});
