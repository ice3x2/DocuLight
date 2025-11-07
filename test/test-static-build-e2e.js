/**
 * Static Build E2E Test
 * Complete end-to-end test for static site build functionality
 */

const path = require('path');
const fs = require('fs').promises;
const AdmZip = require('adm-zip');
const {
  generateStaticSite,
  generateContentHash,
  getCachedBuild
} = require('../src/services/static-builder');
const { loadConfig } = require('../src/utils/config-loader');
const { createLogger } = require('../src/utils/logger');

const TEST_OUTPUT = path.join(__dirname, 'test-e2e-output.zip');

async function runE2ETest() {
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║   Static Build E2E Test                   ║');
  console.log('╚═══════════════════════════════════════════╝');

  let config;
  let logger;

  try {
    console.log('\n=== Setup: Loading configuration ===');

    // Load config
    config = loadConfig();
    logger = createLogger(config);

    console.log(`✓ Config loaded (docsRoot: ${config.docsRoot})`);

    // Test 1: Generate static site
    console.log('\n=== Test 1: Build Static Site ===');

    const archive = await generateStaticSite(config, logger);

    console.log('✓ Archive created');

    // Save to file
    const output = require('fs').createWriteStream(TEST_OUTPUT);
    archive.pipe(output);

    await new Promise((resolve, reject) => {
      output.on('close', resolve);
      output.on('error', reject);
      archive.on('error', reject);
    });

    console.log(`✓ ZIP saved: ${TEST_OUTPUT}`);
    console.log(`  Size: ${archive.pointer()} bytes`);

    // Test 2: Verify ZIP structure
    console.log('\n=== Test 2: ZIP Structure Validation ===');

    const zip = new AdmZip(TEST_OUTPUT);
    const entries = zip.getEntries();

    console.log(`✓ ZIP contains ${entries.length} entries`);

    // Required files
    const requiredFiles = [
      'data/docs-map.js',
      'data/tree-structure.json',
      'data/navigation.json',
      'index.html',
      'js/app.js',
      'lib/marked.min.js',
      'lib/highlight.min.js',
      'lib/mermaid.min.js',
      'lib/purify.min.js',
      'css/style.css'
    ];

    for (const file of requiredFiles) {
      const entry = zip.getEntry(file);
      if (!entry) {
        throw new Error(`Missing required file: ${file}`);
      }
      console.log(`  ✓ ${file}`);
    }

    console.log('✓ All required files present');

    // Test 3: Validate docs-map.js
    console.log('\n=== Test 3: DOCS_MAP Validation ===');

    const docsMapEntry = zip.getEntry('data/docs-map.js');
    const docsMapContent = docsMapEntry.getData().toString('utf8');

    if (!docsMapContent.includes('window.DOCS_MAP = {')) {
      throw new Error('docs-map.js does not define window.DOCS_MAP');
    }

    console.log('✓ window.DOCS_MAP defined');

    if (!docsMapContent.includes('window.DOCS_COUNT')) {
      throw new Error('docs-map.js does not define window.DOCS_COUNT');
    }

    console.log('✓ window.DOCS_COUNT defined');

    // Test execution in sandbox
    const sandbox = { window: {}, console: { log: () => {} } };
    const func = new Function('window', 'console', docsMapContent);
    func(sandbox.window, sandbox.console);

    if (!sandbox.window.DOCS_MAP || typeof sandbox.window.DOCS_MAP !== 'object') {
      throw new Error('window.DOCS_MAP is not an object');
    }

    console.log(`✓ DOCS_MAP contains ${Object.keys(sandbox.window.DOCS_MAP).length} documents`);

    // Test 4: Validate index.html
    console.log('\n=== Test 4: index.html Validation ===');

    const indexEntry = zip.getEntry('index.html');
    const indexContent = indexEntry.getData().toString('utf8');

    if (indexContent.includes('<%=')) {
      throw new Error('index.html contains unprocessed EJS variables');
    }

    console.log('✓ No EJS variables in index.html');

    if (!indexContent.includes('data/docs-map.js')) {
      throw new Error('docs-map.js not loaded in index.html');
    }

    console.log('✓ docs-map.js loaded');

    if (indexContent.includes('id="refresh-btn"')) {
      throw new Error('refresh-btn should be removed');
    }

    console.log('✓ Server-only features removed');

    // Test 5: Validate app.js static mode support
    console.log('\n=== Test 5: app.js Static Mode Support ===');

    const appJsEntry = zip.getEntry('js/app.js');
    const appJsContent = appJsEntry.getData().toString('utf8');

    const requiredPatterns = [
      'IS_STATIC',
      'IS_DYNAMIC',
      'window.DOCS_MAP',
      'getSubTree',
      'searchInDocsMap'
    ];

    for (const pattern of requiredPatterns) {
      if (!appJsContent.includes(pattern)) {
        throw new Error(`app.js missing required pattern: ${pattern}`);
      }
      console.log(`  ✓ ${pattern}`);
    }

    console.log('✓ All static mode patterns present');

    // Test 6: Validate navigation.json
    console.log('\n=== Test 6: Navigation Data Validation ===');

    const navEntry = zip.getEntry('data/navigation.json');
    const navContent = navEntry.getData().toString('utf8');
    const navData = JSON.parse(navContent);

    if (!Array.isArray(navData)) {
      throw new Error('navigation.json should be an array');
    }

    console.log(`✓ Navigation array with ${navData.length} files`);

    // Check first and last items
    if (navData[0].prev !== null) {
      throw new Error('First file should have prev = null');
    }

    if (navData[navData.length - 1].next !== null) {
      throw new Error('Last file should have next = null');
    }

    console.log('✓ Navigation chain is valid');

    // Test 7: Verify markdown sources included
    console.log('\n=== Test 7: Markdown Sources ===');

    const docFiles = entries.filter(e => e.entryName.startsWith('docs/') && e.entryName.endsWith('.md'));
    console.log(`✓ Found ${docFiles.length} markdown source files`);

    if (docFiles.length === 0) {
      throw new Error('No markdown source files in ZIP');
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('E2E TEST SUMMARY');
    console.log('='.repeat(50));
    console.log('✓ Build endpoint works');
    console.log('✓ ZIP structure valid');
    console.log('✓ DOCS_MAP generated correctly');
    console.log('✓ index.html processed correctly');
    console.log('✓ app.js has static mode support');
    console.log('✓ Navigation data valid');
    console.log('✓ Markdown sources included');
    console.log('\n✓ All E2E tests passed!');

    return true;
  } catch (error) {
    console.error('\n✗ E2E Test failed:', error.message);
    console.error(error.stack);
    return false;
  } finally {
    // Cleanup
    try {
      await fs.unlink(TEST_OUTPUT);
      console.log('\nCleanup: Test ZIP removed');
    } catch (e) {
      // Ignore
    }
  }
}

// Run test
if (require.main === module) {
  runE2ETest()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { runE2ETest };
