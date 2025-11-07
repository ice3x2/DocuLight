/**
 * Phase 4-5 Integration Tests
 * Tests for index.html generation and app.js static mode support
 */

const { generateStaticSite, generateIndexHTML } = require('../src/services/static-builder');
const path = require('path');
const fs = require('fs').promises;
const AdmZip = require('adm-zip');

const TEST_DOCS_ROOT = path.join(__dirname, '../test-source');
const TEST_OUTPUT = path.join(__dirname, 'test-output-phase4-5.zip');

// Mock logger
const mockLogger = {
  info: (msg, data) => console.log(`[INFO] ${msg}`, data || ''),
  error: (msg, data) => console.error(`[ERROR] ${msg}`, data || ''),
  warn: (msg, data) => console.warn(`[WARN] ${msg}`, data || '')
};

// Mock config
const mockConfig = {
  docsRoot: TEST_DOCS_ROOT,
  ui: {
    title: 'Test DocLight',
    icon: '/images/test-icon.png',
    maxWidth: '1400px'
  }
};

async function testGenerateIndexHTML() {
  console.log('\n=== Test 1: generateIndexHTML() ===');

  try {
    const html = await generateIndexHTML(mockConfig);

    console.log('✓ index.html generated');

    // Verify it's a string
    if (typeof html !== 'string') {
      throw new Error('generateIndexHTML should return a string');
    }

    // Verify basic HTML structure
    if (!html.includes('<!DOCTYPE html>')) {
      throw new Error('Missing DOCTYPE declaration');
    }

    console.log('✓ Valid HTML structure');

    // Verify EJS variables were replaced
    if (html.includes('<%=')) {
      throw new Error('EJS variables not replaced');
    }

    console.log('✓ EJS variables replaced');

    // Verify config values are present
    if (!html.includes('Test DocLight')) {
      throw new Error('Config title not found');
    }

    if (!html.includes('1400px')) {
      throw new Error('Config maxWidth not found');
    }

    console.log('✓ Config values injected correctly');

    // Verify docs-map.js is loaded
    if (!html.includes('data/docs-map.js')) {
      throw new Error('docs-map.js script not added');
    }

    console.log('✓ docs-map.js script added');

    // Verify refresh button is removed
    if (html.includes('id="refresh-btn"')) {
      throw new Error('Refresh button not removed');
    }

    console.log('✓ Refresh button removed');

    return { success: true, htmlLength: html.length };
  } catch (error) {
    console.error('✗ Test failed:', error.message);
    return { success: false, error: error.message };
  }
}

async function testStaticSiteBuild() {
  console.log('\n=== Test 2: Complete Static Site Build ===');

  try {
    // Generate static site
    const archive = await generateStaticSite(mockConfig, mockLogger);

    // Save to file
    const output = require('fs').createWriteStream(TEST_OUTPUT);
    archive.pipe(output);

    await new Promise((resolve, reject) => {
      output.on('close', resolve);
      output.on('error', reject);
      archive.on('error', reject);
    });

    console.log(`✓ ZIP file created: ${TEST_OUTPUT}`);

    // Extract and verify
    const zip = new AdmZip(TEST_OUTPUT);
    const zipEntries = zip.getEntries();

    console.log(`✓ ZIP contains ${zipEntries.length} entries`);

    // Verify index.html content
    const indexEntry = zip.getEntry('index.html');
    if (!indexEntry) {
      throw new Error('index.html not found in ZIP');
    }

    const indexContent = indexEntry.getData().toString('utf8');

    // Check EJS variables are replaced
    if (indexContent.includes('<%=')) {
      throw new Error('index.html still contains EJS variables');
    }

    console.log('✓ index.html has no EJS variables');

    // Check config values
    if (!indexContent.includes('Test DocLight')) {
      throw new Error('Config title not in index.html');
    }

    console.log('✓ index.html contains config values');

    // Check docs-map.js script
    if (!indexContent.includes('data/docs-map.js')) {
      throw new Error('docs-map.js not loaded in index.html');
    }

    console.log('✓ docs-map.js loaded in index.html');

    // Check refresh button removed
    if (indexContent.includes('id="refresh-btn"')) {
      throw new Error('Refresh button not removed from index.html');
    }

    console.log('✓ Refresh button removed from index.html');

    // Verify app.js content
    const appJsEntry = zip.getEntry('js/app.js');
    if (!appJsEntry) {
      throw new Error('app.js not found in ZIP');
    }

    const appJsContent = appJsEntry.getData().toString('utf8');

    // Check for static mode support functions
    const requiredFunctions = [
      'getSubTree',
      'searchInDocsMap',
      'window.DOCS_MAP',
      'window.TREE_STRUCTURE'
    ];

    for (const func of requiredFunctions) {
      if (!appJsContent.includes(func)) {
        throw new Error(`app.js missing: ${func}`);
      }
    }

    console.log('✓ app.js contains static mode support functions');

    return { success: true, zipSize: archive.pointer() };
  } catch (error) {
    console.error('✗ Test failed:', error.message);
    return { success: false, error: error.message };
  } finally {
    // Cleanup
    try {
      await fs.unlink(TEST_OUTPUT);
      console.log('  Cleanup: Test ZIP removed');
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

// Run all tests
async function runAllTests() {
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║   Phase 4-5: Integration Tests            ║');
  console.log('╚═══════════════════════════════════════════╝');

  const results = [];

  results.push(await testGenerateIndexHTML());
  results.push(await testStaticSiteBuild());

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('TEST SUMMARY');
  console.log('='.repeat(50));

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`Total: ${results.length} tests`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    results.forEach((r, i) => {
      if (!r.success) {
        console.log(`  ${i + 1}. ${r.error}`);
      }
    });
    process.exit(1);
  } else {
    console.log('\n✓ All tests passed!');
    process.exit(0);
  }
}

// Run tests if executed directly
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { testGenerateIndexHTML, testStaticSiteBuild };
