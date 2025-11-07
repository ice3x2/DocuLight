/**
 * Static site builder service
 * Generates static HTML site with embedded markdown content
 */

const fs = require('fs').promises;
const path = require('path');
const archiver = require('archiver');

/**
 * Recursively collect all markdown files from a directory
 * @param {string} docsRoot - Root directory path
 * @param {string} relativePath - Current relative path (for recursion)
 * @returns {Promise<Array>} Array of file objects with name, relativePath, absolutePath
 */
async function getAllMarkdownFiles(docsRoot, relativePath = '') {
  const files = [];
  const absolutePath = path.join(docsRoot, relativePath);
  const entries = await fs.readdir(absolutePath, { withFileTypes: true });

  for (const entry of entries) {
    // Skip hidden files and directories
    if (entry.name.startsWith('.')) continue;

    const entryRelativePath = path.join(relativePath, entry.name);
    const entryAbsolutePath = path.join(absolutePath, entry.name);

    if (entry.isDirectory()) {
      // Recursively collect files from subdirectories
      const subFiles = await getAllMarkdownFiles(docsRoot, entryRelativePath);
      files.push(...subFiles);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      // Collect markdown files
      files.push({
        name: entry.name,
        relativePath: entryRelativePath.replace(/\\/g, '/'), // Normalize path separators
        absolutePath: entryAbsolutePath
      });
    }
  }

  return files;
}

/**
 * Generate window.DOCS_MAP JavaScript code with all markdown content
 * @param {string} docsRoot - Root directory path
 * @returns {Promise<string>} JavaScript code defining window.DOCS_MAP
 */
async function generateDocsMapJS(docsRoot) {
  const files = await getAllMarkdownFiles(docsRoot);

  let jsCode = '// Auto-generated: All markdown documents\n';
  jsCode += 'window.DOCS_MAP = {\n';

  for (const file of files) {
    // Read file content
    const content = await fs.readFile(file.absolutePath, 'utf-8');

    // Escape backticks and template literal syntax
    const escaped = content
      .replace(/\\/g, '\\\\')     // \ → \\
      .replace(/`/g, '\\`')       // ` → \`
      .replace(/\${/g, '\\${');   // ${ → \${

    // Use file's relative path as key, content as value
    jsCode += `  "${file.relativePath}": \`${escaped}\`,\n`;
  }

  jsCode += '};\n\n';

  // Add file count metadata
  jsCode += `window.DOCS_COUNT = ${files.length};\n`;
  jsCode += `console.log('[Static Build] ${files.length} documents loaded');\n`;

  return jsCode;
}

/**
 * Build tree structure recursively (for static site)
 * Similar to tree-service.js but simplified for static export
 * @param {string} docsRoot - Root directory path
 * @param {string} relativePath - Current relative path (for recursion)
 * @returns {Promise<Object>} Tree structure with dirs and files
 */
async function buildTreeStructure(docsRoot, relativePath = '') {
  const tree = {
    dirs: [],
    files: []
  };

  const absolutePath = path.join(docsRoot, relativePath);
  const entries = await fs.readdir(absolutePath, { withFileTypes: true });

  for (const entry of entries) {
    // Skip hidden files and directories
    if (entry.name.startsWith('.')) continue;

    const entryRelativePath = path.join(relativePath, entry.name);
    const entryAbsolutePath = path.join(absolutePath, entry.name);

    if (entry.isDirectory()) {
      // Recursively build subtree
      const subTree = await buildTreeStructure(docsRoot, entryRelativePath);
      tree.dirs.push({
        name: entry.name,
        ...subTree
      });
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const stats = await fs.stat(entryAbsolutePath);
      tree.files.push({
        name: entry.name,
        size: stats.size
      });
    }
  }

  // Sort naturally (numeric-aware)
  tree.dirs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  tree.files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  return tree;
}

/**
 * Flatten tree structure to DFS-ordered file list
 * @param {Object} tree - Tree structure from buildTreeStructure()
 * @param {string} parentPath - Parent path for recursion
 * @returns {Array} Flat array of file paths in DFS order
 */
function flattenTreeDFS(tree, parentPath = '') {
  const files = [];

  // Directories first (DFS)
  for (const dir of tree.dirs) {
    const dirPath = parentPath ? `${parentPath}/${dir.name}` : dir.name;
    const subFiles = flattenTreeDFS(dir, dirPath);
    files.push(...subFiles);
  }

  // Current level files
  for (const file of tree.files) {
    const filePath = parentPath ? `${parentPath}/${file.name}` : file.name;
    files.push({
      path: filePath,
      name: file.name
    });
  }

  return files;
}

/**
 * Add prev/next navigation info to file list
 * @param {Array} fileList - Flat file list from flattenTreeDFS()
 * @returns {Array} File list with prev/next properties
 */
function addNavigationInfo(fileList) {
  return fileList.map((file, index) => ({
    ...file,
    prev: index > 0 ? fileList[index - 1].path : null,
    next: index < fileList.length - 1 ? fileList[index + 1].path : null
  }));
}

/**
 * Generate complete static site as ZIP archive
 * @param {Object} config - Application configuration
 * @param {Object} logger - Logger instance
 * @returns {Promise<archiver>} Archive stream
 */
async function generateStaticSite(config, logger) {
  const archive = archiver('zip', {
    zlib: { level: 9 }  // Maximum compression
  });

  // Error handling
  archive.on('error', (err) => {
    logger.error('Archive error', { error: err.message });
    throw err;
  });

  archive.on('warning', (err) => {
    if (err.code !== 'ENOENT') {
      logger.warn('Archive warning', { error: err.message });
    }
  });

  // Progress logging
  archive.on('progress', (progress) => {
    logger.info('Archive progress', {
      entries: progress.entries.processed,
      bytes: progress.fs.processedBytes
    });
  });

  // 1. Generate and add window.DOCS_MAP
  logger.info('Generating DOCS_MAP...');
  const docsMapJS = await generateDocsMapJS(config.docsRoot);
  archive.append(docsMapJS, { name: 'data/docs-map.js' });

  // 2. Generate and add tree structure
  logger.info('Generating tree structure...');
  const tree = await buildTreeStructure(config.docsRoot);
  const treeJSON = JSON.stringify(tree, null, 2);
  archive.append(treeJSON, { name: 'data/tree-structure.json' });

  // 3. Generate and add navigation info
  logger.info('Generating navigation info...');
  const fileList = flattenTreeDFS(tree);
  const navInfo = addNavigationInfo(fileList);
  const navJSON = JSON.stringify(navInfo, null, 2);
  archive.append(navJSON, { name: 'data/navigation.json' });

  // 4. Add static resources (lib, css, images)
  logger.info('Adding static resources...');
  const publicDir = path.join(__dirname, '../../public');

  // Add lib directory (JavaScript libraries)
  archive.directory(path.join(publicDir, 'lib'), 'lib');

  // Add css directory
  archive.directory(path.join(publicDir, 'css'), 'css');

  // Add images directory
  archive.directory(path.join(publicDir, 'images'), 'images');

  // 5. Add markdown source files (optional, for editing)
  logger.info('Adding markdown source files...');
  archive.directory(config.docsRoot, 'docs');

  // 6. Add index.html (TODO: Phase 4 - generate from template)
  // Temporary: Use existing index.ejs as placeholder
  logger.info('Adding index.html (placeholder)...');
  const indexPlaceholder = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DocLight Static</title>
  <link rel="stylesheet" href="css/style.css">
  <script src="data/docs-map.js"></script>
</head>
<body>
  <h1>DocLight Static Site</h1>
  <p>This is a placeholder. Phase 4 will generate proper index.html.</p>
  <script src="lib/marked.min.js"></script>
  <script src="lib/highlight.min.js"></script>
  <script src="lib/mermaid.min.js"></script>
  <script src="lib/purify.min.js"></script>
  <script src="js/app.js"></script>
</body>
</html>`;
  archive.append(indexPlaceholder, { name: 'index.html' });

  // 7. Add app.js (TODO: Phase 5 - modify for static mode)
  // Temporary: Copy existing app.js
  logger.info('Adding app.js (placeholder)...');
  const appJSPath = path.join(publicDir, 'js', 'app.js');
  archive.file(appJSPath, { name: 'js/app.js' });

  // Finalize archive
  logger.info('Finalizing archive...');
  await archive.finalize();

  return archive;
}

module.exports = {
  getAllMarkdownFiles,
  generateDocsMapJS,
  buildTreeStructure,
  flattenTreeDFS,
  addNavigationInfo,
  generateStaticSite
};
