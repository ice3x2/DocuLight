# 정적 HTML 빌드 및 다운로드 기능 연구

**목적**: 현재 문서를 정적 HTML 페이지로 빌드하여 ZIP 다운로드
**필요 라이브러리**: ✅ 모두 설치됨 (puppeteer, archiver, adm-zip)

---

## 📋 구현 가능 방법 (2가지)

### 방법 1: 클라이언트 사이드 (Browser-based) ⭐ 권장

#### 동작 방식
```
[사용자가 다운로드 버튼 클릭]
   ↓
현재 렌더링된 DOM 캡처
   ↓
HTML 문자열 생성
   ↓
CSS 인라인화
   ↓
이미지 Base64 인코딩
   ↓
JSZip으로 압축
   ↓
Blob 생성 → 다운로드
```

#### 기술 스택
```javascript
// 클라이언트에서 실행
import JSZip from 'jszip';  // 필요 시 CDN 추가

// HTML 캡처
const html = document.documentElement.outerHTML;

// CSS 인라인화
const styles = Array.from(document.styleSheets)
  .map(sheet => Array.from(sheet.cssRules)
    .map(rule => rule.cssText).join('\n'))
  .join('\n');

// ZIP 생성
const zip = new JSZip();
zip.file('index.html', fullHTML);
zip.file('styles.css', styles);

// 다운로드
const blob = await zip.generateAsync({type: 'blob'});
saveAs(blob, 'document.zip');
```

#### 장점
- ✅ 서버 부하 없음
- ✅ 실시간 처리 (< 1초)
- ✅ 현재 상태 그대로 저장
- ✅ 구현 간단

#### 단점
- ⚠️ 클라이언트 리소스 사용
- ⚠️ 큰 문서는 브라우저 메모리 부담
- ⚠️ 외부 리소스 포함 어려움 (CDN 등)

---

### 방법 2: 서버 사이드 (Puppeteer-based)

#### 동작 방식
```
[사용자가 다운로드 버튼 클릭]
   ↓
서버로 요청 전송 (POST /api/export)
   ↓
Puppeteer 헤드리스 브라우저 실행
   ↓
현재 문서 URL로 네비게이션
   ↓
완전히 렌더링된 HTML 캡처
   ↓
리소스(CSS, 이미지) 함께 수집
   ↓
Archiver로 ZIP 압축
   ↓
클라이언트로 ZIP 전송
```

#### 기술 스택
```javascript
// 서버 코드 (새로 작성)
const puppeteer = require('puppeteer');
const archiver = require('archiver');

router.post('/api/export', async (req, res) => {
  const { path } = req.body;

  // Puppeteer로 렌더링
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(`http://localhost:3000/doc/${path}`);

  // HTML 캡처
  const html = await page.content();

  // ZIP 생성
  const archive = archiver('zip');
  archive.append(html, { name: 'index.html' });
  // CSS, images 추가...

  res.attachment('document.zip');
  archive.pipe(res);
  archive.finalize();
});
```

#### 장점
- ✅ 완전한 렌더링 (Mermaid, Highlight.js 포함)
- ✅ 외부 리소스 모두 포함 가능
- ✅ 클라이언트 부담 없음
- ✅ 고품질 결과물

#### 단점
- ⚠️ 서버 리소스 사용 (CPU, 메모리)
- ⚠️ 처리 시간 길 수 있음 (5-10초)
- ⚠️ 동시 요청 시 서버 부하
- ⚠️ Puppeteer 설치 필요 (이미 됨)

---

## 🎯 권장 방법

### **클라이언트 사이드** (방법 1) ⭐

**이유**:
1. 서버 부하 없음
2. 빠른 처리 (< 1초)
3. 구현 간단 (100줄 미만)
4. DocLight 철학에 맞음 (lightweight)

**구현 복잡도**: ⭐⭐☆☆☆ (낮음)
**예상 개발 시간**: 2-3시간

---

## 📋 구현 계획 (클라이언트 사이드)

### Phase 1: 기본 HTML 다운로드
```javascript
// 다운로드 버튼 클릭 시
async function exportCurrentDocument() {
  const content = document.getElementById('markdown-content');
  const breadcrumb = document.getElementById('breadcrumb');

  // HTML 생성
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${breadcrumb.textContent}</title>
  <style>${inlineCSS}</style>
</head>
<body>
  ${content.innerHTML}
</body>
</html>
  `;

  // 다운로드
  const blob = new Blob([html], {type: 'text/html'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'document.html';
  a.click();
}
```

### Phase 2: ZIP으로 패키징
```javascript
// JSZip 사용 (CDN 추가 필요)
const zip = new JSZip();
zip.file('index.html', html);
zip.file('styles.css', css);

const blob = await zip.generateAsync({type: 'blob'});
saveAs(blob, 'document.zip');
```

### Phase 3: 리소스 포함
- 이미지 Base64 인코딩
- CSS 인라인화
- Highlight.js 스타일 포함

---

## ⚖️ 복잡도 vs 효용성

### 효용성
- ✅ 오프라인 문서 보관
- ✅ 공유 용이
- ✅ 독립 실행 가능

### 복잡도
- **기본**: ⭐⭐☆☆☆ (HTML만)
- **ZIP**: ⭐⭐⭐☆☆ (JSZip 추가)
- **완전**: ⭐⭐⭐⭐☆ (리소스 포함)

### 제약사항
- Mermaid 다이어그램: SVG로 변환 필요
- 외부 CDN 리소스: 인라인화 필요
- 상대 경로 이미지: Base64 또는 포함

---

## 결론: **구현 가능** ✅

**권장 방법**: 클라이언트 사이드 (JSZip)
**예상 시간**: 2-3시간
**복잡도**: 중간
**효용성**: 높음

구현하시겠습니까?
