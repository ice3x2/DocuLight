## Step X1: 서버 측 HTML 캐싱 시스템

작성일: 2025-11-04
최종 업데이트: 2025-11-04 (요청 기반 스캔으로 수정)

### 한 줄 요약
마크다운 파일을 서버 측에서 사전 렌더링하여 HTML 캐시로 저장하고, 사용자 요청 시 비동기 스캔을 통해 자동 갱신하여 클라이언트 렌더링 성능을 획기적으로 개선한다.

---

## Executive Summary

### 현재 문제점

**성능 병목**:
- 매 요청마다 클라이언트가 마크다운 → HTML 변환
- marked.js 파싱 + DOMPurify sanitize + Mermaid 렌더링
- 큰 파일(60KB+)의 경우 렌더링 시간 500ms~2s
- 네트워크 전송 후 클라이언트 CPU 부하

**측정 데이터** (test-source 기준):
- 파일 수: 25개
- 총 크기: 876KB
- 평균 파일 크기: ~35KB
- 최대 파일 크기: ~110KB (5강. 프롬프트 테스트·평가·개선.md)

**현재 플로우**:
```
Client Request
  → Server: fs.readFile() (10-50ms)
  → Network: Transfer raw markdown (50-200ms)
  → Client: marked.parse() (100-500ms)
  → Client: DOMPurify.sanitize() (50-100ms)
  → Client: Mermaid render (200-1000ms for diagrams)
  → Total: 410-1850ms
```

### 제안 솔루션

**서버 측 HTML 캐싱**:
```
Server Startup
  → Scan all .md files
  → Pre-render to HTML
  → Cache in memory + disk

Client Request
  → Server: Memory lookup (1-5ms)
  → Network: Transfer HTML (50-200ms)
  → Client: Direct insertion (5-10ms)
  → Total: 56-215ms (70-90% faster!)
```

**핵심 수치**:
- **성능 향상**: 70-90% 렌더링 시간 단축
- **메모리 사용**: ~2-5MB (25개 파일 기준)
- **디스크 사용**: ~10-20MB (캐시 디렉토리)
- **구현 시간**: 25-37시간 (7 Phases, 요청 기반 스캔 방식)

---

## 기술적 타당성 분석

### 구현 가능성: ★★★★★ (매우 높음)

**긍정 요인**:
1. ✅ Node.js 서버 측 렌더링 가능 (marked, DOMPurify SSR 지원)
2. ✅ 메모리 관리 경험 있음 (tree-service에서 ignore 패턴 처리)
3. ✅ Lock 메커니즘 구현됨 (lock-manager.js)
4. ✅ 기존 서비스 아키텍처 확장 용이
5. ✅ 요청 기반 스캔 방식으로 서버 부하 최소화

**부정 요인**:
1. ⚠️  Mermaid SSR 복잡 (Puppeteer 필요, 이미 dependency 있음)
2. ⚠️  메모리 누수 리스크 (대량 파일 시 관리 필요)
3. ⚠️  동시 쓰기 경쟁 조건 (lock 필요)

### 난이도 평가: ★★★☆☆ (중상)

**난이도 분석**:
- **Phase 0-1** (파일 스캔): ★★☆☆☆ (쉬움)
  - 기존 tree-service 로직 재사용
  - fs.readdir recursive 패턴

- **Phase 2-3** (HTML 렌더링): ★★★★☆ (어려움)
  - 서버 측 marked, DOMPurify 설치
  - Mermaid SSR (Puppeteer)
  - TOC 생성 로직 서버로 이동

- **Phase 4-5** (캐시 관리): ★★★☆☆ (중간)
  - LRU 캐시 또는 Map 사용
  - 요청 기반 비동기 스캔
  - Throttle 로직 (스캔 간격 제어)

- **Phase 6** (API 수정): ★★☆☆☆ (쉬움)
  - /api/html 엔드포인트 추가
  - 클라이언트 코드 단순화

**위험도**:
- **메모리 누수**: 중간 (LRU 캐시로 완화)
- **디스크 공간**: 낮음 (자동 정리 구현)
- **동시성 문제**: 중간 (lock-manager 활용)
- **Mermaid SSR**: 높음 (fallback 필요)

---

## 아키텍처 설계

### 1. 캐시 매니저 (CacheManager)

**역할**: 파일 메타데이터 + HTML 캐시 관리

**데이터 구조**:
```javascript
const cacheStore = new Map(); // Key: file path, Value: CacheEntry

class CacheEntry {
  path: string;           // 파일 경로
  mtime: number;          // 수정 시간 (timestamp)
  size: number;           // 파일 크기 (bytes)
  isCached: boolean;      // 캐시 여부
  html: string | null;    // 렌더링된 HTML (nullable)
  toc: Array<Object>;     // TOC 데이터 (pre-generated)
  error: string | null;   // 렌더링 에러 (nullable)
  lastAccessed: number;   // 마지막 접근 시간 (LRU)
}
```

**주요 메서드**:
```javascript
// 파일 스캔 및 메타데이터 수집
async function scanAllFiles(docsRoot, excludes)

// 파일 렌더링 및 캐시
async function renderAndCache(filePath)

// 캐시 조회 (LRU 업데이트)
function getCache(filePath)

// 캐시 무효화 (파일 변경 시)
function invalidateCache(filePath)

// 메모리 정리 (LRU eviction)
function evictLRU(maxSize)
```

### 2. 요청 기반 스캔 매니저 (Request-Based Scan Manager)

**역할**: 사용자 요청 시 비동기 파일 스캔 및 캐시 갱신

**동작 원리**:
- 사용자가 파일을 요청할 때마다 스캔 트리거
- 갱신 중에는 스캔 스킵 (동시성 제어)
- 마지막 스캔 후 설정된 시간(기본 500ms) 경과 시에만 스캔 실행

**Throttle 처리**:
```javascript
const lastScanTime = 0;
const scanThrottle = config.cache.scanThrottle || 500; // ms
let isScanning = false;

async function triggerScanIfNeeded() {
  // 갱신 중이면 스킵
  if (isScanning) {
    return false;
  }

  // 마지막 스캔 후 throttle 시간이 경과했는지 확인
  const now = Date.now();
  if (now - lastScanTime < scanThrottle) {
    return false; // Skip (too recent)
  }

  // 비동기 스캔 시작
  isScanning = true;
  lastScanTime = now;

  try {
    await performAsyncScan();
  } finally {
    isScanning = false;
  }

  return true;
}
```

**장점**:
- 동시 접속 시 불필요한 스캔 방지
- 서버 부하 최소화 (필요할 때만 스캔)
- 파일 시스템 감시 의존성 제거 (chokidar 불필요)

### 3. HTML 렌더러 (HtmlRenderer)

**역할**: 마크다운 → HTML 변환 (서버 측)

**의존성**:
- `marked`: 마크다운 파싱
- `dompurify` + `jsdom`: 서버 측 sanitize
- `puppeteer`: Mermaid 다이어그램 렌더링 (선택적)
- `highlight.js`: 코드 하이라이팅

**렌더링 파이프라인**:
```javascript
async function renderMarkdown(markdown, options) {
  // 1. Wiki links 전처리
  const preprocessed = preprocessWikiLinks(markdown);

  // 2. Marked 파싱 (with custom renderer)
  const renderer = createCustomRenderer();
  const rawHtml = marked.parse(preprocessed, { renderer });

  // 3. DOMPurify sanitize (jsdom)
  const cleanHtml = sanitizeHtml(rawHtml);

  // 4. Mermaid 렌더링 (Puppeteer - optional)
  const finalHtml = await renderMermaidDiagrams(cleanHtml);

  // 5. TOC 생성
  const toc = generateTOC(cleanHtml);

  return { html: finalHtml, toc };
}
```

**Mermaid SSR 전략**:
```javascript
// Option 1: Puppeteer (완전 렌더링)
async function renderMermaidWithPuppeteer(code) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  // ... render mermaid SVG
  await browser.close();
}

// Option 2: Fallback (클라이언트로 위임)
function renderMermaidFallback(code) {
  return `<pre class="mermaid-unrendered">${code}</pre>`;
}

// Hybrid: 서버에서 시도 → 실패 시 클라이언트
```

### 4. 캐시 저장소 (CacheStorage)

**메모리 캐시** (빠른 접근):
```javascript
const memoryCache = new Map(); // In-memory cache
const maxMemoryCacheSize = 100 * 1024 * 1024; // 100MB
```

**디스크 캐시** (영구 저장):
```
.cache/
  ├── html/
  │   ├── guide/intro.html
  │   ├── guide/advanced/config.html
  │   └── ...
  ├── toc/
  │   ├── guide/intro.json
  │   └── ...
  └── manifest.json  (메타데이터)
```

**캐시 키 생성**:
```javascript
function generateCacheKey(filePath, mtime) {
  return `${filePath}:${mtime}`;
}
```

---

## 구현 우선순위 및 페이즈

### Phase 0: 사전 준비 (필수, 3-4시간)

**0-1. 의존성 추가 (30분)**:
```bash
npm install marked dompurify jsdom
npm install --save-dev @types/marked @types/dompurify
```

**0-2. 서버 측 렌더링 검증 (1시간)**:
- marked SSR 테스트
- DOMPurify + jsdom 테스트
- 한글 처리 확인
- TOC 생성 로직 서버로 이동

**0-3. 캐시 디렉토리 구조 설계 (30분)**:
- `.cache/` 디렉토리 생성
- .gitignore 업데이트

**0-4. Config 스키마 확장 (1시간)**:
```json5
{
  cache: {
    enabled: true,                    // 캐시 활성화 여부
    scanThrottle: 500,               // 요청 기반 스캔 throttle (ms, 설정 가능)
    maxMemorySize: 100,              // MB
    maxDiskSize: 500,                // MB
    preRenderOnStartup: true,        // 시작 시 전체 렌더링
    mermaidSSR: false,               // Mermaid 서버 렌더링 (Puppeteer 필요)
    cacheDir: './.cache',            // 캐시 디렉토리
    compressionLevel: 0,             // 0=none, 1=gzip
  }
}
```

### Phase 1: 파일 스캔 및 메타데이터 수집 (4-5시간)

**1-1. FileScannerService 구현 (2시간)**:
```javascript
// src/services/file-scanner-service.js

/**
 * Scan all markdown files in docsRoot
 * @returns {Array<FileMetadata>}
 */
async function scanAllMarkdownFiles(docsRoot, excludes) {
  const files = [];

  async function scan(dir, relativePath = '') {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

      if (shouldExclude(relPath, excludes)) continue;

      if (entry.isDirectory()) {
        await scan(fullPath, relPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const stats = await fs.stat(fullPath);
        files.push({
          path: relPath,
          absolutePath: fullPath,
          mtime: stats.mtimeMs,
          size: stats.size,
          isCached: false
        });
      }
    }
  }

  await scan(docsRoot);
  return files;
}
```

**1-2. CacheManager 초기화 (2시간)**:
```javascript
// src/services/cache-manager.js

class CacheManager {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.memoryCache = new Map();
    this.lastScanTime = 0;
    this.isScanning = false;
    this.scanThrottle = config.cache.scanThrottle || 500; // 기본 500ms
  }

  async initialize() {
    // Load existing cache from disk
    await this.loadDiskCache();

    // Scan all files
    const files = await scanAllMarkdownFiles(
      this.config.docsRoot,
      this.config.excludes
    );

    // Update metadata
    this.updateFileList(files);

    this.logger.info('Cache manager initialized', {
      filesScanned: files.length,
      cacheHits: this.memoryCache.size
    });
  }

  async triggerScanIfNeeded() {
    // 갱신 중이면 스킵
    if (this.isScanning) {
      return false;
    }

    // 마지막 스캔 후 throttle 시간 확인
    const now = Date.now();
    if (now - this.lastScanTime < this.scanThrottle) {
      return false;
    }

    // 비동기 스캔 시작
    this.isScanning = true;
    this.lastScanTime = now;

    try {
      await this.performScan();
      return true;
    } catch (error) {
      this.logger.error('Scan failed', { error });
      return false;
    } finally {
      this.isScanning = false;
    }
  }

  async performScan() {
    const files = await scanAllMarkdownFiles(
      this.config.docsRoot,
      this.config.excludes
    );
    this.updateFileList(files);
    this.logger.debug('Scan completed', { filesScanned: files.length });
  }
}
```

**1-3. 메모리 효율성 검증 (1시간)**:
- 100개 파일 시뮬레이션
- 메모리 프로파일링
- LRU eviction 임계값 결정

### Phase 2: 서버 측 마크다운 렌더링 (6-8시간)

**2-1. Marked SSR 설정 (2시간)**:
```javascript
// src/services/markdown-renderer.js

const marked = require('marked');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

/**
 * Custom renderer for heading IDs (same logic as client)
 */
const renderer = new marked.Renderer();
renderer.heading = function(text, level, raw) {
  const id = raw
    .toLowerCase()
    .replace(/[^\w\s\-가-힣]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();

  return `<h${level} id="${id}">${text}</h${level}>\n`;
};

marked.setOptions({
  breaks: true,
  gfm: true,
  renderer: renderer
});

async function renderMarkdown(markdown) {
  // 1. Preprocess wiki links
  const preprocessed = preprocessWikiLinks(markdown);

  // 2. Parse markdown
  const rawHtml = marked.parse(preprocessed);

  // 3. Sanitize
  const cleanHtml = DOMPurify.sanitize(rawHtml, {
    ADD_ATTR: ['class', 'data-language', 'id', 'loading', 'title', 'alt', 'src'],
    ADD_TAGS: ['span']
  });

  return cleanHtml;
}
```

**2-2. Wiki Links 전처리 이식 (1시간)**:
- 클라이언트의 `preprocessWikiLinks()` 로직 복사
- 서버 측으로 이동

**2-3. Code Highlighting (1시간)**:
```javascript
const hljs = require('highlight.js');

renderer.code = function(code, language) {
  if (language && hljs.getLanguage(language)) {
    const highlighted = hljs.highlight(code, { language }).value;
    return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`;
  }
  return `<pre><code>${code}</code></pre>`;
};
```

**2-4. Mermaid 처리 전략 (2-4시간)**:
```javascript
// Option A: Puppeteer SSR (config.cache.mermaidSSR = true)
async function renderMermaidWithPuppeteer(code, index) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.setContent(`
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
    <div class="mermaid">${code}</div>
  `);

  await page.evaluate(() => mermaid.run());
  const svg = await page.$eval('.mermaid', el => el.innerHTML);

  await browser.close();
  return `<div class="mermaid">${svg}</div>`;
}

// Option B: Client-side fallback (default)
function renderMermaidFallback(code, index) {
  return `<pre class="mermaid-code" data-index="${index}"><code class="language-mermaid">${code}</code></pre>`;
}
```

### Phase 3: TOC 생성 서버 이식 (2-3시간)

**3-1. TOC 생성 로직 서버 이식 (1.5시간)**:
```javascript
// src/services/toc-generator.js

const { JSDOM } = require('jsdom');

/**
 * Generate TOC from rendered HTML
 * (Same logic as client's generateTOC())
 */
function generateTOC(html) {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
  const tocData = [];

  headings.forEach(heading => {
    if (!heading.id) return;

    const level = parseInt(heading.tagName.substring(1));
    const text = heading.textContent.replace('🔗', '').trim();

    tocData.push({
      id: heading.id,
      level: level,
      text: text
    });
  });

  return tocData;
}

module.exports = { generateTOC };
```

**3-2. 클라이언트 TOC 생성 제거 (1시간)**:
- 서버에서 받은 TOC 데이터 사용
- `generateTOC()` 함수 제거 또는 서버 응답 우선

### Phase 4: 캐시 저장 및 로드 (4-5시간)

**4-1. 디스크 캐시 구현 (2시간)**:
```javascript
// src/services/cache-storage.js

/**
 * Save HTML cache to disk
 */
async function saveToFile(filePath, html, toc) {
  const cacheDir = path.join(config.cache.cacheDir, 'html');
  const cachePath = path.join(cacheDir, filePath.replace(/\.md$/, '.html'));

  // Ensure directory exists
  await fs.mkdir(path.dirname(cachePath), { recursive: true });

  // Save HTML
  await fs.writeFile(cachePath, html, 'utf-8');

  // Save TOC separately
  const tocPath = cachePath.replace('.html', '.toc.json');
  await fs.writeFile(tocPath, JSON.stringify(toc), 'utf-8');
}

/**
 * Load HTML cache from disk
 */
async function loadFromDisk(filePath) {
  const cachePath = path.join(
    config.cache.cacheDir,
    'html',
    filePath.replace(/\.md$/, '.html')
  );

  try {
    const html = await fs.readFile(cachePath, 'utf-8');
    const tocPath = cachePath.replace('.html', '.toc.json');
    const toc = JSON.parse(await fs.readFile(tocPath, 'utf-8'));

    return { html, toc };
  } catch (error) {
    return null; // Cache miss
  }
}
```

**4-2. LRU 캐시 전략 (2시간)**:
```javascript
/**
 * Evict least recently used entries when memory limit reached
 */
function evictLRU() {
  const entries = Array.from(this.memoryCache.entries());

  // Sort by lastAccessed (oldest first)
  entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

  // Calculate current memory usage
  let currentSize = entries.reduce((sum, [_, entry]) => {
    return sum + (entry.html?.length || 0);
  }, 0);

  const maxSize = this.config.cache.maxMemorySize * 1024 * 1024;

  // Evict until under limit
  while (currentSize > maxSize && entries.length > 0) {
    const [key, entry] = entries.shift();
    currentSize -= (entry.html?.length || 0);
    this.memoryCache.delete(key);

    this.logger.debug('Cache evicted (LRU)', {
      key,
      size: entry.html?.length
    });
  }
}
```

**4-3. Manifest 관리 (1시간)**:
```javascript
// .cache/manifest.json
{
  version: 1,
  lastUpdated: 1234567890,
  files: [
    {
      path: "guide/intro.md",
      mtime: 1234567890,
      size: 12345,
      cacheKey: "guide/intro.md:1234567890",
      htmlSize: 45678,
      tocItems: 10
    }
  ]
}
```

### Phase 5: 요청 기반 스캔 통합 (2-3시간)

**5-1. API 요청 시 스캔 트리거 구현 (1.5시간)**:
```javascript
// src/controllers/html-controller.js

async function getHtml(req, res, next) {
  try {
    const { config, logger, cacheManager } = req.app.locals;
    const userPath = req.query.path;

    // 요청 시 비동기 스캔 트리거 (throttle 적용)
    // 백그라운드에서 실행되므로 응답 지연 없음
    cacheManager.triggerScanIfNeeded().catch(error => {
      logger.warn('Background scan failed', { error });
    });

    // 캐시에서 조회 또는 렌더링
    const cached = await cacheManager.getOrRender(userPath);

    if (!cached) {
      const error = new Error('NOT_FOUND: File not found or cannot be rendered');
      error.code = 'NOT_FOUND';
      throw error;
    }

    res.json({
      html: cached.html,
      toc: cached.toc,
      path: userPath,
      cachedAt: cached.cachedAt,
      fromCache: cached.fromCache
    });
  } catch (error) {
    next(error);
  }
}
```

**5-2. 스캔 동시성 제어 (1시간)**:
```javascript
// src/services/cache-manager.js

const AsyncLock = require('async-lock');
const lock = new AsyncLock();

async function renderAndCache(filePath) {
  return await lock.acquire(filePath, async () => {
    // Prevent concurrent rendering of same file
    // ... rendering logic
  });
}

// 스캔 자체도 lock으로 보호
async function performScan() {
  return await lock.acquire('scan', async () => {
    const files = await scanAllMarkdownFiles(
      this.config.docsRoot,
      this.config.excludes
    );
    this.updateFileList(files);
    this.logger.debug('Scan completed', { filesScanned: files.length });
  });
}
```

**5-3. Throttle 로직 테스트 (30분)**:
- 동시 요청 시뮬레이션 (10개 동시 접속)
- 500ms throttle 검증
- 스캔 중복 실행 방지 확인
- 메모리 사용량 모니터링

**장점**:
- ✅ chokidar 의존성 제거 (파일 와처 불필요)
- ✅ 동시 접속 시 서버 부하 최소화
- ✅ 백그라운드 스캔으로 응답 시간 영향 없음
- ✅ 설정 가능한 throttle 시간으로 유연한 조정

### Phase 6: API 엔드포인트 수정 (3-4시간)

**6-1. /api/html 엔드포인트 추가 (1.5시간)**:
```javascript
// src/controllers/html-controller.js

async function getHtml(req, res, next) {
  try {
    const { config, logger, cacheManager } = req.app.locals;
    const userPath = req.query.path;

    // Get from cache or render
    const cached = await cacheManager.getOrRender(userPath);

    if (!cached) {
      const error = new Error('NOT_FOUND: File not found or cannot be rendered');
      error.code = 'NOT_FOUND';
      throw error;
    }

    res.json({
      html: cached.html,
      toc: cached.toc,
      path: userPath,
      cachedAt: cached.cachedAt,
      fromCache: cached.fromCache
    });

    logger.info('HTML served', {
      path: userPath,
      fromCache: cached.fromCache,
      size: cached.html.length
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { getHtml };
```

**6-2. 클라이언트 코드 수정 (2시간)**:
```javascript
// public/js/app.js

async function loadFile(path, hash = '', updateUrl = true) {
  try {
    // Fetch pre-rendered HTML from server
    const response = await fetchWithRetry(`/api/html?path=${encodeURIComponent(path)}`);
    const data = await response.json();

    // Direct insertion (no client-side rendering!)
    const contentDiv = document.getElementById('markdown-content');
    contentDiv.innerHTML = data.html;

    // Use server-generated TOC
    renderTOC(data.toc);

    // ... rest of logic
  } catch (error) {
    // Fallback: use old /api/raw endpoint
    const content = await fetchRaw(path);
    await renderMarkdown(content); // Client-side fallback
  }
}
```

### Phase 7: 성능 최적화 및 테스트 (4-5시간)

**7-1. 압축 지원 (1시간)**:
```javascript
const zlib = require('zlib');

async function compressCache(html) {
  if (config.cache.compressionLevel === 0) {
    return html;
  }

  return await new Promise((resolve, reject) => {
    zlib.gzip(html, (err, compressed) => {
      if (err) reject(err);
      else resolve(compressed);
    });
  });
}
```

**7-2. 성능 벤치마크 (2시간)**:
```javascript
// test/benchmark-cache-performance.js

async function benchmarkCaching() {
  const tests = [
    { file: 'small.md', size: '5KB' },
    { file: 'medium.md', size: '35KB' },
    { file: 'large.md', size: '110KB' }
  ];

  for (const test of tests) {
    // Without cache (client rendering)
    const timeWithoutCache = await measureTime(() => {
      // Fetch raw → client render
    });

    // With cache (server HTML)
    const timeWithCache = await measureTime(() => {
      // Fetch HTML
    });

    const improvement = ((timeWithoutCache - timeWithCache) / timeWithoutCache) * 100;

    console.log(`${test.file}: ${improvement.toFixed(1)}% faster`);
  }
}
```

**7-3. 메모리 누수 테스트 (1hour)**:
- 1000번 요청 시뮬레이션
- 메모리 프로파일 (heap snapshot)
- LRU eviction 검증

---

## 데이터 플로우

### Before (현재):
```
[Client]
  ↓ GET /api/raw?path=guide/intro.md
[Server]
  ↓ fs.readFile()
  ↓ return raw markdown
[Network]
  ↓ Transfer raw (35KB)
[Client]
  ↓ marked.parse() (200ms)
  ↓ DOMPurify.sanitize() (50ms)
  ↓ Mermaid render (500ms)
  ↓ generateTOC() (50ms)
  ↓ renderTOC() (20ms)
  = Total: ~820ms
```

### After (캐싱):
```
[Client]
  ↓ GET /api/html?path=guide/intro.md
[Server]
  ↓ triggerScanIfNeeded() (비동기, 백그라운드, throttle 적용)
  ↓ CacheManager.get(path)
  ↓ if (cached & fresh) return from memory (2ms)
  ↓ else: render + cache (500ms, only once)
[Network]
  ↓ Transfer HTML (50KB) + TOC JSON (2KB)
[Client]
  ↓ contentDiv.innerHTML = html (10ms)
  ↓ renderTOC(data.toc) (20ms)
  = Total: ~82ms (90% faster!)

[Background Scan]
  ↓ 요청 시 트리거 (500ms throttle)
  ↓ isScanning = true (동시 스캔 방지)
  ↓ 파일 시스템 스캔
  ↓ 메타데이터 업데이트
  ↓ isScanning = false
  ↓ 다음 스캔 대기
```

---

## 설정 파일 확장

### config.json5 추가 섹션:
```json5
{
  // ... 기존 설정 ...

  // HTML Caching (Step X1)
  cache: {
    // Enable/disable caching system
    enabled: true,

    // Throttle for request-based scan (ms)
    // Prevents excessive scans on concurrent user requests
    // Recommended: 500ms for moderate traffic, 1000ms for high traffic
    scanThrottle: 500,

    // Maximum memory cache size (MB)
    // LRU eviction when exceeded
    maxMemorySize: 100,

    // Maximum disk cache size (MB)
    // Old caches deleted when exceeded
    maxDiskSize: 500,

    // Pre-render all files on server startup
    // false: lazy rendering (on first request)
    // true: eager rendering (slower startup, faster first request)
    preRenderOnStartup: true,

    // Server-side Mermaid rendering (requires Puppeteer)
    // false: send mermaid code to client (fallback)
    // true: render SVG on server (slower, complete)
    mermaidSSR: false,

    // Cache directory (relative to project root)
    cacheDir: './.cache',

    // Compression level
    // 0: none (faster, more disk space)
    // 1: gzip (slower, less disk space)
    compressionLevel: 0,

    // Auto-cleanup old cache files (days)
    // Files not accessed for this many days will be deleted
    cleanupAfterDays: 30
  }
}
```

---

## 수정 대상 파일

### 신규 파일 (생성):
1. `src/services/cache-manager.js` (~350 lines) - 요청 기반 스캔 로직 포함
2. `src/services/markdown-renderer.js` (~200 lines)
3. `src/services/toc-generator.js` (~80 lines)
4. `src/services/cache-storage.js` (~200 lines)
5. `src/controllers/html-controller.js` (~120 lines) - 스캔 트리거 로직 포함
6. `test/benchmark-cache-performance.js` (~150 lines)

### 수정 파일:
1. `src/app.js` (~30 lines 추가)
   - cacheManager 초기화
   - (fileWatcher 제거됨)

2. `src/routes/api.js` (~10 lines)
   - /api/html 라우트 추가

3. `public/js/app.js` (~100 lines 수정)
   - fetchHtml() 함수 추가
   - loadFile() 수정
   - generateTOC() 제거 또는 fallback

4. `config.example.json5` (~30 lines)
   - cache 섹션 추가 (scanThrottle 설정 포함)

5. `.gitignore` (~2 lines)
   - .cache/ 추가

**총 예상 라인**: ~1270 lines (파일 와처 제거로 ~60 lines 감소)

---

## 성능 예측

### 렌더링 시간 비교 (예측):

| 파일 크기 | Before (Client) | After (Server Cache) | 개선율 |
|-----------|----------------|---------------------|--------|
| 5KB       | 200ms          | 25ms                | 87.5%  |
| 35KB      | 600ms          | 80ms                | 86.7%  |
| 110KB     | 1800ms         | 250ms               | 86.1%  |

### 메모리 사용량 (25개 파일):
- Raw markdown: 876KB
- Rendered HTML (평균 1.5x): ~1.3MB
- TOC JSON: ~50KB
- **Total**: ~1.4MB (메모리 캐시)

### 디스크 사용량:
- HTML 파일: ~1.3MB
- TOC JSON: ~50KB
- Manifest: ~10KB
- **Total**: ~1.4MB (디스크 캐시)

### 네트워크 전송량:
- Before: 35KB (markdown)
- After: 52KB (HTML + TOC)
- **증가**: +17KB (48%), but worth it for speed

---

## 리스크 및 대응

### 리스크 1: Mermaid SSR 복잡도
**영향**: 높음 (다이어그램 렌더링 실패 시 UX 저하)

**대응**:
1. **Hybrid 전략**:
   - 서버에서 렌더링 시도 (timeout 5s)
   - 실패 시 코드 블록으로 fallback
   - 클라이언트가 다시 시도

2. **Config 옵션**:
   - `mermaidSSR: false` (기본값)
   - 사용자가 원하면 활성화

3. **Error Handling**:
   ```javascript
   try {
     return await renderMermaidWithPuppeteer(code);
   } catch (error) {
     logger.warn('Mermaid SSR failed, using fallback', { error });
     return renderMermaidFallback(code);
   }
   ```

### 리스크 2: 메모리 누수
**영향**: 중간 (장시간 실행 시 메모리 고갈)

**대응**:
1. **LRU Eviction**:
   - maxMemorySize: 100MB (기본값)
   - 자동 정리 (oldest first)

2. **Monitoring**:
   ```javascript
   setInterval(() => {
     const usage = process.memoryUsage();
     logger.debug('Memory usage', {
       heapUsed: (usage.heapUsed / 1024 / 1024).toFixed(2) + 'MB',
       cacheSize: this.memoryCache.size
     });
   }, 60000); // Every minute
   ```

3. **Manual Cleanup API**:
   ```javascript
   // POST /api/cache/clear
   async function clearCache(req, res) {
     cacheManager.clearAll();
     res.json({ success: true, message: 'Cache cleared' });
   }
   ```

### 리스크 3: 요청이 없을 때 캐시 갱신 누락
**영향**: 낮음 (오래된 캐시 제공 가능, 다음 요청 시 자동 갱신)

**대응**:
1. **mtime 기반 캐시 검증**:
   ```javascript
   async function getOrRender(filePath) {
     const stats = await fs.stat(filePath);
     const cached = this.memoryCache.get(filePath);

     // 캐시가 있지만 파일이 수정되었으면 재렌더링
     if (cached && cached.mtime < stats.mtimeMs) {
       await this.invalidateAndRerender(filePath);
     }

     return cached || await this.renderAndCache(filePath);
   }
   ```

2. **강제 새로고침 API**:
   ```javascript
   // GET /api/html?path=xxx&refresh=true
   if (req.query.refresh === 'true') {
     await cacheManager.invalidateAndRerender(userPath);
   }
   ```

3. **선택적: 정기 백그라운드 스캔** (config.cache.backgroundScanInterval):
   ```javascript
   // Optional: 5분마다 백그라운드 스캔 (기본값: 0 = 비활성화)
   if (config.cache.backgroundScanInterval > 0) {
     setInterval(async () => {
       await cacheManager.performScan();
     }, config.cache.backgroundScanInterval);
   }
   ```

### 리스크 4: 디스크 공간 고갈
**영향**: 낮음 (캐시는 재생성 가능)

**대응**:
1. **자동 정리**:
   ```javascript
   async function cleanupOldCaches() {
     const files = await fs.readdir(cacheDir);
     const now = Date.now();
     const maxAge = config.cache.cleanupAfterDays * 24 * 60 * 60 * 1000;

     for (const file of files) {
       const stats = await fs.stat(file);
       if (now - stats.atimeMs > maxAge) {
         await fs.unlink(file);
       }
     }
   }
   ```

2. **사이즈 제한**:
   - `maxDiskSize: 500MB` (config)
   - 초과 시 LRU 삭제

---

## 타임라인 (예상)

### Phase 0: 사전 준비 (3-4시간)
- 의존성 추가 및 검증
- 서버 측 렌더링 테스트
- Config 스키마 확장

### Phase 1: 파일 스캔 (4-5시간)
- FileScannerService 구현
- CacheManager 초기화
- 메모리 효율성 검증

### Phase 2: HTML 렌더링 (6-8시간)
- Marked SSR 설정
- Wiki Links 이식
- Code highlighting
- Mermaid 처리 (Hybrid)

### Phase 3: TOC 생성 (2-3시간)
- TOC 생성 서버 이식
- 클라이언트 간소화

### Phase 4: 캐시 저장 (4-5시간)
- 디스크 캐시 구현
- LRU 전략
- Manifest 관리

### Phase 5: 요청 기반 스캔 (2-3시간)
- API 요청 시 스캔 트리거
- 비동기 백그라운드 스캔
- Throttle 로직 및 동시성 제어

### Phase 6: API 수정 (3-4시간)
- /api/html 엔드포인트
- 클라이언트 수정
- Fallback 처리

### Phase 7: 최적화 (4-5시간)
- 압축 지원
- 벤치마크
- 메모리 누수 테스트

---

**총 예상 시간**: 25-37시간 (파일 와처 제거로 1시간 단축)

---

## 성공 기준

### 필수 (P0):
1. ✅ 서버 시작 시 모든 마크다운 파일 스캔
2. ✅ 요청 기반 자동 스캔 (throttle 적용, 동시성 제어)
3. ✅ /api/html 엔드포인트 정상 작동
4. ✅ 클라이언트 렌더링 시간 70% 이상 단축
5. ✅ 메모리 사용량 100MB 이하 유지

### 권장 (P1):
1. ✅ Mermaid Hybrid 렌더링 (서버 시도 + 클라이언트 fallback)
2. ✅ LRU 캐시 eviction 정상 작동
3. ✅ ETag 기반 304 응답
4. ✅ 디스크 캐시 영구 저장

### 선택 (P2):
1. ⏳ gzip 압축 지원
2. ⏳ Cache warming API (POST /api/cache/warm)
3. ⏳ Cache stats API (GET /api/cache/stats)
4. ⏳ Incremental rendering (큰 파일 스트리밍)

---

## 대안 방안 (Alternative Approaches)

### Option A: Static Site Generation (SSG)

**설명**: 빌드 시 모든 HTML 생성 (Jekyll, Hugo 방식)

**장점**:
- ✅ 최고 성능 (모든 것이 사전 생성)
- ✅ 서버 부하 없음

**단점**:
- ❌ 파일 수정 시 전체 재빌드 필요
- ❌ 동적 콘텐츠 어려움
- ❌ 현재 아키텍처와 맞지 않음

**평가**: ❌ 부적합 (동적 문서 뷰어 특성과 충돌)

### Option B: Redis 캐시

**설명**: Redis에 HTML 저장

**장점**:
- ✅ 분산 시스템 지원
- ✅ TTL 자동 만료

**단점**:
- ❌ 외부 의존성 추가 (Redis 서버)
- ❌ 소규모 프로젝트에 과도함
- ❌ 설치 복잡도 증가

**평가**: ❌ 부적합 (오버엔지니어링)

### Option C: HTTP 캐시 헤더 only

**설명**: Cache-Control, ETag만 사용

**장점**:
- ✅ 구현 간단
- ✅ 브라우저 기본 기능 활용

**단점**:
- ❌ 첫 로딩 여전히 느림
- ❌ 서버 렌더링 없으면 효과 제한적

**평가**: △ 보조 수단으로 활용 가능

### 권장 방안: **제안된 In-Memory + Disk 캐시 (요청 기반 스캔)**

**이유**:
1. ✅ 현재 아키텍처와 자연스럽게 통합
2. ✅ 외부 의존성 최소 (파일 와처 불필요)
3. ✅ 성능/복잡도 균형 적절
4. ✅ 단계적 구현 가능 (Phase별)
5. ✅ Fallback 전략 명확 (클라이언트 렌더링)
6. ✅ 동시 접속 시 서버 부하 최소화

---

## 구현 전략

### 전략 A: Big Bang (일괄 구현)
```
모든 Phase를 한 번에 구현
→ PR 하나로 머지
```

**장점**: 빠른 완성
**단점**: 리스크 높음, 테스트 어려움, 롤백 힘듦

**평가**: ❌ 비추천

### 전략 B: Incremental (점진적 구현) ⭐ 권장
```
Phase 0 → 테스트 → 머지
Phase 1 → 테스트 → 머지
...
Phase 7 → 테스트 → 머지
```

**장점**:
- ✅ 각 Phase별 검증 가능
- ✅ 문제 발생 시 롤백 용이
- ✅ 점진적 성능 개선 확인

**단점**: 시간 소요 (but safer)

**평가**: ✅ 권장

### 전략 C: Feature Flag (기능 토글)
```
cache.enabled: false (기본값)
→ 구현 완료 후 true로 변경
```

**장점**:
- ✅ 프로덕션 배포 후 활성화 가능
- ✅ 문제 시 즉시 비활성화

**단점**: 코드 복잡도 증가

**평가**: ✅ 권장 (Incremental과 병행)

---

## 예상 성능 개선

### 시나리오 1: 일반 문서 (35KB)
```
Before:
- Network: 150ms
- Client Render: 450ms
- Total: 600ms

After (Cold):
- Network: 180ms (HTML larger)
- Client Insert: 10ms
- Total: 190ms (68% faster)

After (Cached):
- Server Lookup: 2ms
- Network: 180ms
- Client Insert: 10ms
- Total: 192ms (68% faster)
```

### 시나리오 2: 대용량 문서 (110KB + 10 diagrams)
```
Before:
- Network: 400ms
- Client Render: 800ms
- Mermaid: 3000ms (10 diagrams)
- Total: 4200ms

After (mermaidSSR: false):
- Network: 500ms
- Client Insert: 10ms
- Mermaid (client): 3000ms
- Total: 3510ms (16% faster)

After (mermaidSSR: true):
- Server Render: 5000ms (once!)
- Network: 800ms (SVG embedded)
- Client Insert: 10ms
- Total: 810ms (81% faster, cached)
```

### ROI (Return on Investment):
- **구현 시간**: 25-37시간
- **성능 개선**: 68-86%
- **사용자 경험**: 즉각 반응형
- **서버 부하**: 감소 (캐시 hit 시, 요청 기반 스캔으로 추가 최적화)

---

## 마치며

### 핵심 가치

이 기능은 **문서 뷰어 성능을 획기적으로 개선**합니다:

1. **즉각적인 응답**: 600ms → 190ms (평균)
2. **서버 부하 감소**: 캐시 hit 시 2ms 응답
3. **확장성 향상**: 1000개 파일도 동일한 성능
4. **사용자 만족도**: 대폭 향상

### 기술적 가치

**Best Practices**:
1. **SSR (Server-Side Rendering)**: 모던 웹 표준
2. **Cache-First Strategy**: PWA 패턴
3. **Incremental Adoption**: 점진적 마이그레이션
4. **Graceful Degradation**: Fallback 전략

**측정 가능한 개선**:
- 렌더링 시간: 68-86% 단축
- 네트워크 왕복: 1회로 감소
- CPU 사용률: 클라이언트 50% 감소
- 메모리 사용: 서버 +1.4MB, 클라이언트 -10MB

### 구현 전략 요약

**권장 순서**: Phase 0 (검증) → Phase 1 (스캔) → Phase 2-3 (렌더링) → Phase 4-5 (캐시) → Phase 6 (API) → Phase 7 (최적화)

**핵심 원칙**:
1. **점진적 구현**: Phase별 검증 후 다음 단계
2. **Feature Flag**: cache.enabled로 제어
3. **Fallback 보장**: 캐시 실패 시 기존 방식
4. **성능 모니터링**: 각 Phase마다 벤치마크

**다음 단계**: Phase 0-1 (의존성 추가 및 SSR 검증)부터 시작

---

## 참고 자료

### 유사 구현 사례
- **GitBook**: Pre-rendering + incremental build
- **Docusaurus**: Static generation + client hydration
- **VitePress**: SSG with intelligent caching
- **Nextra**: On-demand ISR (Incremental Static Regeneration)

### 기술 스택
- **marked**: Markdown parsing (SSR support)
- **dompurify**: XSS sanitization (jsdom for SSR)
- **puppeteer**: Mermaid SSR (already installed)
- **async-lock**: Concurrency control (already used)
- **요청 기반 스캔**: 파일 와처 없이 효율적인 갱신

### 브라우저 호환성
- HTML insertion: All browsers
- Cache headers: All modern browsers
- Fallback to client rendering: Full compatibility

---

## 리뷰 체크리스트

구현 전 확인 사항:

**아키텍처**:
- [ ] 현재 시스템과 충돌 없는가?
- [ ] Fallback 전략이 명확한가?
- [ ] 메모리 관리 계획이 있는가?

**성능**:
- [ ] 예상 개선율이 검증되었는가?
- [ ] 벤치마크 계획이 수립되었는가?
- [ ] 병목 지점을 파악했는가?

**안정성**:
- [ ] 에러 처리가 충분한가?
- [ ] 동시성 문제를 고려했는가?
- [ ] 롤백 계획이 있는가?

**유지보수**:
- [ ] 코드 복잡도가 관리 가능한가?
- [ ] 문서화 계획이 있는가?
- [ ] 모니터링 방안이 있는가?

---

**작성자**: Claude
**리뷰어**: [범님]
**승인 여부**: [ ] 승인 / [ ] 수정 필요 / [ ] 보류
