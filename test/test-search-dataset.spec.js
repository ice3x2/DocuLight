/**
 * Search Dataset Test
 * Check if searchQuery is properly stored in dataset
 */

const { test } = require('@playwright/test');

test('Check search result dataset', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');

  // Open search
  await page.locator('#search-toggle-btn').click();
  await page.waitForTimeout(300);

  // Search
  await page.locator('#search-input').fill('프롬프트');
  await page.waitForTimeout(1000);

  // Get first result dataset
  const dataset = await page.evaluate(() => {
    const firstItem = document.querySelector('.search-result-item');
    if (firstItem) {
      return {
        path: firstItem.dataset.path,
        searchQuery: firstItem.dataset.searchQuery,
        firstMatchContent: firstItem.dataset.firstMatchContent ? firstItem.dataset.firstMatchContent.substring(0, 100) : null
      };
    }
    return null;
  });

  console.log('\n=== Search Result Dataset ===\n');
  console.log(JSON.stringify(dataset, null, 2));
  console.log('');
});
