/**
 * Phase 2 Tests: Tree Generator
 * Tests for tree structure building and DFS file list generation
 */

const { buildTreeStructure, flattenTreeDFS, addNavigationInfo } = require('../src/services/static-builder');
const path = require('path');

const TEST_DOCS_ROOT = path.join(__dirname, '../test-source');

async function testBuildTreeStructure() {
  console.log('\n=== Test 1: buildTreeStructure() ===');

  try {
    const tree = await buildTreeStructure(TEST_DOCS_ROOT);

    console.log(`✓ Tree structure built successfully`);

    // Verify tree has dirs and files properties
    if (!Array.isArray(tree.dirs) || !Array.isArray(tree.files)) {
      throw new Error('Tree should have dirs and files arrays');
    }

    console.log(`  Directories: ${tree.dirs.length}`);
    console.log(`  Files at root: ${tree.files.length}`);

    // Verify directories have nested structure
    let totalDirs = tree.dirs.length;
    let totalFiles = tree.files.length;

    function countItems(node) {
      if (node.dirs) {
        totalDirs += node.dirs.length;
        node.dirs.forEach(countItems);
      }
      if (node.files) {
        totalFiles += node.files.length;
      }
    }

    tree.dirs.forEach(countItems);

    console.log(`✓ Total directories: ${totalDirs}`);
    console.log(`✓ Total files: ${totalFiles}`);

    // Verify files have required properties
    if (tree.files.length > 0) {
      const sampleFile = tree.files[0];
      if (!sampleFile.name || typeof sampleFile.size !== 'number') {
        throw new Error('File should have name and size properties');
      }
      console.log(`✓ File properties are valid`);
    }

    // Verify nested directory structure
    if (tree.dirs.length > 0) {
      const sampleDir = tree.dirs[0];
      if (!sampleDir.name || !sampleDir.dirs || !sampleDir.files) {
        throw new Error('Directory should have name, dirs, and files properties');
      }
      console.log(`✓ Nested directory structure is valid`);
    }

    return { success: true, totalDirs, totalFiles };
  } catch (error) {
    console.error('✗ Test failed:', error.message);
    return { success: false, error: error.message };
  }
}

async function testFlattenTreeDFS() {
  console.log('\n=== Test 2: flattenTreeDFS() ===');

  try {
    const tree = await buildTreeStructure(TEST_DOCS_ROOT);
    const fileList = flattenTreeDFS(tree);

    console.log(`✓ Flattened ${fileList.length} files`);

    // Verify it's an array
    if (!Array.isArray(fileList)) {
      throw new Error('flattenTreeDFS should return an array');
    }

    // Verify all items have path and name
    for (const file of fileList) {
      if (!file.path || !file.name) {
        throw new Error('Each file should have path and name properties');
      }
    }

    console.log(`✓ All files have required properties`);

    // Verify DFS order (directories should come before root files)
    // Log first few files to verify order
    console.log('  DFS order sample:');
    fileList.slice(0, 5).forEach((file, i) => {
      console.log(`    ${i + 1}. ${file.path}`);
    });

    // Verify paths are valid
    const invalidPaths = fileList.filter(f => !f.path || f.path.includes('\\'));
    if (invalidPaths.length > 0) {
      throw new Error('Found invalid paths');
    }

    console.log(`✓ All paths are valid (forward slashes)`);

    return { success: true, fileCount: fileList.length };
  } catch (error) {
    console.error('✗ Test failed:', error.message);
    return { success: false, error: error.message };
  }
}

async function testAddNavigationInfo() {
  console.log('\n=== Test 3: addNavigationInfo() ===');

  try {
    const tree = await buildTreeStructure(TEST_DOCS_ROOT);
    const fileList = flattenTreeDFS(tree);
    const navList = addNavigationInfo(fileList);

    console.log(`✓ Added navigation info to ${navList.length} files`);

    // Verify same length
    if (navList.length !== fileList.length) {
      throw new Error('Navigation list should have same length as file list');
    }

    console.log(`✓ Length is consistent`);

    // Verify first file has no prev
    if (navList[0].prev !== null) {
      throw new Error('First file should have prev = null');
    }

    console.log(`✓ First file has no previous`);

    // Verify last file has no next
    if (navList[navList.length - 1].next !== null) {
      throw new Error('Last file should have next = null');
    }

    console.log(`✓ Last file has no next`);

    // Verify middle files have both prev and next
    if (navList.length > 2) {
      const middleFile = navList[Math.floor(navList.length / 2)];
      if (!middleFile.prev || !middleFile.next) {
        throw new Error('Middle files should have both prev and next');
      }
      console.log(`✓ Middle files have both prev and next`);
      console.log(`    Example: ${middleFile.path}`);
      console.log(`      prev: ${middleFile.prev}`);
      console.log(`      next: ${middleFile.next}`);
    }

    // Verify navigation chain is consistent
    for (let i = 1; i < navList.length; i++) {
      const current = navList[i];
      const previous = navList[i - 1];

      if (current.prev !== previous.path) {
        throw new Error(`Navigation chain broken at index ${i}`);
      }
    }

    console.log(`✓ Navigation chain is consistent`);

    return { success: true, navListLength: navList.length };
  } catch (error) {
    console.error('✗ Test failed:', error.message);
    return { success: false, error: error.message };
  }
}

async function testTreeSorting() {
  console.log('\n=== Test 4: Tree Sorting ===');

  try {
    const tree = await buildTreeStructure(TEST_DOCS_ROOT);

    // Verify directories are sorted
    for (let i = 1; i < tree.dirs.length; i++) {
      const prev = tree.dirs[i - 1].name;
      const curr = tree.dirs[i].name;

      const comparison = prev.localeCompare(curr, undefined, { numeric: true, sensitivity: 'base' });
      if (comparison > 0) {
        throw new Error(`Directories not sorted: ${prev} should come before ${curr}`);
      }
    }

    console.log(`✓ Directories are sorted correctly`);

    // Verify files are sorted
    for (let i = 1; i < tree.files.length; i++) {
      const prev = tree.files[i - 1].name;
      const curr = tree.files[i].name;

      const comparison = prev.localeCompare(curr, undefined, { numeric: true, sensitivity: 'base' });
      if (comparison > 0) {
        throw new Error(`Files not sorted: ${prev} should come before ${curr}`);
      }
    }

    console.log(`✓ Files are sorted correctly`);

    return { success: true };
  } catch (error) {
    console.error('✗ Test failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Run all tests
async function runAllTests() {
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║   Phase 2: Tree Generator Tests          ║');
  console.log('╚═══════════════════════════════════════════╝');

  const results = [];

  results.push(await testBuildTreeStructure());
  results.push(await testFlattenTreeDFS());
  results.push(await testAddNavigationInfo());
  results.push(await testTreeSorting());

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

module.exports = { testBuildTreeStructure, testFlattenTreeDFS, testAddNavigationInfo, testTreeSorting };
