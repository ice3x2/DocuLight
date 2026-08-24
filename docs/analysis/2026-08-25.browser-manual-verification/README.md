# 브라우저 수동 검증 — 2026-08-25

`phase-1` 의 자동 검증이 불가능한 축 셋을 실제 브라우저에서 확인한 회차다.

| 항목 | 값 |
| --- | --- |
| 대상 | `FR-EDITOR-001` AC-1·AC-2 · `FR-EDITOR-007` AC-7 · 원장 §4 수용 기준 7(한글 IME) |
| 실행 스크립트 | `verify-manual.mjs` (이 디렉터리) |
| 실행 결과 | `verify-result.json` (이 디렉터리) |
| 도구 | Playwright 1.62.1 chromium (`packages/editor/node_modules`), 저장소 선례 `packages/editor/test/browser-check.mjs` 의 모양을 따랐다 |
| 결과 | 9개 판정 중 **7 통과 · 2 실패** |

---

## 1. 검증 환경

| 항목 | 값 |
| --- | --- |
| 볼트 | `C:\Work\Documents\Obsidian` — 옵시디언이 실제로 관리하는 볼트(`obsidian.json` 의 `vaults` 에 등재) |
| 볼트 규모 | md **1,315**건 · 비-md **133**건 · `.obsidian` 내 파일 **41**건 |
| 사본 | 편집을 포함하므로 **원본을 쓰지 않았다.** 세션 스크래치패드에 사본을 만들어 그것만 다뤘다 |
| 배치 | `docsRoot/<워크스페이스 ID>/…` 가 물리 구조다(`R40-a` — 디렉토리명이 곧 ID). 사본을 `docsRoot` 자체가 아니라 **기본 워크스페이스 디렉터리 안**에 넣어야 색인된다 |
| 색인 결과 | 트리에 파일 **1,451**개 (볼트 1,448 + 검증용 문서) |
| 서버 | `PORT=3400` · web `3399`. `--env-file` 은 이미 있는 환경변수를 덮지 않으므로 `PORT` 를 명시해야 한다 |
| 로그인 | 로그인 **화면**은 아직 자리표다(`PreAuthScreen`). 세션은 `POST /api/auth/login` 으로 세웠다 — 검증 대상이 에디터이므로 이 우회는 판정에 영향을 주지 않는다 |

### 화면 경로 (실측으로 확정)

| 모드 | 실제 부품 | 이 검증에서의 쓰임 |
| --- | --- | --- |
| 소스 | `<textarea>` (CodeMirror 가 아니다) | 원문 전량이 보이므로 **읽기 판정**에 썼다 |
| 라이브 프리뷰 | CodeMirror | **편집·표 데코레이션·IME 판정**에 썼다 |
| 저장 | 자동 저장 | 3~4초 뒤 `PUT /api/documents/:id` 200 |

---

## 2. 판정 결과

| # | 판정 | 결과 | 근거 |
| --- | --- | --- | --- |
| 1 | 볼트를 기본 워크스페이스에 그대로 넣으면 트리에 선다 | PASS | 파일 1,451개 색인 |
| 2 | **`FR-EDITOR-001` AC-1** 볼트 문서의 원문이 브라우저에 그대로 뜬다 | PASS | 소스 모드 화면 2,252자 = 디스크 파일 2,252자, **전문 일치** |
| 3 | `FR-EDITOR-001` AC-1 라이브 프리뷰에서도 렌더된다 | PASS | 보이는 줄 38개 |
| 4 | **`FR-EDITOR-001` AC-2** 브라우저에서 친 편집이 볼트 파일에 저장된다 | PASS | 표식이 디스크 파일에 반영 (2,252자 → 2,274자) |
| 5 | `FR-EDITOR-001` AC-2 되돌린 편집도 같은 경로로 저장된다 | PASS | 표식 제거가 디스크에 반영 |
| 6 | 저장 직후에도 편집기가 포커스를 유지한다 | **FAIL** | 아래 §3.2 |
| 7 | **`FR-EDITOR-007` AC-7** 숨는 절반 — 커서가 없으면 표 기호가 숨는다 | PASS | 표 위젯 1개 · 구분선 숨음 |
| 8 | **`FR-EDITOR-007` AC-7** 드러나는 절반 — 커서를 올리면 원문이 드러난다 | **FAIL** | 아래 §3.1 |
| 9 | **원장 §4 수용 기준 7** 한글 IME 조합이 편집 중 깨지지 않는다 | PASS | 「한글입력」 1회 · 낱자모 잔여 없음 |

---

## 3. 실패 둘

### 3.1 `FR-EDITOR-007` AC-7 의 「드러나는 절반」은 구현돼 있지 않다

AC-7 은 「커서가 없는 줄에서 표의 마크다운 기호가 숨겨지고, **그 줄에 커서를 올리면 원문이 드러난다**」를 요구한다. 숨는 절반은 동작하지만 드러나는 절반은 어떤 수단으로도 동작하지 않는다.

커서를 표 안으로 넣는 수단 **셋을 모두** 시도했고 셋 다 구분선(`---`)이 드러나지 않았다.

| 수단 | 결과 |
| --- | --- |
| 표의 `값` 칸을 클릭 | 안 드러남 |
| 첫 줄에서 아래 화살표 6회 | 안 드러남 |
| 마지막 줄에서 위 화살표 4회 | 안 드러남 |

**독립 근거**: 커서를 넣기 전(`ac7-hidden.png`)과 넣은 뒤(`ac7-revealed.png`)의 화면이 **바이트 단위로 동일**하다(md5 `a478f72652bff9dbf82513cbebe7aec1`). 화면이 전혀 바뀌지 않았다는 뜻이다.

**원인**: 표는 다른 아홉 요소와 **다른 방식으로 구현돼 있다.**

- 코드블록·수식 등은 `selectionTouches(state, from, to)` 로 커서가 닿는지 보고, 닿으면 데코레이션을 걷어 원문을 남긴다 (`packages/editor/src/core/code-blocks.ts:105`, `packages/editor/src/core/math-blocks.ts:39`).
- 표는 `packages/editor/src/vendor/atomic-editor/table-widget.ts` 의 **원자 위젯**이며, 그 파일에 선택 영역을 보고 데코레이션을 걷는 경로가 없다. 대신 `<table>` 을 그리고 각 칸을 `contenteditable` 인 `cm-atomic-table-cell-source` 로 만든다 — 즉 **원문을 드러내는 라이브 프리뷰가 아니라 칸을 직접 고치는 WYSIWYG 표 편집기**다.
- 위젯이 원자적이라 화살표 키는 표를 통째로 건너뛴다. 브라우저에서 `.cm-line` 을 세면 표의 세 줄이 목록에서 사라지고 `["앞 문단","","","뒤 문단",""]` 만 남는다.

**따라서 `FR-EDITOR-007` 은 `implemented` 로 올릴 수 없다.** AC-7 은 구현 작업이 남은 항목이며, `packages/editor/test/live-preview.test.tsx:265` 의 `it.skip` 이 「브라우저에서 확인」으로 미뤄 둔 것이 실제로는 **미구현을 가리고 있었다.**

### 3.2 저장이 끝나면 편집기가 포커스를 잃고, 이어 친 글자가 유실된다

자동 저장이 성공한 직후 `document.activeElement` 가 편집기에서 빠진다. 그 뒤에 친 글자는 문서에 들어가지 않고 사라지며, 사용자가 편집기를 다시 클릭해야 입력이 재개된다.

실측 순서는 이렇다.

| 조작 | 활성 요소 | 문서 끝줄 | 디스크 |
| --- | --- | --- | --- |
| 편집기 클릭 → `AAA` 입력 | `cm-content` | `AAA` | — |
| 자동 저장 (3초) | **(없음)** | `AAA` | `AAA` 반영 |
| 이어서 `BBB` 입력 | (없음) | `AAA` (그대로) | `BBB` **없음** |
| 다시 클릭 → `CCC` 입력 | `cm-content` | `AAACCC` | `CCC` 반영 |

`AC-2` 자체는 통과한다 — 편집과 저장이 실제로 동작하기 때문이다. 그러나 이 동작은 「글을 이어서 쓴다」는 편집의 기본 흐름을 끊으며, 사용자가 잃는 글자에 대해 어떤 표시도 하지 않는다. 원장 `R33-d`(CodeMirror 를 본문의 SSOT 로 둔다)와 `CON-ARCH-006` 이 막으려던 결함 계열과 같은 자리다.

---

## 4. 함께 발견한 것 — 새 노트를 만들면 열 수 없다

이 검증의 판정 대상은 아니지만 같은 기동에서 재현됐으므로 적어 둔다.

`POST /api/nodes` 는 DB 노드만 만들고 **파일을 만들지 않는다**(`packages/server/src/app/node/node-service.ts` 의 `createNode` 가 `nodes`·`workspaces`·`acl` 만 다룬다). 그래서 만든 직후 그 문서를 열면 서버가 `ENOENT` 로 500 을 낸다.

```
Error: ENOENT: no such file or directory, open '…\339084…\진단-1787589735615.md'
    at async readDocument (packages/server/src/app/document/save-service.ts:108:16)
    at async (packages/server/src/http/routes/workspace-api.ts:260:18)
```

화면의 「새 노트」 버튼도 같은 경로를 쓴다(`packages/web/src/App.tsx` 의 `createNote`). 즉 **새 노트를 만들면 그 노트를 열 수 없다.**

---

## 5. 재현 방법

```bash
# 1) 볼트 사본을 기본 워크스페이스 디렉터리 안에 넣는다 (사이드카 .workspace.json 은 보존)
cp -r "<볼트>/." "<docsRoot>/<워크스페이스 ID>/"

# 2) 서버와 web 을 띄운다 (기동 시 1회 재조정이 볼트를 색인한다)
cd packages/server && PORT=3400 DOCULIGHT_DOCS_ROOT=<docsRoot> DOCULIGHT_DATA_DIR=<dataDir> npm run dev
npm run dev            # 저장소 루트 — web 3399

# 3) 검증
node verify-manual.mjs           # --headed 로 눈으로 볼 수 있다
```

스크립트는 실행 때마다 대상 문서 둘을 먼저 원상복구하므로 같은 자리에서 반복해 돌릴 수 있다.
