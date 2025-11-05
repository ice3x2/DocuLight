/**
 * Search Click Test
 * Debug click event handling
 */

const { test } = require('@playwright/test');

test('Debug search result click', async ({ page }) => {
  // Enable console logging
  page.on('console', msg => console.log(`[Browser] ${msg.text()}`));

  // Hard reload to clear cache
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });

  console.log('\n=== Search Click Debug ===\n');

  // Open search
  await page.locator('#search-toggle-btn').click();
  await page.waitForTimeout(300);

  // Search
  await page.locator('#search-input').fill('프롬프트');
  await page.waitForTimeout(1000);

  // Check if search results exist
  const resultCount = await page.locator('.search-result-item').count();
  console.log(`Search results count: ${resultCount}\n`);

  // Get breadcrumb before click
  const breadcrumbBefore = await page.locator('#breadcrumb').textContent();
  console.log(`Breadcrumb before click: "${breadcrumbBefore}"`);

  // Click first result
  console.log('Clicking first search result...\n');
  await page.locator('.search-result-item').first().click();

  // Wait for navigation
  await page.waitForTimeout(3000);

  // Get breadcrumb after click
  const breadcrumbAfter = await page.locator('#breadcrumb').textContent();
  console.log(`Breadcrumb after click: "${breadcrumbAfter}"`);
  console.log(`File changed: ${breadcrumbBefore !== breadcrumbAfter ? '✅' : '❌'}\n`);
});
