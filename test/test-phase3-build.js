/**
 * Phase 3 Tests: Static Site Build
 * Integration test for complete build process
 */

const { generateStaticSite } = require('../src/services/static-builder');
const path = require('path');
const fs = require('fs').promises;
const AdmZip = require('adm-zip');

const TEST_DOCS_ROOT = path.join(__dirname, '../test-source');
const TEST_OUTPUT = path.join(__dirname, 'test-output-phase3.zip');

// Mock logger
const mockLogger = {
  info: (msg, data) => console.log(`[INFO] ${msg}`, data || ''),
  error: (msg, data) => console.error(`[ERROR] ${msg}`, data || ''),
  warn: (msg, data) => console.warn(`[WARN] ${msg}`, data || '')
};

// Mock config
const mockConfig = {
  docsRoot: TEST_DOCS_ROOT
};

async function testGenerateStaticSite() {
  console.log('\n=== Test 1: generateStaticSite() ===');

  try {
    // Generate static site
    const archive = await generateStaticSite(mockConfig, mockLogger);

    console.log('✓ Archive created successfully');

    // Save to file for inspection
    const output = require('fs').createWriteStream(TEST_OUTPUT);
    archive.pipe(output);

    // Wait for archive to finish
    await new Promise((resolve, reject) => {
      output.on('close', resolve);
      output.on('error', reject);
      archive.on('error', reject);
    });

    console.log(`✓ ZIP file saved: ${TEST_OUTPUT}`);
    console.log(`  Size: ${archive.pointer()} bytes`);

    // Verify ZIP contents
    const zip = new AdmZip(TEST_OUTPUT);
    const zipEntries = zip.getEntries();

    console.log(`✓ ZIP contains ${zipEntries.length} entries`);

    // Check for required files
    const requiredFiles = [
      'data/docs-map.js',
      'data/tree-structure.json',
      'data/navigation.json',
      'index.html',
      'js/app.js'
    ];

    const missingFiles = [];
    for (const file of requiredFiles) {
      const entry = zip.getEntry(file);
      if (!entry) {
        missingFiles.push(file);
      } else {
        console.log(`  ✓ Found: ${file} (${entry.header.size} bytes)`);
      }
    }

    if (missingFiles.length > 0) {
      throw new Error(`Missing required files: ${missingFiles.join(', ')}`);
    }

    console.log('✓ All required files present');

    // Check for lib directory
    const libFiles = zipEntries.filter(e => e.entryName.startsWith('lib/'));
    console.log(`✓ Found ${libFiles.length} library files`);

    // Check for css directory
    const cssFiles = zipEntries.filter(e => e.entryName.startsWith('css/'));
    console.log(`✓ Found ${cssFiles.length} CSS files`);

    // Check for docs directory (markdown sources)
    const docFiles = zipEntries.filter(e => e.entryName.startsWith('docs/'));
    console.log(`✓ Found ${docFiles.length} markdown source files`);

    // Validate docs-map.js content
    const docsMapEntry = zip.getEntry('data/docs-map.js');
    const docsMapContent = docsMapEntry.getData().toString('utf8');

    if (!docsMapContent.includes('window.DOCS_MAP')) {
      throw new Error('docs-map.js does not define window.DOCS_MAP');
    }

    console.log('✓ docs-map.js is valid');

    // Validate tree-structure.json
    const treeEntry = zip.getEntry('data/tree-structure.json');
    const treeContent = treeEntry.getData().toString('utf8');
    const tree = JSON.parse(treeContent);

    if (!tree.dirs || !tree.files) {
      throw new Error('tree-structure.json is invalid');
    }

    console.log('✓ tree-structure.json is valid');

    // Validate navigation.json
    const navEntry = zip.getEntry('data/navigation.json');
    const navContent = navEntry.getData().toString('utf8');
    const nav = JSON.parse(navContent);

    if (!Array.isArray(nav)) {
      throw new Error('navigation.json should be an array');
    }

    console.log(`✓ navigation.json is valid (${nav.length} files)`);

    return { success: true, zipSize: archive.pointer(), entryCount: zipEntries.length };
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
  console.log('║   Phase 3: Static Site Build Tests       ║');
  console.log('╚═══════════════════════════════════════════╝');

  const results = [];

  results.push(await testGenerateStaticSite());

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

module.exports = { testGenerateStaticSite };
