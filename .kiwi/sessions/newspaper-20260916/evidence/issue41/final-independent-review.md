# Issue #41 final independent closure review

Date: 2026-09-22  
Reviewed revision: `a32641f6814b6859eafad6453c73f493d46d9909`  
Parent issue: `#41 신문지 디자인 시스템과 전체 화면 적용`

## Verdict

**CLOSE — Critical 0 / High 0 / Medium 0 / Low 0.**

The newspaper rollout satisfies the parent issue's completion contract. Issues #42 through #89 are closed, their implementation and gap-closing commits are ancestors of the reviewed revision, the six previously stale newspaper requirements are verified with per-AC evidence, and the final #77 audit is independently accepted and closed.

## GitHub and revision state

- Live GitHub state: #41 is open; every child and follow-up issue #42–#89 is closed. No other repository issue is open.
- The reviewed branch is synchronized with `origin/kiwi/orch/newspaper-20260916/integration` at `a32641f6814b6859eafad6453c73f493d46d9909`.
- Forty-six representative design, implementation, follow-up, final-audit, and evidence-integrity commits were checked as ancestors; none was missing.
- Final #77 commit `7b36ca03287bdb56f9114585441bfb3febe4cbca` has parent `83ae0fc9808e1edc5e049e17e1d9b5657aef29aa`, message `fix(ui): close newspaper regression gaps`, and `Closes #77`. It contains no AI/tool signature trailer.
- Evidence-integrity repair commit `a32641f6814b6859eafad6453c73f493d46d9909` has sole parent `7b36ca03287bdb56f9114585441bfb3febe4cbca` and restores the canonical evidence files that the initial commit omitted through ignore rules.

## Design system and screen inventory

- The user-approved newspaper design decision, light HTML, dark comparison, style guide, forms guide, and implementation handoff remain the design authority.
- The approved light palette is preserved: app `#E9E7E2`, document `#F5F4EF`, sidebar `#DEDDD6`, primary text `#242521`, secondary text `#65665F`, subtle border `#CCCBC3`, primary action `#365B70`, selected surface `#DFE7E9`.
- The delegated dark palette, light/dark/system runtime, anonymous first paint, per-user persistence, portal inheritance, editor integration, and role-specific settings visibility have current evidence.
- Radix and shadcn conventions, semantic palette→role-token→component layering, shared controls, overlays, tables, states, shell, tree, search, links/tags, editor modes and complex content, versions/conflicts/files, authentication/install, all fourteen settings categories, administration flows, and application failure/empty states are represented in the final ledger.
- The final role matrix contains 112 observations across eight roles and fourteen environments. The composition matrix contains eight live-preview/source × light/dark × 100%/200% product cells plus form, PrincipalPicker, L2, and L3 consumers. Tree evidence covers bounded large-tree virtualization and first/middle/last identity through resize and true zoom.
- Native Windows IME and native OS high-contrast UI were not exercised. This is an accepted method limitation under the Astra Playwright-only closure addendum. Synthetic product composition, exact persistence, correction/cancellation, composing-Enter guards, theme/system transitions, autosave, selection, undo, true zoom, forced-colors emulation, and relevant consumer boundaries passed. No native verification is claimed.

## Requirements and final evidence

The six newspaper requirements that were stale before #77 are now verified:

| Requirement | Status | ACs |
| --- | --- | ---: |
| `IR-SHELL-002` | verified | 8/8 |
| `IR-SHELL-006` | verified | 10/10 |
| `IR-SHELL-008` | verified | 6/6 |
| `IR-EDITOR-002` | verified | 5/5 |
| `IR-PRINCIPAL-001` | verified | 5/5 |
| `FR-STORAGE-010` | verified | 7/7 |

The final #77 ledger contains 427 rows: PASS 406 and source-backed N-A 21. `independentReviewAccepted=true` and `closureEligible=true`. Axis A and Axis B review SHA-256 values are recorded in `closeout-acceptance.json`.

`SEC-STORAGE-007` truthfully remains `in_progress` with AC-3 unchecked. Its open branch is workspace archive behavior, and both the requirement notes and governing decisions assign that operation to Phase 2. Parent #41 explicitly excludes archive/restore and other Phase 2 functionality, so this is not a #41 blocker.

## Validation, tests, and distribution

- SpecKiwi summary: verified 212, implemented 69, in progress 3; no blocked, draft, deprecated, stability-blocker, stability-warning, or missing-evidence entry.
- Full final suites: editor 261 passed and 1 skipped; server 1,621 passed; web 1,384 passed.
- Typecheck and production builds passed for all workspaces.
- Final #77 manifest SHA-256: `efc22b539edccd6277f7bb996dec2762462cf9031320e8c1c314eba939c99f8c`. All 1,702 artifact and 42 source Git-blob hashes recomputed from commit `a32641f6814b6859eafad6453c73f493d46d9909` with zero missing, size, or hash mismatch. The canonical validation receipt covers 1,754 entries, 427 ledger rows, and 77 browser-inventory entries with zero errors and zero secret matches. The secret scan covers 1,702 files with zero exclusions and zero concrete secret matches.
- The repair's committed `evidence-integrity-independent-review-pending.md` is a pre-review placeholder, not a negative product result. This independent #41 closure review performs the requested post-repair verification against the committed Git blobs and supersedes that pending state with the C0/H0/M0/L0 verdict above.
- The web build emitted `THIRD_PARTY_NOTICES.md` plus complete license files for Radix AlertDialog, class-variance-authority, clsx, tailwind-merge, Tailwind CSS, `@tailwindcss/vite`, and shadcn. Independent foundation evidence records exact-byte license matches and a 19/19 distribution test.

## Known non-blocking repository diagnostics

- `SRS-W072` remains the explicitly approved known exception documented in `docs/plan/2026-09-02-srs-w072-decision.md`; it is not a #41 completion condition.
- `IR-AUDIT-004` retains the pre-existing malformed GitHub issue field `32`. It does not affect the requirement's implementation evidence or the #41 newspaper rollout and was not introduced by this work.

## Proposed exact GitHub body update

Retain the live #41 body before `## 작업 목록` and the existing reference-document snapshot after the task section. Replace the current `## 작업 목록` block with the following exact Markdown:

```markdown
## 작업 목록

- [x] #42 — 신문지 디자인 적용을 위한 SRS와 미결 UX 계약 정리
- [x] #43 — shadcn UI 스타일 빌드와 공통 컴포넌트 진입점 구성
- [x] #44 — 신문지 라이트 팔레트와 의미별 디자인 토큰 작성
- [x] #45 — 신문지 다크 테마 시안과 팔레트 결정
- [x] #46 — 개인 설정과 루트 테마 적용 경로 연결
- [x] #47 — 공통 입력·버튼·선택 컨트롤 구현
- [x] #48 — 공통 모달·팝오버·메뉴·위험 확인 외관 구현
- [x] #49 — 관리 표·목록·배지와 공통 상태 컴포넌트 구현
- [x] #50 — 신문지 앱 셸과 문서 탭·헤더 레이아웃 적용
- [x] #51 — 문서 트리·즐겨찾기·인라인 이름 입력 디자인 적용
- [x] #52 — 전역 검색·필터·결과 목록 디자인 적용
- [x] #53 — 백링크·아웃고잉·태그 패널 디자인 적용
- [x] #54 — 읽기·라이브 프리뷰·소스 편집에 타이포그래피와 테마 연결
- [x] #55 — 코드·표·수식·Mermaid·태그의 신문지 스타일 적용
- [x] #56 — 버전 기록·비교·복원 화면 디자인 적용
- [x] #57 — 저장 충돌 병합·본문 구제·미저장 교체 확인 디자인 적용
- [x] #58 — 이미지·파일 다운로드·새 버전 업로드 화면 디자인 적용
- [x] #59 — 로그인·가입 신청 화면 디자인 적용
- [x] #60 — 최초 설치 마법사와 확인 화면 디자인 적용
- [x] #61 — 설정 모달 셸과 14개 카테고리 디자인 적용
- [x] #62 — 에디터·테마·계정 설정 디자인 적용
- [x] #63 — 액세스 토큰 목록·발급·평문 표시·폐기 디자인 적용
- [x] #64 — 휴지통 목록·복원·영구 삭제 디자인 적용
- [x] #65 — 문서·디렉토리 공유와 권한 조작 디자인 적용
- [x] #66 — 이동·복사 목적지와 영향 확인 디자인 적용
- [x] #67 — 사용자 관리·가입 승인 디자인 적용
- [x] #68 — 그룹과 구성원 관리 디자인 적용
- [x] #69 — 권한 감사의 회수·시뮬레이션·상속 화면 디자인 적용
- [x] #70 — 감사 로그·묶음 상세·재조정 대기열 디자인 적용
- [x] #71 — 인스턴스 설정의 정책 폼과 저장 상태 디자인 적용
- [x] #72 — 워크스페이스 관리·전체 목록 화면 연결 및 디자인 적용
- [x] #73 — 워크스페이스 생성 폼을 설정에 연결하고 디자인 적용
- [x] #74 — 오프보딩 단계 화면의 진입점과 디자인 적용
- [x] #75 — 색인 대기열 설정 본문 연결 및 디자인 적용
- [x] #76 — 앱 초기·문서 없음·세션·네트워크 상태 디자인 적용
- [x] #77 — 전체 화면 신문지 테마·접근성·편집 회귀 검증

## 후속 결함 해소 추적

- [x] #78 — 권한 부여 응답에 회수 capability receipt 추가
- [x] #79 — 이동·복사 프리뷰와 실행 결과를 실제 요청에 연결
- [x] #80 — 사용자 관리와 가입 승인 결과를 실제 요청에 연결
- [x] #81 — 그룹 조회와 구성원 추가를 실제 요청에 연결
- [x] #82 — 그룹 삭제 영향과 L3 확인을 연결
- [x] #83 — 관리 권한 워크스페이스 범위 조회 계약 추가
- [x] #84 — 권한 회수용 슈퍼유저 우회 메타데이터 제공
- [x] #85 — 상속 복원 전 영향 미리보기와 L2 확인 계약 추가
- [x] #86 — 관리 워크스페이스가 없는 슈퍼유저의 감사 로그 진입 경로
- [x] #87 — 보존 기간 축소 영향 건수 프리뷰와 확인 관문 연결
- [x] #88 — 설정 모달 자식 폼의 미저장 이탈 가드 연결
- [x] #89 — 워크스페이스 관리자 부여의 권위 있는 영향 미리보기 추가

## 최종 종료 증거

- [x] #42–#89 전건 CLOSED 및 최종 revision `a32641f6814b6859eafad6453c73f493d46d9909`의 조상으로 확인
- [x] 최종 #77 ledger PASS 406 / source-backed N-A 21 / FAIL·BLOCKED·NOT-RUN 0
- [x] Axis A·Axis B 독립 검토 Critical/High/Medium/Low 0
- [x] `IR-SHELL-002`, `IR-SHELL-006`, `IR-SHELL-008`, `IR-EDITOR-002`, `IR-PRINCIPAL-001`, `FR-STORAGE-010` verified
- [x] 전체 unit·typecheck·build, 역할·접근성·편집·보안·라이선스 배포 증거 통과
- [x] Native Windows IME·native OS high contrast는 Astra Playwright-only 결정에 따른 비차단 미검증 한계로 명시; native PASS 주장 없음
```

After applying that body update, add a closeout comment linking this review and commits `7b36ca03287bdb56f9114585441bfb3febe4cbca` and `a32641f6814b6859eafad6453c73f493d46d9909`, then close #41.
