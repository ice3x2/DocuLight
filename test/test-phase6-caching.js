/**
 * Phase 6 Tests: Caching and UI Integration
 * Tests for content hash generation and caching logic
 */

const {
  generateContentHash,
  getCachedBuild,
  saveBuildToCache,
  generateStaticSite
} = require('../src/services/static-builder');
const path = require('path');
const fs = require('fs').promises;

const TEST_DOCS_ROOT = path.join(__dirname, '../test-source');
const CACHE_DIR = path.join(__dirname, '../.cache/static-builds');
const CACHE_INFO_FILE = path.join(CACHE_DIR, 'cache-info.json');

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
    title: 'Test DocLight'
  }
};

async function testGenerateContentHash() {
  console.log('\n=== Test 1: generateContentHash() ===');

  try {
    const result = await generateContentHash(TEST_DOCS_ROOT);

    console.log(`✓ Content hash generated`);
    console.log(`  Hash: ${result.hash.substring(0, 16)}...`);
    console.log(`  Files: ${result.fileCount}`);
    console.log(`  Total size: ${result.totalSize} bytes`);

    // Verify hash is a string
    if (typeof result.hash !== 'string' || result.hash.length !== 64) {
      throw new Error('Hash should be a 64-character SHA256 string');
    }

    console.log('✓ Hash format is valid (SHA256)');

    // Verify file count is reasonable
    if (result.fileCount < 10) {
      throw new Error('File count seems too low');
    }

    console.log('✓ File count is reasonable');

    // Test hash consistency - should be same if run twice
    const result2 = await generateContentHash(TEST_DOCS_ROOT);
    if (result.hash !== result2.hash) {
      throw new Error('Hash should be consistent across runs');
    }

    console.log('✓ Hash is consistent across runs');

    return { success: true, hash: result.hash };
  } catch (error) {
    console.error('✗ Test failed:', error.message);
    return { success: false, error: error.message };
  }
}

async function testCaching() {
  console.log('\n=== Test 2: Cache Save/Load ===');

  try {
    // Clean up cache first
    try {
      await fs.rm(CACHE_DIR, { recursive: true, force: true });
      console.log('  Cache cleaned');
    } catch (e) {
      // Ignore
    }

    // Generate a test hash
    const { hash } = await generateContentHash(TEST_DOCS_ROOT);

    // Check cache (should not exist)
    let cached = await getCachedBuild(hash);
    if (cached.exists) {
      throw new Error('Cache should not exist initially');
    }

    console.log('✓ Cache initially empty');

    // Create a test ZIP buffer
    const testZipBuffer = Buffer.from('PK test zip content');

    // Save to cache
    const savedPath = await saveBuildToCache(hash, testZipBuffer);

    console.log(`✓ Cache saved to: ${savedPath}`);

    // Verify cache file exists
    const stats = await fs.stat(savedPath);
    if (!stats.isFile()) {
      throw new Error('Cache file was not created');
    }

    console.log('✓ Cache file exists');

    // Verify cache info file exists
    const cacheInfo = JSON.parse(await fs.readFile(CACHE_INFO_FILE, 'utf-8'));
    if (cacheInfo.hash !== hash) {
      throw new Error('Cache info hash mismatch');
    }

    console.log('✓ Cache info is correct');

    // Load from cache
    cached = await getCachedBuild(hash);
    if (!cached.exists) {
      throw new Error('Cache should exist after saving');
    }

    console.log('✓ Cache loaded successfully');
    console.log(`  Cached at: ${cached.cachedAt}`);

    // Verify cached file content
    const cachedContent = await fs.readFile(cached.zipPath);
    if (!cachedContent.equals(testZipBuffer)) {
      throw new Error('Cached content does not match original');
    }

    console.log('✓ Cached content matches original');

    // Test cache miss with different hash
    const differentHash = 'differenthash123456789012345678901234567890123456789012345678901234';
    const cacheMiss = await getCachedBuild(differentHash);
    if (cacheMiss.exists) {
      throw new Error('Should not find cache for different hash');
    }

    console.log('✓ Cache miss works correctly');

    // Cleanup
    await fs.rm(CACHE_DIR, { recursive: true, force: true });
    console.log('  Cache cleaned up');

    return { success: true };
  } catch (error) {
    console.error('✗ Test failed:', error.message);
    return { success: false, error: error.message };
  }
}

async function testCachedBuildPerformance() {
  console.log('\n=== Test 3: Cache Performance ===');

  try {
    // Clean cache
    try {
      await fs.rm(CACHE_DIR, { recursive: true, force: true });
    } catch (e) {
      // Ignore
    }

    // Generate hash
    const { hash } = await generateContentHash(TEST_DOCS_ROOT);

    // First build (no cache)
    console.log('  First build (no cache)...');
    const startTime1 = Date.now();

    const archive1 = await generateStaticSite(mockConfig, mockLogger);
    const chunks1 = [];
    archive1.on('data', (chunk) => chunks1.push(chunk));

    await new Promise((resolve, reject) => {
      archive1.on('end', resolve);
      archive1.on('error', reject);
    });

    const zipBuffer1 = Buffer.concat(chunks1);
    await saveBuildToCache(hash, zipBuffer1);

    const duration1 = Date.now() - startTime1;
    console.log(`  First build took: ${duration1}ms`);

    // Second build (with cache)
    console.log('  Second build (with cache)...');
    const startTime2 = Date.now();

    const cached = await getCachedBuild(hash);
    if (!cached.exists) {
      throw new Error('Cache should exist for second build');
    }

    const duration2 = Date.now() - startTime2;
    console.log(`  Cache lookup took: ${duration2}ms`);

    // Cache should be significantly faster
    if (duration2 > duration1 * 0.1) {
      console.warn(`  Warning: Cache lookup (${duration2}ms) not significantly faster than build (${duration1}ms)`);
    } else {
      console.log(`✓ Cache is ${Math.round(duration1 / duration2)}x faster than build`);
    }

    // Cleanup
    await fs.rm(CACHE_DIR, { recursive: true, force: true });

    return { success: true, buildTime: duration1, cacheTime: duration2 };
  } catch (error) {
    console.error('✗ Test failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Run all tests
async function runAllTests() {
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║   Phase 6: Caching Tests                  ║');
  console.log('╚═══════════════════════════════════════════╝');

  const results = [];

  results.push(await testGenerateContentHash());
  results.push(await testCaching());
  results.push(await testCachedBuildPerformance());

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

module.exports = { testGenerateContentHash, testCaching, testCachedBuildPerformance };
