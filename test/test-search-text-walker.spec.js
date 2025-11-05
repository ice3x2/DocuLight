/**
 * Test TreeWalker text matching
 * Debug why text cannot be found in rendered content
 */

const { test } = require('@playwright/test');

test('Debug TreeWalker text matching', async ({ page }) => {
  page.on('console', msg => console.log(`[Browser] ${msg.text()}`));

  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');

  // Load a specific document
  await page.evaluate(() => {
    loadFile('프롬프트 강의/8강. 프롬프트 DevOps - LLM 응답 품질 유지와 지속 개선 전략.md');
  });

  await page.waitForTimeout(2000);

  // Try to find the text using TreeWalker
  const result = await page.evaluate(() => {
    const searchText = '따라서 프롬프트도 소프트웨어 코드와 동일한 엄격함으로 다뤄야';
    const contentDiv = document.getElementById('markdown-content');

    if (!contentDiv) {
      return { error: 'Content div not found' };
    }

    const walker = document.createTreeWalker(
      contentDiv,
      NodeFilter.SHOW_TEXT,
      null
    );

    const allTexts = [];
    let node;
    let foundNode = null;

    while (node = walker.nextNode()) {
      const text = node.textContent;
      allTexts.push(text.substring(0, 100));

      if (text.includes(searchText.substring(0, 20))) {
        foundNode = {
          text: text.substring(0, 200),
          matched: true
        };
      }
    }

    return {
      totalNodes: allTexts.length,
      firstFewTexts: allTexts.slice(0, 10),
      searchText: searchText.substring(0, 50),
      found: foundNode
    };
  });

  console.log('\n=== TreeWalker Debug ===\n');
  console.log(`Total text nodes: ${result.totalNodes}`);
  console.log(`Search text: "${result.searchText}"`);
  console.log(`Found: ${result.found ? '✅' : '❌'}`);

  if (result.found) {
    console.log(`\nMatched node text: "${result.found.text.substring(0, 100)}..."`);
  }

  console.log(`\nFirst few text nodes:`);
  result.firstFewTexts.forEach((text, idx) => {
    console.log(`  ${idx + 1}. "${text}"`);
  });
});
