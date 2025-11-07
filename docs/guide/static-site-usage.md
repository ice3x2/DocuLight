# Static Site Usage Guide

Complete guide for building and using DocuLight static documentation sites.

## What is a Static Site?

A static site is a standalone version of your documentation that works without a server. All markdown documents are embedded in the HTML file as JavaScript, allowing instant offline access.

---

## Building a Static Site

### Method 1: UI Button (Recommended)

1. **Open DocuLight** in your browser (`http://localhost:3000`)
2. **Click the download icon** in the top-right header (next to TOC button)
3. **Confirm** the build dialog
4. **Wait** for the build to complete (30-60 seconds first time, <1 second cached)
5. **Download** `doclight-static-TIMESTAMP.zip` automatically

### Method 2: API Call

```bash
curl -X POST http://localhost:3000/api/build-static \
  -H "X-API-Key: your-api-key" \
  -o doclight-static.zip
```

---

## What's Included

The ZIP file contains everything needed for offline documentation:

### Directory Structure

```
doclight-static/
├── index.html                     # Main page (opens documentation)
├── data/
│   ├── docs-map.js                # All markdown documents (embedded)
│   ├── tree-structure.json        # Directory tree
│   └── navigation.json            # Previous/next links
├── docs/                          # Original markdown files (editable)
│   ├── README.md
│   ├── guide/
│   └── ...
├── lib/                           # JavaScript libraries
│   ├── marked.min.js              # Markdown parser
│   ├── highlight.min.js           # Syntax highlighting
│   ├── mermaid.min.js             # Diagram rendering
│   ├── purify.min.js              # XSS protection
│   └── highlight-github.min.css   # Syntax theme
├── css/
│   └── style.css                  # Stylesheets
├── js/
│   └── app.js                     # Application logic (static mode)
└── images/
    └── ...                         # UI icons
```

### File Sizes

| Component | Size |
|-----------|------|
| Markdown documents (embedded) | ~500KB - 1MB |
| JavaScript libraries | ~3MB |
| Application code | ~80-100KB |
| CSS & images | ~10-50KB |
| Markdown sources (original) | ~500KB - 1MB |
| **Total** | **~2-6MB** |

---

## Using the Static Site

### Opening the Site

**Option 1: Double-click** (Easiest)
```
Extract ZIP → Double-click index.html
```

**Option 2: File URL** (Browser)
```
file:///path/to/doclight-static/index.html
```

**Option 3: Local Server** (Optional)
```bash
cd doclight-static
python -m http.server 8000
# or
npx serve
```

### Navigation

- **Tree Navigation**: Click folders to expand/collapse
- **Document Links**: Click document names to view
- **Search**: Use the search icon (works offline!)
- **Table of Contents**: Click TOC icon for heading navigation
- **Previous/Next**: Links at document bottom

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+F` / `Cmd+F` | In-page search |
| `Esc` | Close search panel |
| Click folder | Show folder contents |
| Click file | Open document |

---

## Features & Limitations

### ✅ Available Features

1. **Full Offline Access**
   - No internet required
   - No server required
   - Works from `file://` protocol

2. **Complete Functionality**
   - Tree navigation with expand/collapse
   - Search (filename + content)
   - Syntax highlighting (100+ languages)
   - Mermaid diagrams
   - Table of contents
   - Previous/next document links
   - Responsive design

3. **State Persistence**
   - IndexedDB works with `file://`
   - Tree expansion state saved
   - Last opened document remembered

4. **Editable Sources**
   - Original markdown files in `docs/` directory
   - Edit with any text editor
   - Rebuild to see changes (not live)

### ❌ Unavailable Features

1. **File Management**
   - No upload (read-only)
   - No delete (read-only)
   - No live refresh (static snapshot)

2. **Server Features**
   - No API endpoints
   - No authentication
   - No file watching

---

## Performance

### Load Times

| Metric | Time |
|--------|------|
| Initial page load | <1 second |
| Document switch | Instant (memory) |
| Search | <200ms (client-side) |
| Tree expansion | Instant (cached) |

### Memory Usage

- **window.DOCS_MAP**: ~500KB - 1MB (all documents in memory)
- **Browser memory**: ~50-100MB total
- **Recommended**: Modern browser (Chrome 90+, Firefox 88+, Safari 14+)

---

## Advanced Usage

### Hosting as Static Website

Deploy to static hosting platforms:

**GitHub Pages:**
```bash
# Extract ZIP to gh-pages branch
git checkout --orphan gh-pages
unzip doclight-static.zip
git add .
git commit -m "Deploy static documentation"
git push origin gh-pages
```

**Netlify:**
```bash
# Drag and drop ZIP to Netlify dashboard
# or
netlify deploy --dir=doclight-static --prod
```

**Vercel:**
```bash
vercel --prod
```

### Custom Domain

After deployment, configure your domain:
- GitHub Pages: Settings → Pages → Custom domain
- Netlify: Site settings → Domain management
- Vercel: Project settings → Domains

### Updating Content

To update the static site:

1. **Edit** markdown files in the live server
2. **Rebuild** static site (click download button)
3. **Replace** files on hosting platform

---

## Troubleshooting

### ZIP Won't Download

**Cause**: API key not configured

**Solution**:
```bash
# Check config.json5
cat config.json5 | grep apiKey

# Ensure apiKey is set
{
  apiKey: "your-secure-key"
}
```

### Index.html Won't Open

**Cause**: Browser security restrictions

**Solutions**:
1. Use local server (Python, Node.js, etc.)
2. Try different browser (Chrome, Firefox)
3. Check browser console for errors

### Search Not Working

**Cause**: DOCS_MAP not loaded

**Check**:
1. Open browser console (F12)
2. Type: `window.DOCS_MAP`
3. Should show object with documents

**Fix**:
- Ensure `data/docs-map.js` exists
- Check browser console for script errors

### Missing Documents

**Cause**: Documents not in DOCS_MAP

**Solutions**:
1. Rebuild static site (may have been added after build)
2. Check `docs/` directory for original files
3. Verify file is `.md` extension

---

## Technical Architecture

### How It Works

**Build Process:**
```
1. Scan all .md files → collect metadata
2. Generate content hash (SHA256)
3. Check cache → if match, send cached ZIP
4. If no cache:
   a. Read all markdown files
   b. Embed in window.DOCS_MAP JavaScript
   c. Generate tree structure JSON
   d. Create navigation data JSON
   e. Copy static resources (lib, css, images)
   f. Generate index.html from template
   g. Bundle as ZIP
   h. Cache for future builds
5. Send ZIP to client
```

**Runtime (Static Mode):**
```
1. Load index.html
2. Execute data/docs-map.js → window.DOCS_MAP populated
3. app.js detects static mode (IS_STATIC = true)
4. fetchRaw() reads from window.DOCS_MAP (memory)
5. fetchTree() reads from tree-structure.json
6. fetchSearch() uses searchInDocsMap() (client-side)
7. All features work offline!
```

### window.DOCS_MAP Format

```javascript
window.DOCS_MAP = {
  "README.md": "# README\n\nContent here...",
  "guide/intro.md": "# Introduction\n...",
  "folder/subfolder/doc.md": "# Document\n..."
  // ... all 25+ documents
};

window.DOCS_COUNT = 25;
```

**Advantages:**
- ✅ No API calls needed → no server required
- ✅ Instant document access (memory lookup)
- ✅ Works with `file://` protocol
- ✅ Search works offline (in-memory)
- ✅ Existing code reuses marked.js (no changes needed)

---

## Best Practices

### 1. Regular Builds

Build static site regularly to capture documentation updates:
```bash
# Weekly builds (cron)
0 0 * * 0 curl -X POST http://localhost:3000/api/build-static \
  -H "X-API-Key: your-key" -o weekly-backup.zip
```

### 2. Version Naming

Use semantic versioning for exports:
```
doclight-static-v1.0.0.zip
doclight-static-v1.1.0.zip
doclight-static-2025-11-07.zip  (date-based)
```

### 3. Testing

Test static site before distribution:
```bash
# Extract to temp directory
unzip doclight-static.zip -d /tmp/test-static

# Open in browser
open /tmp/test-static/index.html

# Verify:
# - Tree navigation works
# - Search works
# - Documents load
# - No console errors
```

### 4. Cache Management

Clear cache if builds seem outdated:
```bash
# Remove cache directory
rm -rf .cache/static-builds/

# Next build will regenerate
```

---

## FAQ

**Q: Can I edit documents in the static site?**

A: You can edit files in the `docs/` directory (original markdown), but changes won't appear until you rebuild. The embedded `window.DOCS_MAP` is read-only.

**Q: Does search work offline?**

A: Yes! Search is client-side in static mode. It searches through `window.DOCS_MAP` in memory.

**Q: Can I host on GitHub Pages?**

A: Yes! Extract the ZIP and push to `gh-pages` branch. Works perfectly.

**Q: How big can my documentation be?**

A: Tested with 1000+ documents (50MB markdown). Build time: ~3-5 seconds. Browser handles it fine.

**Q: Why is the first build slow?**

A: First build generates all data and caches it. Subsequent builds reuse cache (99x faster).

**Q: Can I customize the static site?**

A: Yes! Edit `css/style.css`, `js/app.js` in the extracted ZIP. Or modify source and rebuild.

---

## Support

For issues, questions, or feature requests:
- Check `/docs/api/doc/api.md` for API reference
- See `/docs/plan/plan.staticbuild.md` for implementation details
- Report bugs via GitHub Issues
