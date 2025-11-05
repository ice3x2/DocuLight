/**
 * Test specific URL issue - Empty page problem
 */

const { chromium } = require('playwright');

async function testUrlIssue() {
  console.log('🧪 Testing URL Issue\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Collect console messages
  const consoleMessages = [];
  page.on('console', msg => {
    consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
  });

  // Collect errors
  const errors = [];
  page.on('pageerror', error => {
    errors.push(error.message);
  });

  try {
    const url = 'http://localhost:3000/doc/%ED%94%84%EB%A1%AC%ED%94%84%ED%8A%B8%20%EA%B0%95%EC%9D%98/6%EA%B0%95.%20LangChain4j%20%EA%B8%B0%EB%B0%98%20RAG%20%EC%84%A4%EA%B3%84%20%EB%B0%8F%20%EC%A7%80%EC%8B%9D%20%EA%B8%B0%EB%B0%98%20%ED%94%84%EB%A1%AC%ED%94%84%ED%8A%B8%20%EC%A0%84%EB%9E%B5';

    console.log('Navigating to:', url);
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Take screenshot
    await page.screenshot({ path: 'url-issue-screenshot.png', fullPage: true });
    console.log('✅ Screenshot saved: url-issue-screenshot.png\n');

    // Check sidebar
    const sidebarItems = await page.locator('.tree-item').count();
    console.log(`Sidebar items count: ${sidebarItems}`);

    // Check main content
    const mainContent = await page.locator('.markdown-content').innerHTML();
    const contentLength = mainContent.length;
    console.log(`Main content length: ${contentLength} characters`);

    // Check if welcome screen is showing
    const welcomeVisible = await page.locator('.welcome').count();
    console.log(`Welcome screen visible: ${welcomeVisible > 0}`);

    // Check breadcrumb
    const breadcrumb = await page.locator('#breadcrumb').textContent();
    console.log(`Breadcrumb: "${breadcrumb}"`);

    // Check if document is loaded
    const documentTitle = await page.locator('.document-title').count();
    console.log(`Document title visible: ${documentTitle > 0}`);

    // Check IndexedDB
    const lastOpened = await page.evaluate(async () => {
      const dbRequest = indexedDB.open('DocuLight', 2);
      return new Promise((resolve) => {
        dbRequest.onsuccess = () => {
          const db = dbRequest.result;
          const tx = db.transaction('lastOpened', 'readonly');
          const store = tx.objectStore('lastOpened');
          const request = store.get('file');

          request.onsuccess = () => {
            resolve(request.result);
          };
          request.onerror = () => {
            resolve(null);
          };
        };
        dbRequest.onerror = () => {
          resolve(null);
        };
      });
    });

    console.log(`\nIndexedDB lastOpened:`, lastOpened);

    // Print console messages
    console.log(`\n📋 Console Messages (${consoleMessages.length}):`);
    consoleMessages.forEach(msg => console.log(`  ${msg}`));

    // Print errors
    if (errors.length > 0) {
      console.log(`\n❌ Page Errors (${errors.length}):`);
      errors.forEach(err => console.log(`  ${err}`));
    }

    // Diagnosis
    console.log('\n═══════════════════════════════════════');
    console.log('🔍 Diagnosis');
    console.log('═══════════════════════════════════════');

    if (sidebarItems === 0) {
      console.log('❌ ISSUE: Sidebar is empty');
      console.log('   Possible causes:');
      console.log('   - Tree loading failed');
      console.log('   - Network error');
      console.log('   - JavaScript error during init');
    }

    if (welcomeVisible > 0 && breadcrumb === 'Select a document') {
      console.log('❌ ISSUE: Still showing welcome screen');
      console.log('   Possible causes:');
      console.log('   - File path not recognized from URL');
      console.log('   - loadFile() not called');
      console.log('   - Path decoding issue');
    }

    if (documentTitle === 0 && welcomeVisible === 0) {
      console.log('❌ ISSUE: No content visible');
      console.log('   Possible causes:');
      console.log('   - Content rendering failed');
      console.log('   - File fetch failed');
      console.log('   - renderMarkdown() error');
    }

    // Keep browser open for inspection
    console.log('\n⏳ Keeping browser open for 30 seconds...');
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    await browser.close();
  }
}

testUrlIssue();
