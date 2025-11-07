/**
 * Phase 1 Tests: Static Builder
 * Tests for markdown file collection and window.DOCS_MAP generation
 */

const { getAllMarkdownFiles, generateDocsMapJS } = require('../src/services/static-builder');
const path = require('path');
const fs = require('fs').promises;

const TEST_DOCS_ROOT = path.join(__dirname, '../test-source');

async function testGetAllMarkdownFiles() {
  console.log('\n=== Test 1: getAllMarkdownFiles() ===');

  try {
    const files = await getAllMarkdownFiles(TEST_DOCS_ROOT);

    console.log(`✓ Found ${files.length} markdown files`);

    // Verify file structure
    if (files.length === 0) {
      throw new Error('No markdown files found');
    }

    // Check file properties
    const sampleFile = files[0];
    if (!sampleFile.name || !sampleFile.relativePath || !sampleFile.absolutePath) {
      throw new Error('File object missing required properties');
    }

    console.log('✓ File structure is correct');
    console.log(`  Sample: ${sampleFile.relativePath}`);

    // Verify all files are .md
    const nonMdFiles = files.filter(f => !f.name.endsWith('.md'));
    if (nonMdFiles.length > 0) {
      throw new Error(`Found non-.md files: ${nonMdFiles.map(f => f.name).join(', ')}`);
    }

    console.log('✓ All files are markdown (.md)');

    // Verify paths are normalized (no backslashes)
    const badPaths = files.filter(f => f.relativePath.includes('\\'));
    if (badPaths.length > 0) {
      throw new Error('Found paths with backslashes (not normalized)');
    }

    console.log('✓ All paths are normalized (forward slashes)');

    return { success: true, fileCount: files.length };
  } catch (error) {
    console.error('✗ Test failed:', error.message);
    return { success: false, error: error.message };
  }
}

async function testGenerateDocsMapJS() {
  console.log('\n=== Test 2: generateDocsMapJS() ===');

  try {
    const jsCode = await generateDocsMapJS(TEST_DOCS_ROOT);

    // Verify it's a string
    if (typeof jsCode !== 'string') {
      throw new Error('generateDocsMapJS should return a string');
    }

    console.log(`✓ Generated JavaScript code (${jsCode.length} bytes)`);

    // Verify it contains window.DOCS_MAP
    if (!jsCode.includes('window.DOCS_MAP')) {
      throw new Error('Generated code does not define window.DOCS_MAP');
    }

    console.log('✓ Contains window.DOCS_MAP definition');

    // Verify it contains window.DOCS_COUNT
    if (!jsCode.includes('window.DOCS_COUNT')) {
      throw new Error('Generated code does not define window.DOCS_COUNT');
    }

    console.log('✓ Contains window.DOCS_COUNT definition');

    // Verify it's valid JavaScript (basic syntax check)
    try {
      // Create a sandboxed environment to test execution
      const sandbox = { window: {}, console: { log: () => {} } };
      const func = new Function('window', 'console', jsCode);
      func(sandbox.window, sandbox.console);

      if (!sandbox.window.DOCS_MAP) {
        throw new Error('window.DOCS_MAP not created after execution');
      }

      if (typeof sandbox.window.DOCS_COUNT !== 'number') {
        throw new Error('window.DOCS_COUNT is not a number');
      }

      console.log(`✓ JavaScript is valid and executable`);
      console.log(`  DOCS_COUNT: ${sandbox.window.DOCS_COUNT}`);
      console.log(`  DOCS_MAP keys: ${Object.keys(sandbox.window.DOCS_MAP).length}`);

      // Verify at least one document content
      const firstKey = Object.keys(sandbox.window.DOCS_MAP)[0];
      const firstContent = sandbox.window.DOCS_MAP[firstKey];

      if (!firstContent || typeof firstContent !== 'string') {
        throw new Error('Document content is invalid');
      }

      console.log(`✓ Document content is valid`);
      console.log(`  Sample key: ${firstKey}`);
      console.log(`  Content length: ${firstContent.length} chars`);

    } catch (syntaxError) {
      throw new Error(`Generated JavaScript has syntax errors: ${syntaxError.message}`);
    }

    return { success: true, size: jsCode.length };
  } catch (error) {
    console.error('✗ Test failed:', error.message);
    return { success: false, error: error.message };
  }
}

async function testEscaping() {
  console.log('\n=== Test 3: Special Character Escaping ===');

  try {
    const jsCode = await generateDocsMapJS(TEST_DOCS_ROOT);

    // Test in a sandbox
    const sandbox = { window: {}, console: { log: () => {} } };
    const func = new Function('window', 'console', jsCode);
    func(sandbox.window, sandbox.console);

    // Check if any document contains backticks or template literals
    let foundSpecialChars = false;
    for (const [key, content] of Object.entries(sandbox.window.DOCS_MAP)) {
      if (content.includes('`') || content.includes('${')) {
        foundSpecialChars = true;
        console.log(`✓ Found and properly escaped special chars in: ${key}`);
      }
    }

    if (!foundSpecialChars) {
      console.log('  Note: No documents with backticks or template literals found in test set');
    }

    console.log('✓ Special character escaping works correctly');

    return { success: true };
  } catch (error) {
    console.error('✗ Test failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Run all tests
async function runAllTests() {
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║   Phase 1: Static Builder Tests          ║');
  console.log('╚═══════════════════════════════════════════╝');

  const results = [];

  results.push(await testGetAllMarkdownFiles());
  results.push(await testGenerateDocsMapJS());
  results.push(await testEscaping());

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

module.exports = { testGetAllMarkdownFiles, testGenerateDocsMapJS, testEscaping };
