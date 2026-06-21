/**
 * Markdown File Link Resolver
 *
 * Resolves a standard markdown link that points to a `.md` file into a
 * docs-root-relative file path, taking the currently viewed document's
 * location into account. The viewer uses this to open linked documents via
 * SPA navigation instead of letting the browser navigate to a `.md` URL
 * (which the server serves as a file download).
 *
 * Dual-loaded:
 *   - Browser: classic <script>, exposes `window.MdLinkResolver`
 *   - Node (tests): CommonJS, `module.exports`
 *
 * Wiki links ([[path]]) are handled separately during markdown preprocessing
 * and are out of scope here.
 */
(function () {
  'use strict';

  /**
   * Safely decode a single URL path segment (marked URL-encodes non-ASCII
   * characters such as Korean in href attributes). Falls back to the raw
   * segment on malformed input.
   * @param {string} segment
   * @returns {string}
   */
  function safeDecode(segment) {
    try {
      return decodeURIComponent(segment);
    } catch (e) {
      return segment;
    }
  }

  /**
   * @param {string} currentDocPath - Real path of the document currently open,
   *   including the .md extension (e.g. 'guide/intro.md'). May be empty.
   * @param {string} href - The raw href attribute of the clicked link.
   * @returns {{ filePath: string, hash: string } | null}
   *   filePath: docs-root-relative target path (decoded, keeps .md extension).
   *   hash: decoded fragment without '#', or '' when absent.
   *   null when href is not an internal .md link.
   */
  function resolveMarkdownLink(currentDocPath, href) {
    if (!href || typeof href !== 'string') return null;

    // Ignore links with an explicit scheme (http:, https:, mailto:, etc.)
    // and protocol-relative links (//host/...).
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null;
    if (href.startsWith('//')) return null;

    // Ignore pure fragments (same-page anchors).
    if (href.startsWith('#')) return null;

    // Split off the fragment, then any query string.
    const hashIndex = href.indexOf('#');
    const hash = hashIndex >= 0 ? safeDecode(href.slice(hashIndex + 1)) : '';
    let pathPart = hashIndex >= 0 ? href.slice(0, hashIndex) : href;

    const queryIndex = pathPart.indexOf('?');
    if (queryIndex >= 0) {
      pathPart = pathPart.slice(0, queryIndex);
    }

    if (!pathPart) return null;

    // Scope: only links targeting a .md file (case-insensitive).
    if (!/\.md$/i.test(pathPart)) return null;

    // Determine the base directory the link is relative to.
    let baseDir;
    if (pathPart.startsWith('/')) {
      // Absolute from docs root.
      baseDir = '';
      pathPart = pathPart.slice(1);
    } else {
      // Relative to the current document's directory.
      const baseSegs = (currentDocPath || '').split('/');
      baseSegs.pop(); // drop the current filename
      baseDir = baseSegs.join('/');
    }

    const combined = (baseDir ? baseDir + '/' : '') + pathPart;

    // Normalize: decode each segment and collapse '.' / '..'.
    const out = [];
    for (const rawSeg of combined.split('/')) {
      const seg = safeDecode(rawSeg);
      if (seg === '' || seg === '.') continue;
      if (seg === '..') {
        out.pop();
        continue;
      }
      out.push(seg);
    }

    if (out.length === 0) return null;

    return { filePath: out.join('/'), hash };
  }

  /**
   * Build the clean viewer URL (without basePath) for a resolved .md target.
   * Drops the .md extension, URL-encodes each path segment, and appends the
   * encoded fragment. The caller applies the basePath prefix.
   * @param {string} filePath - docs-root-relative path incl. .md
   * @param {string} [hash] - decoded fragment without '#'
   * @returns {string} e.g. '/doc/guide/setup' or '/doc/guide/setup#install'
   */
  function buildViewerHref(filePath, hash) {
    const cleanPath = String(filePath).replace(/\.md$/i, '');
    const encodedPath = cleanPath.split('/').map(encodeURIComponent).join('/');
    const encodedHash = hash ? '#' + encodeURIComponent(hash) : '';
    return `/doc/${encodedPath}${encodedHash}`;
  }

  const api = { resolveMarkdownLink, buildViewerHref };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof window !== 'undefined') {
    window.MdLinkResolver = api;
  }
})();
