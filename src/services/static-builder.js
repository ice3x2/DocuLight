/**
 * Static site builder service
 * Generates static HTML site with embedded markdown content
 */

const fs = require('fs').promises;
const path = require('path');
const archiver = require('archiver');
const crypto = require('crypto');

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
 * Generate index.html from EJS template
 * @param {Object} config - Application configuration
 * @returns {Promise<string>} Generated HTML content
 */
async function generateIndexHTML(config) {
  // Read EJS template
  const templatePath = path.join(__dirname, '../views/index.ejs');
  let html = await fs.readFile(templatePath, 'utf-8');

  // Replace EJS variables with config values or defaults
  const replacements = {
    '<%= title %>': config.ui?.title || 'DocLight',
    '<%= uiIcon %>': config.ui?.icon || '/images/icon.png',
    '<%= uiMaxWidth %>': config.ui?.maxWidth || '1200px',
    '<%= uiTitle %>': config.ui?.title || 'DOCU LIGHT'
  };

  for (const [ejsVar, value] of Object.entries(replacements)) {
    html = html.replace(new RegExp(ejsVar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
  }

  // Add docs-map.js script in head (before closing </head>)
  html = html.replace(
    '</head>',
    '  <script src="data/docs-map.js"></script>\n</head>'
  );

  // Remove refresh button (server-only feature)
  html = html.replace(
    /<button id="refresh-btn"[\s\S]*?<\/button>/,
    '<!-- Refresh button removed (server-only feature) -->'
  );

  return html;
}

// Cache directory paths
const CACHE_DIR = path.join(__dirname, '../../.cache/static-builds');
const CACHE_INFO_FILE = path.join(CACHE_DIR, 'cache-info.json');

/**
 * Generate content hash from all file metadata (mtime + size)
 * This hash represents the current state of all documents and resources
 * @param {string} docsRoot - Root directory path
 * @returns {Promise<Object>} Hash info with hash, fileCount, totalSize
 */
async function generateContentHash(docsRoot) {
  const files = await getAllMarkdownFiles(docsRoot);

  // Resource directories to include in hash
  const resourceDirs = [
    path.join(__dirname, '../../public/lib'),
    path.join(__dirname, '../../public/css'),
    path.join(__dirname, '../../public/js'),
    path.join(__dirname, '../../public/images')
  ];

  const allFiles = [...files];

  // Collect resource files
  for (const dir of resourceDirs) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile()) {
          allFiles.push({
            absolutePath: path.join(dir, entry.name)
          });
        }
      }
    } catch (e) {
      // Directory doesn't exist, skip
    }
  }

  // Collect metadata (mtime + size) for each file
  const metadata = [];
  for (const file of allFiles) {
    try {
      const stats = await fs.stat(file.absolutePath);
      metadata.push({
        path: file.absolutePath,
        mtime: stats.mtimeMs,
        size: stats.size
      });
    } catch (e) {
      // File access error, skip
    }
  }

  // Sort for consistency
  metadata.sort((a, b) => a.path.localeCompare(b.path));

  // Generate hash from metadata
  const hashInput = metadata.map(m => `${m.path}:${m.mtime}:${m.size}`).join('|');
  const hash = crypto.createHash('sha256').update(hashInput).digest('hex');

  return {
    hash,
    fileCount: allFiles.length,
    totalSize: metadata.reduce((sum, m) => sum + m.size, 0)
  };
}

/**
 * Check if cached build exists and is valid
 * @param {string} contentHash - Content hash to check
 * @returns {Promise<Object>} Cache info { exists, zipPath?, cachedAt? }
 */
async function getCachedBuild(contentHash) {
  try {
    // Read cache info
    const cacheInfo = JSON.parse(await fs.readFile(CACHE_INFO_FILE, 'utf-8'));

    if (cacheInfo.hash === contentHash) {
      const zipPath = path.join(CACHE_DIR, `${contentHash}.zip`);

      // Verify ZIP file exists
      await fs.access(zipPath);

      return {
        exists: true,
        zipPath: zipPath,
        cachedAt: cacheInfo.cachedAt
      };
    }
  } catch (e) {
    // Cache doesn't exist or is invalid
  }

  return { exists: false };
}

/**
 * Save built ZIP to cache
 * @param {string} contentHash - Content hash
 * @param {Buffer} zipBuffer - ZIP file buffer
 * @returns {Promise<string>} Path to saved ZIP
 */
async function saveBuildToCache(contentHash, zipBuffer) {
  // Create cache directory
  await fs.mkdir(CACHE_DIR, { recursive: true });

  const zipPath = path.join(CACHE_DIR, `${contentHash}.zip`);

  // Save ZIP
  await fs.writeFile(zipPath, zipBuffer);

  // Save cache info
  const cacheInfo = {
    hash: contentHash,
    cachedAt: new Date().toISOString(),
    zipPath: zipPath
  };
  await fs.writeFile(CACHE_INFO_FILE, JSON.stringify(cacheInfo, null, 2));

  return zipPath;
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

  // 6. Generate and add index.html from EJS template
  logger.info('Generating index.html...');
  const indexHTML = await generateIndexHTML(config);
  archive.append(indexHTML, { name: 'index.html' });

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
  generateIndexHTML,
  generateContentHash,
  getCachedBuild,
  saveBuildToCache,
  generateStaticSite
};
