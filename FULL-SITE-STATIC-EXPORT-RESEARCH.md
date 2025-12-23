# 전체 사이트 정적 빌드 연구

**목표**: 모든 페이지 + 모든 리소스를 정적 HTML로 빌드하여 ZIP 다운로드
**현황**: 25개 .md 파일, 5개 CDN 의존성

---

## 📊 현재 구조 분석

### 마크다운 파일
- **총 개수**: 25개
- **위치**: test-source/ 디렉토리
- **구조**: 폴더 계층 구조 (프롬프트 강의/, guide/, test/ 등)

### CDN 의존성 (5개)
1. Highlight.js CSS - syntax highlighting 스타일
2. Highlight.js JS - 코드 블록 하이라이팅
3. Marked.js - 마크다운 파싱
4. Mermaid.js - 다이어그램 렌더링
5. DOMPurify.js - XSS 방지

### 내부 리소스
- CSS: `/css/style.css`
- JS: `/js/app.js`
- Images: `/images/` (아이콘 등)
- 문서 이미지: test-source/images/

---

## 🎯 구현 가능한 방법 (3가지)

### 방법 1: Puppeteer 크롤링 (완전 자동) ⭐⭐⭐⭐

#### 개요
Puppeteer로 모든 페이지를 방문하여 렌더링된 HTML 저장

#### 구현 단계
```javascript
// 서버 사이드 (새 엔드포인트)
router.post('/api/export-site', async (req, res) => {
  const browser = await puppeteer.launch();
  const zip = archiver('zip');

  // 1. 모든 .md 파일 목록 가져오기
  const files = await getAllMarkdownFiles(docsRoot);

  // 2. 각 파일마다 Puppeteer로 렌더링
  for (const file of files) {
    const page = await browser.newPage();
    await page.goto(`http://localhost:3000/doc/${file.path}`);

    // 완전히 렌더링 대기 (Mermaid, Highlight.js)
    await page.waitForTimeout(1000);

    // HTML 캡처
    const html = await page.content();

    // ZIP에 추가
    zip.append(html, { name: `${file.path}.html` });
  }

  // 3. CDN 리소스 다운로드 및 로컬화
  const cdnResources = [
    'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js',
    // ... 5개 모두
  ];

  for (const url of cdnResources) {
    const response = await fetch(url);
    const content = await response.text();
    zip.append(content, { name: `libs/${getFilename(url)}` });
  }

  // 4. 로컬 리소스 (CSS, JS, 이미지)
  zip.directory('public/', false);
  zip.directory('test-source/images/', 'images/');

  // 5. ZIP 전송
  res.attachment('doclight-static.zip');
  zip.pipe(res);
  await zip.finalize();
});
```

#### 장점
- ✅ 완전히 렌더링된 HTML (Mermaid, Highlight.js 포함)
- ✅ 모든 동적 콘텐츠 정적으로 변환
- ✅ 자동화

#### 단점
- ⚠️ 서버 부하 높음 (25개 페이지 × 1초 = 25초)
- ⚠️ 메모리 사용량 큼 (Puppeteer)
- ⚠️ 동시 요청 제한 필요

#### 복잡도: ⭐⭐⭐⭐☆
#### 예상 시간: 6-8시간

---

### 방법 2: 서버 사이드 마크다운 렌더링 (중간)

#### 개요
서버에서 `marked`로 직접 렌더링, Puppeteer 없이 구현

#### 구현 단계
```javascript
const marked = require('marked');
const hljs = require('highlight.js');

router.post('/api/export-site', async (req, res) => {
  const zip = archiver('zip');
  const files = await getAllMarkdownFiles(docsRoot);

  for (const file of files) {
    // 1. 마크다운 읽기
    const markdown = await fs.readFile(file.fullPath, 'utf-8');

    // 2. HTML 변환 (서버 사이드)
    const html = marked.parse(markdown, {
      highlight: (code, lang) => {
        return hljs.highlight(code, {language: lang}).value;
      }
    });

    // 3. 템플릿에 삽입
    const fullHTML = generateStaticHTML(html, file.name);

    // 4. ZIP에 추가
    zip.append(fullHTML, { name: `${file.path}.html` });
  }

  // CDN 리소스 다운로드
  // ...

  zip.finalize();
});
```

#### 장점
- ✅ Puppeteer보다 빠름
- ✅ 메모리 사용 적음
- ✅ 서버 부하 중간

#### 단점
- ⚠️ Mermaid 렌더링 어려움 (클라이언트 전용)
- ⚠️ 클라이언트 JavaScript 동작 재현 어려움
- ⚠️ 스타일이 정확히 일치하지 않을 수 있음

#### 복잡도: ⭐⭐⭐⭐☆
#### 예상 시간: 8-10시간

---

### 방법 3: wget/httrack 스타일 크롤러 (가장 간단) ⭐

#### 개요
실행 중인 사이트를 크롤링하여 저장

#### 구현 (Node.js)
```javascript
const axios = require('axios');
const cheerio = require('cheerio');

async function crawlAndSave(baseUrl) {
  const visited = new Set();
  const toVisit = ['/'];
  const zip = archiver('zip');

  while (toVisit.length > 0) {
    const path = toVisit.shift();
    if (visited.has(path)) continue;
    visited.add(path);

    // 페이지 가져오기
    const response = await axios.get(`${baseUrl}${path}`);
    const html = response.data;

    // 링크 추출 및 큐에 추가
    const $ = cheerio.load(html);
    $('a[href^="/doc/"]').each((i, el) => {
      const href = $(el).attr('href');
      toVisit.push(href);
    });

    // HTML 저장
    zip.append(html, { name: `${path}/index.html` });
  }

  // 리소스 다운로드
  await downloadResources(zip, baseUrl);

  return zip;
}
```

#### 장점
- ✅ 구현 단순
- ✅ 실제 렌더링된 그대로 저장
- ✅ 모든 페이지 자동 발견

#### 단점
- ⚠️ 동적 콘텐츠는 정적으로 변환 안 됨
- ⚠️ JavaScript 의존성 높음 (오프라인에서 동작 어려움)

---

## 🔍 핵심 과제

### 1. CDN 리소스 로컬화 ⭐ 가장 중요

**필요 작업**:
```javascript
// CDN URL → 로컬 파일
const cdnMappings = {
  'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js':
    'libs/highlight.min.js',
  // ... 5개 모두
};

// HTML에서 URL 교체
html = html.replace(
  'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js',
  'libs/highlight.min.js'
);
```

**다운로드 방법**:
```javascript
const axios = require('axios');

for (const [url, localPath] of Object.entries(cdnMappings)) {
  const response = await axios.get(url);
  zip.append(response.data, { name: localPath });
}
```

---

### 2. 트리 구조 유지

**정적 페이지에서 트리 네비게이션**:
- Option A: 모든 페이지에 전체 트리 HTML 포함 (비효율)
- Option B: JavaScript로 동적 로드 (JSON 파일 생성)
- Option C: 각 페이지를 독립적으로 (트리 없음)

**권장**: Option B - `tree-structure.json` 생성

---

### 3. 검색 기능 유지?

**문제**: 현재 검색은 서버 API 의존

**해결책**:
- Option A: 검색 기능 제거 (정적 페이지에서는 Ctrl+F 사용)
- Option B: 클라이언트 사이드 검색 구현 (모든 콘텐츠를 JSON으로)
- Option C: Lunr.js 같은 정적 검색 라이브러리 사용

**권장**: Option A (단순화) 또는 Option C (Lunr.js)

---

### 4. 상대 경로 문제

**정적 빌드 구조**:
```
doclight-static/
├── index.html (루트)
├── doc/
│   ├── 1강.html
│   ├── 2강.html
│   └── guide/
│       └── getting-started.html
├── libs/
│   ├── highlight.min.js
│   ├── marked.min.js
│   └── ...
├── css/
│   └── style.css
├── js/
│   └── app.js (수정 필요)
└── images/
    └── ...
```

**링크 수정 필요**:
- `/doc/guide/intro` → `../guide/intro.html`
- 상대 경로로 모두 변경

---

## 🎯 권장 구현 방법

### **Puppeteer + 크롤링 하이브리드** ⭐

```javascript
async function exportFullSite() {
  const browser = await puppeteer.launch();
  const zip = archiver('zip');

  // 1. 트리 구조 가져오기
  const tree = await fetchTree('/');
  const allFiles = flattenTree(tree);  // 25개 파일

  // 2. CDN 리소스 다운로드 (한 번만)
  await downloadCDNResources(zip);

  // 3. 각 마크다운 파일을 HTML로
  for (const file of allFiles) {
    const page = await browser.newPage();

    // 페이지 방문
    await page.goto(`http://localhost:3000/doc/${file.path}`, {
      waitUntil: 'networkidle0'  // 모든 리소스 로드 대기
    });

    // HTML 캡처
    let html = await page.content();

    // CDN URL → 로컬 경로로 교체
    html = replaceCDNUrls(html);

    // 절대 경로 → 상대 경로로 교체
    html = makePathsRelative(html, file.path);

    // ZIP에 추가
    zip.append(html, { name: `doc/${file.path}.html` });
  }

  // 4. 로컬 리소스 추가
  zip.directory('public/css/', 'css/');
  zip.directory('public/js/', 'js/');
  zip.directory('public/images/', 'images/');
  zip.directory('test-source/images/', 'images/');

  // 5. 인덱스 페이지 생성
  const indexHtml = generateIndexPage(allFiles);
  zip.append(indexHtml, { name: 'index.html' });

  return zip;
}
```

---

## ⚠️ 핵심 제약사항

### 1. **검색 기능 손실**
- 현재: 서버 API 기반 전문 검색
- 정적: Ctrl+F 또는 Lunr.js 클라이언트 검색
- **영향**: 검색 품질 저하

### 2. **파일 업로드/삭제 불가**
- 현재: API 기반 파일 관리
- 정적: 읽기 전용
- **영향**: 관리 기능 제거

### 3. **동적 트리 탐색 제한**
- 현재: 동적 expand/collapse
- 정적: JavaScript로 시뮬레이션 필요
- **영향**: 복잡도 증가

### 4. **TOC (목차) 동작**
- 현재: 동적 생성
- 정적: 각 페이지에 사전 생성 필요
- **영향**: HTML 크기 증가

---

## 📋 구현 복잡도 분석

### Phase 1: 기본 빌드 (필수)
- 모든 .md → HTML 변환
- CDN 리소스 로컬화
- ZIP 압축

**복잡도**: ⭐⭐⭐⭐☆
**시간**: 8-12시간

### Phase 2: 네비게이션 유지 (중요)
- 트리 구조 JSON 생성
- JavaScript로 트리 렌더링
- 상대 경로 링크 수정

**복잡도**: ⭐⭐⭐☆☆
**시간**: 4-6시간

### Phase 3: 검색 기능 (선택)
- Lunr.js 통합
- 검색 인덱스 생성
- 클라이언트 검색 구현

**복잡도**: ⭐⭐⭐⭐☆
**시간**: 6-8시간

### Phase 4: 최적화 (선택)
- 이미지 최적화
- CSS/JS 번들링
- Lazy loading

**복잡도**: ⭐⭐⭐☆☆
**시간**: 4-6시간

**총 예상 시간**: 22-32시간 (3-4일)

---

## 💡 결론

### ✅ 구현 가능: YES

**하지만**:
- **복잡도**: 매우 높음 (⭐⭐⭐⭐⭐)
- **시간**: 3-4일 소요
- **제약사항**: 검색, 파일관리 기능 손실

### 현실적 대안

#### Option A: 단순 HTML 변환만
- 각 페이지를 개별 HTML로 저장
- 네비게이션 없음 (독립 문서)
- **시간**: 1일
- **효용**: 문서 백업/아카이빙

#### Option B: PDF 변환
- Puppeteer로 각 페이지를 PDF로
- 훨씬 간단함
- **시간**: 4-6시간
- **효용**: 문서 공유/출력

#### Option C: Markdown ZIP만
- 원본 .md 파일만 ZIP으로
- 가장 간단 (이미 구현 가능)
- **시간**: 1시간
- **효용**: 원본 보관

---

## 🎯 권장사항

### 사용 목적에 따라:

**문서 아카이빙/백업**:
→ **Markdown ZIP** (가장 간단)

**오프라인 열람**:
→ **PDF 변환** (중간 복잡도)

**완전한 정적 사이트**:
→ **Puppeteer 전체 빌드** (매우 복잡)

---

## ⚖️ 투자 가치 분석

### 효용성
- 오프라인 문서 → **중간**
- 완전한 복제 → **낮음** (DocLight 자체가 경량)
- 공유 목적 → **PDF가 더 나음**

### 비용
- 개발 시간: **3-4일**
- 유지보수: **지속적**
- 테스트: **복잡**

**결론**: 비용 대비 효용이 낮음

---

## 📊 최종 답변

### 질문: 가능할까요?

**답**: ✅ **기술적으로 가능합니다**

**하지만**:
- 복잡도가 매우 높음
- 3-4일 개발 시간 필요
- 검색/관리 기능 손실
- PDF 변환이 더 실용적일 수 있음

**권장**:
1. **단기**: PDF 변환 기능 (4-6시간)
2. **장기**: 정적 사이트 생성기 통합 (Hugo, Jekyll 등)
3. **현실**: Markdown ZIP 다운로드 (1시간)

어떤 방향으로 진행하시겠습니까?
