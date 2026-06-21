/**
 * Markdown File Link Resolver Test
 *
 * Purpose: Verify that standard markdown links pointing to .md files are
 * resolved (relative to the current document) into docs-root-relative file
 * paths, so the viewer can open them via SPA navigation instead of letting
 * the browser hit the /doc/*.md download route.
 *
 * Unit under test: resolveMarkdownLink(currentDocPath, href)
 *   → { filePath, hash } when the href is an internal .md link
 *   → null otherwise (external, fragment-only, non-.md, scheme, etc.)
 */

const { resolveMarkdownLink, buildViewerHref } = require('../public/js/md-link-resolver.js');

console.log('=== Markdown File Link Resolver Test ===\n');

const results = { passed: [], failed: [] };

function test(name, fn) {
  try {
    fn();
    results.passed.push(name);
    console.log(`✅ PASS: ${name}`);
  } catch (error) {
    results.failed.push({ name, error: error.message });
    console.log(`❌ FAIL: ${name}`);
    console.log(`   Error: ${error.message}\n`);
  }
}

function assertEqual(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${msg || 'assertEqual'}: expected ${e}, got ${a}`);
  }
}

// 1. Same-directory relative link
test('Same-directory relative .md link', () => {
  assertEqual(
    resolveMarkdownLink('guide/intro.md', 'setup.md'),
    { filePath: 'guide/setup.md', hash: '' }
  );
});

// 2. Explicit ./ prefix
test('Relative link with ./ prefix', () => {
  assertEqual(
    resolveMarkdownLink('guide/intro.md', './setup.md'),
    { filePath: 'guide/setup.md', hash: '' }
  );
});

// 3. Parent directory ../
test('Relative link with ../ parent', () => {
  assertEqual(
    resolveMarkdownLink('guide/advanced/deep.md', '../setup.md'),
    { filePath: 'guide/setup.md', hash: '' }
  );
});

// 4. Multiple parent segments
test('Relative link with multiple ../', () => {
  assertEqual(
    resolveMarkdownLink('a/b/c/d.md', '../../e.md'),
    { filePath: 'a/e.md', hash: '' }
  );
});

// 5. Absolute from docs root
test('Absolute .md link from docs root', () => {
  assertEqual(
    resolveMarkdownLink('guide/intro.md', '/api/ref.md'),
    { filePath: 'api/ref.md', hash: '' }
  );
});

// 6. Relative link with fragment
test('Relative .md link with #fragment', () => {
  assertEqual(
    resolveMarkdownLink('guide/intro.md', 'setup.md#install-now'),
    { filePath: 'guide/setup.md', hash: 'install-now' }
  );
});

// 7. Absolute link with fragment
test('Absolute .md link with #fragment', () => {
  assertEqual(
    resolveMarkdownLink('guide/intro.md', '/api/ref.md#errors'),
    { filePath: 'api/ref.md', hash: 'errors' }
  );
});

// 8. Root-level current document
test('Root-level current document, sibling link', () => {
  assertEqual(
    resolveMarkdownLink('intro.md', 'other.md'),
    { filePath: 'other.md', hash: '' }
  );
});

// 9. External https link is ignored
test('External https .md link → null', () => {
  assertEqual(resolveMarkdownLink('guide/intro.md', 'https://example.com/a.md'), null);
});

// 10. External http link is ignored
test('External http .md link → null', () => {
  assertEqual(resolveMarkdownLink('guide/intro.md', 'http://example.com/a.md'), null);
});

// 11. Protocol-relative link is ignored
test('Protocol-relative .md link → null', () => {
  assertEqual(resolveMarkdownLink('guide/intro.md', '//example.com/a.md'), null);
});

// 12. Other scheme (mailto) is ignored
test('mailto: scheme → null', () => {
  assertEqual(resolveMarkdownLink('guide/intro.md', 'mailto:user@example.md'), null);
});

// 13. Pure fragment is ignored
test('Pure #fragment → null', () => {
  assertEqual(resolveMarkdownLink('guide/intro.md', '#section'), null);
});

// 14. Non-md relative asset is ignored
test('Non-.md relative asset (image) → null', () => {
  assertEqual(resolveMarkdownLink('guide/intro.md', 'diagram.png'), null);
});

// 15. Extensionless internal link is ignored (scope: .md only)
test('Extensionless internal link → null', () => {
  assertEqual(resolveMarkdownLink('guide/intro.md', 'setup'), null);
});

// 16. Korean URL-encoded relative link is decoded
test('Korean URL-encoded relative .md link is decoded', () => {
  assertEqual(
    resolveMarkdownLink('가이드/intro.md', '%EC%84%A4%EC%A0%95.md'),
    { filePath: '가이드/설정.md', hash: '' }
  );
});

// 17. Korean (already decoded) relative link
test('Korean decoded relative .md link', () => {
  assertEqual(
    resolveMarkdownLink('가이드/intro.md', '설정.md'),
    { filePath: '가이드/설정.md', hash: '' }
  );
});

// 18. Uppercase extension is matched, original case preserved
test('Uppercase .MD extension matched', () => {
  assertEqual(
    resolveMarkdownLink('guide/intro.md', 'Setup.MD'),
    { filePath: 'guide/Setup.MD', hash: '' }
  );
});

// 19. ../ overflow beyond root collapses safely
test('../ overflow beyond root is clamped', () => {
  assertEqual(
    resolveMarkdownLink('intro.md', '../x.md'),
    { filePath: 'x.md', hash: '' }
  );
});

// 20. Query string is stripped, .md still detected
test('Query string on .md link is stripped', () => {
  assertEqual(
    resolveMarkdownLink('guide/intro.md', 'setup.md?v=2'),
    { filePath: 'guide/setup.md', hash: '' }
  );
});

// 21. Empty / nullish href → null
test('Empty href → null', () => {
  assertEqual(resolveMarkdownLink('guide/intro.md', ''), null);
});

// 22. Missing current path falls back to root resolution
test('Missing current path resolves from root', () => {
  assertEqual(
    resolveMarkdownLink('', 'setup.md'),
    { filePath: 'setup.md', hash: '' }
  );
});

// --- buildViewerHref ---

// 23. Clean viewer URL drops .md
test('buildViewerHref drops .md extension', () => {
  assertEqual(buildViewerHref('guide/setup.md', ''), '/doc/guide/setup');
});

// 24. Clean viewer URL appends fragment
test('buildViewerHref appends fragment', () => {
  assertEqual(buildViewerHref('guide/setup.md', 'install'), '/doc/guide/setup#install');
});

// 25. Clean viewer URL encodes Korean segments
test('buildViewerHref encodes Korean path segments', () => {
  const expected = '/doc/' + encodeURIComponent('가이드') + '/' + encodeURIComponent('설정');
  assertEqual(buildViewerHref('가이드/설정.md', ''), expected);
});

// 26. Clean viewer URL encodes Korean fragment
test('buildViewerHref encodes Korean fragment', () => {
  const expected = '/doc/a/b#' + encodeURIComponent('설치');
  assertEqual(buildViewerHref('a/b.md', '설치'), expected);
});

// 27. Uppercase extension is stripped
test('buildViewerHref strips uppercase .MD', () => {
  assertEqual(buildViewerHref('guide/Setup.MD', ''), '/doc/guide/Setup');
});

// Summary
console.log('\n=== Test Summary ===');
console.log(`Total tests: ${results.passed.length + results.failed.length}`);
console.log(`Passed: ${results.passed.length}`);
console.log(`Failed: ${results.failed.length}`);

if (results.failed.length > 0) {
  console.log('\n❌ Failed tests:');
  results.failed.forEach(({ name, error }) => {
    console.log(`  - ${name}: ${error}`);
  });
  process.exit(1);
} else {
  console.log('\n✅ All tests passed!');
  process.exit(0);
}
