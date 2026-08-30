# 브라우저 잔여 — 세션 핸드오프

| Field | Value |
| --- | --- |
| 작성일 | 2026-08-30 |
| 저장소 / 브랜치 | `C:\Work\git\DocuLight2.0` / `master` |
| 최종 작업 목표 | 원장 §4 각 기준의 「브라우저 잔여」 일곱을 브라우저 검사로 세운다 |
| 현재 상태 | 기반 완성 · 잔여 0/7 착수 · 워킹트리 clean |
| SSOT | `C:\Work\git\DocuLight2.0\docs\analysis\phase1-acceptance-matrix.md` |
| 다음 세션 첫 행동 | 서버·web 을 띄우고 `npm run test:browser:all --workspace @doculight/web` 이 12/12 인지 확인한 뒤 잔여 하나를 고른다 |

> 이 문서는 다음 세션이 **이 문서와 SSOT 만 읽고** 자율적으로 이어갈 수 있도록 정리한 것이다.
> 대화 히스토리에 의존하지 말 것.

---

## 0. 다음 세션의 첫 행동

1. 이 문서를 끝까지 읽는다.
2. `C:\Work\git\DocuLight2.0\docs\analysis\phase1-acceptance-matrix.md` 를 정독한다 — 기준
   열셋의 「브라우저 잔여」 칸이 이 세션의 작업 목록이다.
3. `git status --porcelain` 이 **빈 출력**인지 확인한다. 이 문서까지 커밋한 상태로
   넘긴다 — 무언가 보이면 그 사이 누가 작업한 것이다.
4. **환경을 세운다** — 아래 「브라우저 검사를 돌리는 절차」를 그대로 따른다. 이 단계를
   건너뛰면 검사가 종료 코드 `2`(재지 못했다)로 나간다.
5. 기존 검사 셋이 12/12 인지 먼저 확인한다. 초록이 아니면 새 검사를 쓰기 전에 그 원인부터
   찾는다 — 기반이 흔들리는 상태에서 새 판정을 얹으면 실패의 출처가 갈리지 않는다.
6. 「남은 작업 전체 목록」에서 잔여 하나를 골라 착수한다. **기준 6·12 를 권한다** — 둘이
   `MergeView` 라는 같은 부품을 쓰므로 검사 하나가 두 기준을 함께 닫는다.

## 1. 최종 작업 목표

원장 §4 열세 기준은 **이미 모두 섰다**(2026-08-29). 각각 탐침 또는 브라우저 검사를 지났고
`docs/analysis/phase1-acceptance-matrix.md` 가 그 근거를 기준마다 적고 있다.

남은 것은 그 표의 **「브라우저 잔여」 칸**이다. 그것은 *아무도 재지 않은 축*이 아니라
*이미 재어진 축을 브라우저에서 한 번 더 확인하는 일*이다. 이 구별이 범위를 정한다 —
잔여를 닫지 못해도 기준은 이미 서 있고, 잔여를 닫으면 그 기준이 실제 화면에서도 참임이
확인된다.

**완료 조건**: 잔여 일곱 각각에 대해 ⓐ 브라우저 검사가 서고 ⓑ 그 검사가 뮤테이션 탐침에
물며 ⓒ `npm run test:browser:all --workspace @doculight/web` 에 등록되어 전건 통과한다.

## 2. 현재까지 완료한 작업

- [x] `packages/web` 브라우저 검사 기반 — `C:\Work\git\DocuLight2.0\packages\web\test\_web-harness.mjs`
      (커밋 `6d9d418`). editor 의 `_browser-harness.mjs` 를 재사용하고 web 전용 절차만 더했다.
- [x] `focus-retention-check.mjs` (판정 5) — `FR-EDITOR-009` AC-1~AC-4. 커밋 `6d9d418`
- [x] `ime-composition-check.mjs` (판정 3) — 원장 §4 **수용 기준 7**. 커밋 `2c59746`
- [x] `search-layout-check.mjs` (판정 4) — `FR-SHELL-013` AC-5·AC-12. 커밋 `052dee7`
- [x] 브라우저 검사 실행 — `DOCULIGHT_E2E_USER=e2e DOCULIGHT_E2E_PASS=e2e-pass-2026
      npm run test:browser:all --workspace @doculight/web` (2026-08-29 실행, **12/12 통과**,
      종료 코드 0)
- [x] 전체 회귀 — `npm test` (2026-08-29 실행, exit 0, editor 253 통과 1 건너뜀 / server
      1336 통과 / web 536 통과)
- [x] 타입 검사 — `npm run typecheck` (2026-08-29 실행, exit 0)
- [x] 독립 검증 — 서브에이전트가 세 스위트를 직접 실행해 위 수치를 대조했다. 판정 `pass`,
      false_claims 0, 탐침 잔여 0

### 2.1 기억과 실제가 달랐던 항목

| 기록된 진술 | 실제 (확인 명령) |
| --- | --- |
| "기준 1(실제 볼트)과 7(한글 IME)은 사용자가 값을 주어야 하는 미결이다" | **틀렸다.** 둘 다 2026-08-24 회차의 증거가 SRS 에 등록돼 있었다. `ls docs/analysis/2026-08-25.browser-manual-verification/` 로 그 회차 산출물을 확인했고 `grep -rn "2026-08-25.browser-manual-verification" docs/spec/*.srs.md` 가 `FR-EDITOR-001` VE-1 · `CON-ARCH-006` VE-3 · `FR-EDITOR-007` VE-4 를 돌려준다 |
| "저장 후 포커스 유실이 미해소다" (2026-08-24 관측을 그대로 인용) | **지금 코드에서는 재현되지 않는다.** `node test/focus-retention-check.mjs` 가 AC-1 을 PASS 로 판정한다. `documentId` 배선을 빼는 탐침에도 AC-1 은 죽지 않으므로 그 배선이 지키는 축도 아니다 — 그 사이 다른 변경으로 해소된 것으로 **추정**한다(어느 변경인지는 특정하지 못했다) |
| "`FR-EDITOR-009` 시험을 세웠다" (첫 판) | **그 시험은 공허했다.** 아무것도 치지 않고 저장하면 캐시가 같은 문자열로 갱신돼 재마운트 자체가 일어나지 않는다. `documentId` 를 빼는 탐침에 죽지 않았고, 친 글자를 넣은 뒤에야 물었다 |
| "harness 가 429 를 구별해 안내한다" | **처음에는 거짓이었다.** 그 코드를 넣으려던 치환이 실패했는데 실패를 알아채지 못하고 문서에 적었다. 검증 준비 중 `grep -c 429 packages/web/test/_web-harness.mjs` 가 0 을 돌려주어 드러났고, 그 자리에서 실제로 넣어 참으로 만들었다(지금은 3건). **치환·편집이 실패해도 그 뒤 작업은 그대로 진행된다 — 반영을 확인하지 않으면 안 된 일이 된 일로 기록된다** |
| "AC-12 검사를 세웠다" (첫 판) | **그 판정은 넓었다.** 「화면 어딘가가 스크롤되는가」를 보아 결과 영역의 스크롤 표식을 떼도 통과했다. 결과 영역 자신을 보도록 좁힌 뒤에야 물었고, **그 좁힘이 실제 결함까지 드러냈다** — `data-scroll="y"` 를 받는 CSS 가 0건이었다 |

## 3. 현재 워킹트리·저장소 상태

- 브랜치: `master` (origin `B:/work/git/DocuLight2.0.git` 대비 behind 0)
- 미커밋 파일: **없음(clean).** 이 핸드오프 문서와 `docs/next/LATEST.md`,
  그리고 `packages/web/test/_web-harness.mjs` 의 429 안내까지 커밋했다.
  **HEAD 해시를 여기 적지 않는다** — 이 문서를 커밋하면 그 해시가 바뀌므로 적는 순간
  틀린 값이 된다. 마지막 커밋의 제목은 `docs(next): 브라우저 잔여 작업을 위한 핸드오프를
  남긴다` 이며 `git log --oneline -3` 으로 확인한다
- **origin 은 같은 기계의 `B:` 드라이브다.**
  네트워크 매핑이 아니라 로컬 경로의 bare 저장소이므로 푸시해도 사본이 이 기계를 벗어나지
  않는다. 기계 밖 원격은 등록돼 있지 않다

## 4. 관련 문서·코드 (절대경로)

| 문서 | 절대경로 | 역할 |
| --- | --- | --- |
| **SSOT** | `C:\Work\git\DocuLight2.0\docs\analysis\phase1-acceptance-matrix.md` | 기준 열셋의 확정 상태와 「브라우저 잔여」 목록 |
| 원장 | `C:\Work\git\DocuLight2.0\docs\spec\00.decision-log.md` §4 (690~712행) | 수용 기준 열셋의 원문 |
| 앞 회차 수동 검증 | `C:\Work\git\DocuLight2.0\docs\analysis\2026-08-25.browser-manual-verification\README.md` | 실제 볼트로 잰 회차. CDP 로 IME 조합을 내는 방법의 출처 |
| 저널 | `C:\Work\git\DocuLight2.0\kiwi\waves.jsonl` | 회차별 결정·탐침·이월. 마지막 행이 wave-7 verify |

**참고 선례 (새 검사를 쓸 때 이 모양을 따른다)**

- `C:\Work\git\DocuLight2.0\packages\web\test\_web-harness.mjs` — 로그인·문서 준비·트리에서
  열기. `runBrowserChecks` · `waitUntil` · `unmeasurable` 은 editor 것을 재수출한다
- `C:\Work\git\DocuLight2.0\packages\web\test\search-layout-check.mjs` — **계산된 기하**를
  재는 모양. 잔여 대부분이 이 부류다
- `C:\Work\git\DocuLight2.0\packages\web\test\ime-composition-check.mjs` — CDP 를 직접 쓰는 모양
- `C:\Work\git\DocuLight2.0\packages\editor\test\_browser-harness.mjs` — 기계장치의 원본.
  **여기를 고치면 editor 검사 넷이 함께 영향받는다**

**등록 자리**: `C:\Work\git\DocuLight2.0\packages\web\package.json` 의 `test:browser:all`

## 5. 확정된 결정 (변경 금지)

1. **브라우저 검사는 개인 볼트에 기대지 않는다** — 검사가 자기 문서를 만들고 끝나면 지운다.
   **확정**. (근거: `packages\web\test\_web-harness.mjs` 의 `makeDocument`·`removeDocument`,
   그리고 그 파일 머리 주석)
2. **계정은 환경변수로 받는다** — 값을 코드에 박지 않는다. **확정**.
   (근거: 같은 파일의 `DOCULIGHT_E2E_USER`·`DOCULIGHT_E2E_PASS`)
3. **전제가 서지 않으면 실패가 아니라 종료 코드 `2`(재지 못했다)로 나간다** — 서버가 없거나
   로그인이 안 되는 것은 판정 실패가 아니다. **확정**. (근거: `unmeasurable` 사용처)
4. **editor 의 harness 를 재사용하고 사본을 만들지 않는다** — 브라우저를 띄우고 판정을
   집계하는 절차는 두 패키지가 같다. **확정**. (근거: `_web-harness.mjs` 의 `HARNESS` import)
5. **판정은 겨눈 대상 자신을 본다** — 「화면 어딘가가」로 재면 탐침에 물지 않는다.
   **확정**. (근거: `search-layout-check.mjs` 의 AC-12 판정과 그 주석)
6. **`SEC-STORAGE-007` 은 phase-2 로 이관한다** — 남은 AC-3 이 아카이브 축이고 제약 C-04 가
   아카이브를 phase-2 로 정했다. **확정**. (근거: `kiwi/waves.jsonl` 의 `R-W5-STORAGE-007`)

## 6. 미결정·유예 항목

- **원장 §4 가 인증 축을 수용 기준에 넣지 않은 문제** — 로그인(R57·R60·R60-b) · 로그아웃(R145) ·
  비밀번호 변경(R144) 중 어느 것도 열셋에 없다. 원장 스스로 그 사실을 §4 위 인용 블록에 적고
  *"다음 개정에서 ① 기준을 추가할지 ② 추가하지 않을 사유를 여기 남길지 판정하라"* 고 지시해
  두었다. **원장을 고치는 일이라 사용자 결정이 필요하다.** 이 세션의 잔여 작업과 독립이다
- **기준 1 의 실제 볼트 재실행** — 개인 데이터가 필요하고 2026-08-24 증거가 살아 있다.
  결정 방법: 사용자가 사본 경로를 줄 때만 수행
- **루트 `npm run test:browser:all` 이 한 번에 성립하지 않는 문제** — 아래 함정 절에 상세.
  결정 방법: 잔여 작업을 하며 포트를 나눌지, 루트 스크립트를 고칠지 판단

## 7. 남은 작업 전체 목록

「브라우저 잔여」 일곱이다. SSOT 의 각 기준 절에 같은 내용이 있다.

- [ ] **기준 6 · 12 — `MergeView` 실제 렌더와 두 세션 왕복** — 완료 조건: 두 브라우저
      컨텍스트가 같은 문서를 열어 한쪽이 저장한 뒤 다른 쪽이 저장하면 병합 화면이 뜨고 양쪽
      본문이 그 안에 보인다. 버전 비교 화면도 같은 부품이므로 함께 잰다.
      **둘을 한 검사로 닫을 수 있어 우선순위가 가장 높다**
- [ ] **기준 8 — 실제 `DataTransfer` 드래그와 clipboard paste** — 완료 조건: Playwright 의
      실제 드롭과 붙여넣기로 파일이 올라가고 `.res` 아래 해시 이름으로 저장된다.
      (의존성: 없음)
- [ ] **기준 11 — 삭제→복구를 화면에서 누르는 왕복** — 완료 조건: 트리에서 삭제하고 휴지통
      화면에서 복구하면 원위치에 서고 버전 이력이 남아 있다. (의존성: 없음)
- [ ] **기준 3 — `[[` autocomplete 팝업** — 완료 조건: 편집기에 `[[` 를 치면 후보 팝오버가
      뜨고 키보드로 고를 수 있으며 고른 결과가 본문에 링크로 들어간다. (의존성: 없음)
- [ ] **기준 4 — 두 계정의 화면 차이** — 완료 조건: 권한이 다른 두 계정이 같은 주소를 열어
      서로 다른 트리를 본다. **계정 둘이 필요하다** — harness 에 두 번째 계정을 받는 자리를
      더해야 한다. (의존성: harness 확장)
- [ ] **기준 10 — 깨진 이미지의 겉모습** — 완료 조건: 권한을 잃은 첨부가 본문에서 깨진
      이미지로 보인다(`naturalWidth === 0`). **브라우저가 정말 필요한지부터 판단한다** —
      필요 없으면 그 사실을 SSOT 에 적고 잔여에서 뺀다. (의존성: 없음)
- [ ] **기준 2 — 인라인 일곱 요소의 실제 렌더** — 완료 조건: 헤딩·강조·목록·링크·인용·
      코드블록·수식이 실제 브라우저에서 숨고 드러난다. **브라우저가 정말 필요한지부터
      판단한다** — 그 일곱은 인라인 데코레이션이라 위젯 기하가 걸리지 않는다.
      필요 없으면 그 사실을 SSOT 에 적고 잔여에서 뺀다. (의존성: 없음)

## 8. 다음 세션 지시서

### 브라우저 검사를 돌리는 절차 (그대로 복붙)

**이 절차 없이는 검사가 종료 코드 `2` 로 나간다.** 서버 데이터는 임시 디렉터리에 격리하므로
기존 데이터를 건드리지 않는다. 아래 `<임시>` 는 **이 세션의 스크래치패드 경로로 바꿔라** —
경로는 세션마다 다르고 앞 세션 것은 남아 있지 않을 수 있다.

```bash
# 1) API 서버를 임시 데이터로 띄운다 (packages/server 에서)
cd C:/Work/git/DocuLight2.0/packages/server
DOCULIGHT_DATA_DIR="<임시>/e2e-data" PORT=3400 npx tsx src/main.ts > "<임시>/server.log" 2>&1 &

# 2) 콘솔에 나온 설치 토큰으로 설치를 마친다
TOKEN=$(grep -oE '설치 토큰: .*' "<임시>/server.log" | head -1 | sed 's/설치 토큰: //')
SESSION=$(curl -s -X POST http://localhost:3400/api/install/verify-token \
  -H 'content-type: application/json' -d "{\"token\":\"$TOKEN\"}" \
  | python -c "import sys,json; print(json.load(sys.stdin).get('installSession',''))")
curl -s -X POST http://localhost:3400/api/install/commit -H 'content-type: application/json' \
  -d "{\"installSession\":\"$SESSION\",\"superuserName\":\"e2e\",\"password\":\"e2e-pass-2026\",\"workspaceName\":\"시험팀\",\"defaultGroupLevel\":\"edit\",\"signupMode\":\"open\"}"

# 3) web dev 서버 (packages/web 에서)
cd C:/Work/git/DocuLight2.0/packages/web && npx vite > "<임시>/web.log" 2>&1 &

# 4) 검사
cd C:/Work/git/DocuLight2.0/packages/web
DOCULIGHT_E2E_USER=e2e DOCULIGHT_E2E_PASS=e2e-pass-2026 npm run test:browser:all
```

기대 결과: **12/12 통과, 종료 코드 0.** 2026-08-29 에 이 절차로 그 결과를 얻었다.

### 새 검사를 세우는 절차

1. `search-layout-check.mjs` 를 골격으로 복사한다 → 검증: `_web-harness.mjs` 에서
   `runBrowserChecks` · `login` · `makeDocument` · `removeDocument` 를 import 하는 모양이 같다
2. 판정을 **겨눈 대상 자신**을 보도록 쓴다 → 검증: 그 대상의 구현을 고의로 망가뜨리면
   판정이 죽는다. 죽지 않으면 판정이 넓은 것이다 — 좁힐 때까지 그 검사는 완성이 아니다
3. `packages/web/package.json` 의 `test:browser:all` 에 등록한다 → 검증:
   `npm run test:browser:all --workspace @doculight/web` 이 새 판정을 포함해 전건 통과한다
4. `npm test` 와 `npm run typecheck` 를 돌린다 → 검증: 둘 다 exit 0
5. SRS 에 증거를 등록한다 (MCP `add_verification_evidence`) → 검증: `validate_spec` 오류 0
6. SSOT(`phase1-acceptance-matrix.md`)의 해당 기준 「브라우저 잔여」 칸을 갱신한다 →
   검증: 요약표의 값과 각 절의 서술이 어긋나지 않는다

## 9. 거버넌스·게이트·함정

### 규칙

- **요구 변경은 speckiwi MCP 로만.** `docs/spec/*.srs.md` 를 손으로 고치지 않는다
- **새 요구는 `Stability=draft` 로 선다.** 사용자가 2026-08-29 에 **「draft 를 evolving 으로
  올려 구현하는 것을 언제나 승인한다」**고 지시했으므로 다시 묻지 않는다
- **결정은 서브에이전트에 위임한다** (2026-08-29 사용자 지시). 권장·추천이 붙어 있으면
  1명이 타당성만 검토하고 자동 결정, 없으면 5명 위원회
- **새 시험을 쓰면 뮤테이션 탐침을 돌린다** — 반드시 **패키지 전체 스위트**로
- **커밋 메시지에 AI 시그니처를 넣지 않는다.** 제목에 `Phase n`·`Step n` 같은 단계 표식도 금지
- 볼트는 개인 데이터 — 사본만 쓰고 본문을 로그·보고서에 싣지 않는다

### 이번 세션에 실제로 밟은 함정

- **루트 `npm run test:browser:all` 은 한 번에 성립하지 않는다.** editor 검사(`EDITOR_URL`)와
  web 검사(`WEB_URL`)가 **둘 다 기본으로 `http://localhost:3399/` 를 본다**
  (`packages/editor/test/_browser-harness.mjs:18` · `packages/web/test/_web-harness.mjs:28`).
  두 앱은 그 포트를 다투므로 한쪽이 뜨면 다른 쪽 검사는 `unmeasurable`(종료 코드 2)로 나간다.
  **회피**: 지금은 `--workspace @doculight/web` 로 한쪽만 부른다. 둘 다 돌리려면 editor 데모를
  다른 포트에 띄우고 `EDITOR_URL` 을 넘겨야 한다
- **로그인은 15분 창에 10회로 제한된다.** 검사를 짧은 사이에 여러 번 돌리면 `429` 가 나고,
  그러면 harness 가 그 사실을 안내한다(계정 문제로 읽지 마라). **회피**: API 서버를
  재기동하면 in-memory limiter 가 즉시 초기화된다. 데이터는 파일·DB 에 있어 계정은 남는다
- **`new URL(...).pathname` 으로 파일 경로를 조립하면 Windows 에서 `C:/C:/...` 가 된다.**
  **회피**: `new URL(rel, import.meta.url).href` 를 그대로 import 한다
- **Bash 힙독 안에서 `\n` 이 실제 개행으로 풀린다.** 파이썬 스크립트를 힙독으로 넘길 때
  문자열 안의 `\n` 이 깨져 JS 가 파싱 오류를 낸다. **회피**: 스크립트를 스크래치패드에
  파일로 쓰고 `python <파일>` 로 실행하거나, `Write`·`Edit` 도구를 쓴다
- **검색은 기본 축이 `이름` 하나다.** 본문에만 표식을 넣으면 축을 켜지 않는 한 걸리지 않는다.
  **회피**: `makeDocument(page, body, 이름접두)` 의 셋째 인자로 이름에 표식을 담는다
- **`fill()` 은 제어 입력에서 React 가 변경을 못 볼 수 있다.** **회피**: `click()` 후
  `type(값, { delay: 10 })`
- **딥링크 `/{nodeId}` 로 문서가 열리지 않는다.** 트리가 도착한 뒤에만 성립한다.
  **회피**: `openInEditor(page, nodeId, name)` 이 트리에서 클릭한다

### 테스트 실행 명령 (복붙 가능)

```bash
cd C:/Work/git/DocuLight2.0 && npm test            # editor 253+1skip / server 1336 / web 536
cd C:/Work/git/DocuLight2.0 && npm run typecheck   # exit 0
```

## 10. 리스크·잔존 이슈

- **탐침 결과의 독립 재현이 없다** — SSOT 의 각 기준 절에 적힌 「탐침이 죽인 항 수」는 이
  저장소의 실행 기록이지만 다른 세션이 재현한 것은 아니다. 검증 서브에이전트도 코드 좌표의
  실재만 확인하고 재현은 하지 않았다. 영향: 그 표를 근거로 요구를 `verified` 로 올리려면
  재현이 필요하다 / 대응: 올릴 때 그 회차에서 다시 돌린다
- **기준 2·10 의 잔여는 실재하지 않을 수 있다** — 인라인 데코레이션과 깨진 이미지가 정말
  브라우저를 요구하는지 판단하지 않았다. 영향: 없는 일을 하게 될 수 있다 / 대응: 착수 전에
  「happy-dom 이 이것을 왜 못 재는가」를 한 문장으로 댈 수 있는지 먼저 확인한다.
  못 대면 잔여가 아니므로 SSOT 에서 뺀다
- **기계 밖 원격이 없다** — `origin` 은 같은 기계의 `B:` 드라이브다. 기계·디스크 장애에
  사본이 함께 사라진다. 영향: 이 저장소 전체 / 대응: 원격 추가는 사용자 결정 사항이다
