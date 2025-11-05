/**
 * Search Console Log Test
 * Check console logs to debug scroll issue
 */

const { test } = require('@playwright/test');

test('Search and check console logs', async ({ page }) => {
  // Capture console messages
  const consoleMessages = [];
  page.on('console', msg => {
    consoleMessages.push({
      type: msg.type(),
      text: msg.text()
    });
  });

  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');

  // Open search
  await page.locator('#search-toggle-btn').click();
  await page.waitForTimeout(300);

  // Search
  await page.locator('#search-input').fill('프롬프트');
  await page.waitForTimeout(1000);

  // Click first result
  const firstResult = page.locator('.search-result-item').first();
  await firstResult.click();
  await page.waitForTimeout(2000); // Wait for scroll logic

  // Print console messages
  console.log('\n=== Console Messages ===\n');
  consoleMessages.forEach(msg => {
    if (msg.text.includes('Scrolled') || msg.text.includes('search') || msg.text.includes('Could not find')) {
      console.log(`[${msg.type}] ${msg.text}`);
    }
  });

  // Check if scroll happened
  const scrollPosition = await page.evaluate(() => {
    const mainContent = document.querySelector('.main-content');
    return mainContent ? mainContent.scrollTop : 0;
  });

  console.log(`\nFinal scroll position: ${scrollPosition}px`);
  console.log(`Scroll successful: ${scrollPosition > 0 ? '✅' : '❌'}\n`);
});
