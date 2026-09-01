# SpecKiwi SRS workflow v1.9

This repository uses `docs/spec/` as the required source of truth for requirements.

Before making any code, test, CLI, MCP, or documentation change, agents MUST:
1. Read `docs/spec/00.index.md`.
2. Find the relevant Requirement ID in the scope SRS files.
3. Mention the Requirement ID in the work summary.
4. If no matching requirement exists, stop and ask whether to create/update an SRS requirement first.

Requirement metadata has two separate lifecycle fields:
- `Status` tracks implementation and verification progress.
- `Stability` tracks requirement maturity and change-control maturity.

Agents MUST stop before implementing a non-discarded requirement with `Stability=draft` or `Stability=deprecated` unless the user explicitly overrides that workflow.

TDD principle:
- Agents MUST follow TDD for behavior changes: write or update a failing automated test for the relevant Requirement ID before implementation, make the smallest change to pass, then refactor while keeping tests green.
- If no meaningful automated test can be written, agents MUST stop before implementation and explain the exception and alternative verification evidence.

Work-mode and the TDD First (tdd) workflow:
1. Before starting work, read the persisted work-mode with the MCP `get_work_mode` tool, or CLI `speckiwi mode` when MCP is unavailable (stored in `docs/spec/steps/state.md`). When no mode is set the mode is wait and the sdd (SRS-first) rules in this document apply.
2. Switch modes with the MCP `set_work_mode` tool (mode plus an optional activeTask for vibe/tdd) or CLI `speckiwi mode <value>`. Any mode may switch to any other of sdd, vibe, wait, and tdd; switching to sdd or wait drops a stale Active Task line, and an out-of-enum value is rejected with INVALID_MODE.
3. When the mode is `tdd`, step-scoped work follows the TDD First cycle: author the step SDS at `docs/spec/steps/<task>/design.md` per the installed SDS-MD Authoring Rules (`docs/rule/SDS-MD-Rules-v2.5.0.md`) with EARS acceptance contracts (SDS-AC), translate the SDS-ACs into failing tests and confirm they fail, implement the smallest change to green, run regression, then synthesize the step SRS and promote the step requirement with verification evidence.
4. tdd gates (all mandatory): do not write tests before the step's SDS exists; commit tests first and never weaken a test to reach green; never promote a step requirement without verification evidence.
5. In tdd mode the rule "do not implement behavior not covered by an SRS requirement" is satisfied for step-scoped work by the agreed SDS plus the mandatory post-hoc promotion; body-scope work keeps the sdd rules in this document.
6. Edits to existing body requirements and large architecture changes stay in sdd mode — never route them through a tdd step.

Scope SRS document naming:
1. A scope SRS document is named `docs/spec/{NN}.{scope-slug}.srs.md`, where `{NN}` is a two-digit ordering number. The full rules are in `docs/rule/SRS-MD-Rules-v2.5.0.md` §5.2.
2. Allocate `{NN}` as one above the highest number already present among the project's scope documents. The first scope document of a project is `01`, the next `02`. Do not number by tens.
3. Never reuse a number another scope document holds, and never renumber an existing document.
4. Prefer `speckiwi scaffold-scope <Name>:<PREFIX> --apply`, which allocates the number and registers the document in both index sections in one operation, over writing the file and the index rows by hand.

Agents MUST NOT:
- Implement behavior that is not covered by an SRS requirement.
- Create an alternate requirements source outside `docs/spec/`.
- Change requirement IDs manually.
- Mark requirements as verified without evidence.
- Introduce or invoke bulk-archive / bulk-finalize tooling that flips multiple requirements to `verified` or empties Active Target without per-requirement evidence and stability gate checks.

When SpecKiwi MCP tools are available, agents MUST use them for requirement lookup and safe SRS updates. If MCP is unavailable, use the `speckiwi` CLI.

Per-call workspace root:
1. The MCP server resolves its root from its own process working directory, and SRS is read and written only there.
2. The `workflow_*` family accepts an optional absolute `workspaceRoot` on every tool, and the `orchestrate_*` family accepts it on every tool except `orchestrate_replay_apply` and `orchestrate_preflight`.
3. Every SRS-facing tool refuses `workspaceRoot` fail-closed. Refusal is the default, so a tool not named here refuses it.
4. An accepted `workspaceRoot` MUST be an absolute path to an existing git top level that is a worktree of the startup root's repository; a path argument landing under `docs/spec` is refused even on a tool that accepts the root.
5. Agents MUST confirm workspace identity from the `mcpWorkspace` envelope — `workspaceRoot` plus `rootSource` — before any target-scoped read or mutation. `rootSource` reads `per-call-workspace-root` exactly when a supplied `workspaceRoot` passed every gate, and `server-cwd-discovery` or `auto-init` otherwise.

Current work status workflow:
1. Read the active target with MCP `get_active_target`, or CLI `speckiwi active-target --json` if MCP is unavailable.
2. If `activeTarget` is empty, report that no active target is set and ask which target to use before making target-scoped changes.
3. Read `summary.countsByStatus`, `summary.countsByStability`, `summary.stabilityBlockers`, `summary.stabilityWarnings`, and `summary.newWorkCandidates` before selecting work.
4. Read open work with MCP `list_requirements` for `status=in_progress`, `status=blocked`, and `status=implemented`; CLI fallback is `speckiwi list --status <status> --json`.
5. Check missing verification evidence through `summary` or MCP `summarize_target` before saying work is complete.
6. Read recent completed work with MCP `list_completed_work`; CLI fallback is `speckiwi completed-work --json`.

Next target authoring workflow:
1. If the user asks to set the next target, first read the current Active Target and Target Map.
2. If the target is not registered, use a supported target-registration mutation such as MCP `set_active_target` with creation support, or CLI `speckiwi set-active-target <target> --create` when that option is available.
3. If the configured MCP/CLI cannot register the target, stop before target-scoped SRS changes and report the tool gap, unless the user explicitly authorizes a minimal SRS-MD patch.
4. After target assignment, confirm the resolved Active Target with MCP `get_active_target`, or CLI `speckiwi active-target --json` if MCP is unavailable.
5. When the user provides a target goal, record it with MCP `set_target_goal`, or CLI `speckiwi set-target-goal <target> --goal <text>` if MCP is unavailable.
6. For later SRS creation, omit the target only when the tool supports Active Target defaulting; otherwise pass the confirmed Active Target explicitly.
7. If the user provides an explicit different target for a requirement, the explicit target wins over Active Target.

Merge-time duplicate Requirement ID repair workflow:
1. Run `speckiwi validate --json` or MCP `validate_spec` first. Use repair only when `SRS-E002` duplicate Requirement ID diagnostics exist, or when a named duplicate ID is confirmed in parsed diagnostics.
2. Resolve normal Git conflict markers before repair. Then run MCP `diagnose_requirement_id_collisions` or CLI `speckiwi repair requirement-id-collisions diagnose --json`.
3. Select explicit keep and rename occurrences by `filePath`, `headingLine`, and `blockHash`. A duplicate ID alone is never enough to write.
4. Create a dry-run plan with MCP `plan_requirement_id_collision_repair` or CLI `speckiwi repair requirement-id-collisions plan --duplicate-id <id> --keep <file:line:blockHash> --rename <file:line:blockHash> [--replacement-id <id>|--allocate-next] --write-plan <path> --json`.
5. Apply only from the explicit plan or equivalent explicit mapping with MCP `apply_requirement_id_collision_repair` or CLI `speckiwi repair requirement-id-collisions apply --plan <path> --json`. `--ignore-lock` is allowed only on apply and bypasses only the SRS mutation lock.
6. Do not use collision repair for general renumbering, gap filling, ID beautification, bulk archive, bulk finalize, or Status/Stability changes. When two duplicate logical requirements should be merged or discarded, first repair IDs to uniqueness, then use separate guarded SRS mutations for discard, supersedes, Status, Stability, AC, or evidence changes.
7. When implemented runtime CLI or MCP repair tooling is available, do not hand-edit Requirement IDs. If tooling is unavailable and the user explicitly authorizes a degraded SRS-MD patch, limit it to the selected occurrence and explicitly mapped references.
8. Finish with `speckiwi validate --fail-on-warning --json`, `speckiwi summary --target <target> --json`, and `speckiwi links check --json` or MCP equivalents. Evidence must show duplicate IDs are zero and ambiguous references were reported or explicitly mapped.

The Completed Work Log — inline in `docs/spec/00.index.md` §7 and its split history file `docs/spec/91.completed-work-log.md` — is a read-only summary for agents. Requirement Block status, Acceptance Criteria, Verification Evidence, and Change Notes remain the source of truth for completion.

<!-- /SpecKiwi SRS workflow -->

## Session handoff

Before starting work in a fresh session, read `docs/next/LATEST.md`. It points at the current handoff document, which carries the work order, the confirmed decisions, and the traps this repository has already hit. Read that document before invoking `/kiwi-wave-master`, `/kiwi-pipeline`, or any other orchestrator — those skills auto-detect prior runs from `kiwi/waves.jsonl`, and the handoff records which of those runs must not be resumed.

## Development conventions

- Default dev-server port is **3399** (`packages/editor` and any later frontend package). Do not use another port without saying why.
- Two different apps compete for port 3399, so name the one you mean. `npm run dev` from the repository root starts the **web** app (`@doculight/web`). The **editor demo** is a separate app started with `npm run dev --workspace @doculight/editor`, and that demo — not the web app — is what every browser check below drives. Only one of them can hold 3399 at a time, so a browser check run against the web app measures the wrong screen. Measured 2026-08-25.
- A real-browser check already exists as a precedent: `packages/editor/test/browser-check.mjs`, run via `npm run test:browser` or `npm run test:browser:headed` from `packages/editor` once the dev server is up. It drives Playwright's chromium against `http://localhost:3399/` and currently checks Mermaid live preview only — reuse its shape for other browser-only checks rather than inventing a new one. `playwright` 1.62.1 and its chromium binary **are** installed, in `packages/editor/node_modules` (not the repository-root `node_modules`). Import it by absolute path from scripts that live outside that workspace. Measured 2026-08-25.
- The browser checks carry the live-preview acceptance criteria that only a real browser can measure — real gestures, computed style, widget geometry. They are **not** the only evidence: `npm test` also carries axes no browser check covers (the line-unit reveal rule, the table reveal state machine), so a live-preview change needs both. What is true is that **nothing runs the browser checks automatically**: `npm test` is vitest and its `include` does not match `.mjs`, and this repository has no CI at all (there is no `.github/` directory). Measured 2026-08-25. Run all six in one go with `npm run test:browser:all` from the repository root — it forwards to the same script name in `packages/editor`, which runs `browser-check.mjs` (Mermaid), `table-reveal-check.mjs` (table source reveal, `FR-EDITOR-007` AC-7), `heightmap-drift-check.mjs` (widget heightmap drift), `tag-chip-check.mjs` (body tags actually look like chips — computed style, not class names — plus the AC-10 reveal round trip) and `math-render-check.mjs` (`FR-EDITOR-010`: math actually stands on the KaTeX stylesheet — computed font, the folded MathML copy, and the superscript's real geometry), and `inline-preview-check.mjs` (원장 §4 **수용 기준 2**: 헤딩·강조·목록·링크·인용이 본문과 실제로 다르게 그려지고, 커진 헤딩 줄에서 클릭이 그 줄에 놓인다) in that order, stops at the first failure, and propagates its exit code (`1` = a check failed, `2` = could not measure — usually the dev server is not up, and each script prints how to start it). Whoever changes live preview (tables, code blocks, Mermaid, math), widget geometry, or the reveal rules runs it before committing, with the dev server already up. **연달아 돌릴 때 간헐 실패가 난다** — 2026-09-01 에 `math-render-check.mjs` 의 AC-3(지수 기하)이 전체 실행에서 한 번 죽었다가 단독으로도 전체로도 다시 돌리자 4/4 로 통과했다. 앞 검사가 남긴 스크롤 상태나 렌더 타이밍 탓으로 보인다. **회피**: 실패한 검사를 단독으로 한 번 더 돌려 재현되는지 먼저 본다.

- **`packages/web` 에도 브라우저 검사가 있다** (2026-08-29 신설). editor 의 검사와 전제가
  다르다 — web 은 서버가 있어야 트리도 본문도 저장도 성립하므로, **web 3399 와 API 3400 이
  함께 떠 있고 로그인할 계정이 있어야** 한다. 그 셋이 갖춰지지 않으면 「실패」가 아니라
  종료 코드 `2`(재지 못했다)로 나가고 무엇이 빠졌는지 안내한다.
  ```
  # 1) API 서버 — 데이터 디렉터리를 격리해 띄우면 기존 데이터를 건드리지 않는다
  DOCULIGHT_DATA_DIR=<임시경로> PORT=3400 npx tsx src/main.ts   # packages/server 에서
  # 2) 콘솔에 나온 설치 토큰으로 /api/install/verify-token → /api/install/commit
  # 3) web dev
  npm run dev                                                   # 저장소 루트, 3399
  # 4) 검사 — 만든 계정을 환경변수로 준다
  DOCULIGHT_E2E_USER=<이름> DOCULIGHT_E2E_PASS=<비밀번호>     npm run test:browser:all --workspace @doculight/web
  ```
  기계장치는 editor 의 `_browser-harness.mjs` 를 **그대로 재사용**하고, web 에만 있는
  절차(로그인·시험 문서 준비·트리에서 열기)만 `packages/web/test/_web-harness.mjs` 에
  있다. 검사는 자기 문서를 만들고 끝나면 지우므로 **개인 볼트에 기대지 않는다**.
  저장소 루트의 `npm run test:browser:all` 은 이제 editor 와 web 을 차례로 부른다.
  web 쪽은 아홉이다. `focus-retention-check.mjs`(`FR-EDITOR-009`: 저장이 포커스·커서·
  이어 쓰기를 끊지 않는다)와 `ime-composition-check.mjs`(원장 §4 **수용 기준 7**:
  한글 IME 조합이 편집 중 깨지지 않는다) — 뒤의 것은 CDP `Input.imeSetComposition` 으로
  조합 단계를 그대로 내므로 OS 입력기 없이도 그 축이 재어진다. 셋째는
  `search-layout-check.mjs`(`FR-SHELL-013` AC-5·AC-12: 필터 버튼의 배치와 결과
  목록의 실제 스크롤)이며 계산된 기하를 잰다. 넷째는 `merge-view-check.mjs`(원장 §4
  **수용 기준 6·12** · `FR-EDITOR-008` AC-2~AC-4 · `IR-STORAGE-001` AC-1·AC-3)이며
  **브라우저 컨텍스트를 둘 띄우는 유일한 검사**다 — 같은 문서를 두 세션이 차례로
  저장해 충돌을 실제로 만들고, 그 병합 화면과 버전 비교 화면에서 `@codemirror/merge`
  가 세운 `.cm-mergeView` 의 기하와 `.cm-changedLine` 을 잰다. 둘째 세션은 로그인을
  한 번 더 하지 않고 `storageState` 를 복사해 연다(위의 15분 10회 제한 때문이다).
  다섯째는 `editor-styles-check.mjs`(`IR-EDITOR-001`: 편집기 스타일이 **제품 화면**에
  실제로 닿는가)이며, 같은 축의 조립 시험 `editor-styles-assembly.test.ts` 가 vitest
  쪽에 함께 선다 — 브라우저 검사는 서버가 있어야 돌지만 그쪽은 늘 돈다.
  여섯째는 `acl-two-account-check.mjs`(원장 §4 **수용 기준 4**: 권한이 다른 두 계정의
  화면이 실제로 다르게 그려지는가)이며, **둘째 계정을 스스로 만들어 실제로 로그인하는
  유일한 검사**다 — 재려는 것이 바로 다른 자격의 화면이라 `storageState` 복사가 성립하지
  않는다. 부여 전·부여 후·회수 후 세 시점의 트리를 화면의 `role="treeitem"` 으로 세며,
  API 응답을 보지 않는다(그러면 서버 판정을 한 번 더 재는 것일 뿐이고 화면까지의 배선이
  끊겨도 통과한다).
  일곱째는 `trash-round-trip-check.mjs`(원장 §4 **수용 기준 11**: 화면에서 지우고 휴지통에서
  되살리는 왕복)이며, **되돌아온 문서를 실제로 다시 읽어 본다** — 트리에 이름이 서는 것과
  문서가 열리는 것은 다르고, 그 차이가 `REL-STORAGE-003` 의 결함을 잡았다. 원위치를 재려면
  루트가 아니어야 하므로 디렉토리를 만들고 그 안에 둔다.
  여덟째는 `input-gestures-check.mjs`(원장 §4 **수용 기준 8**의 드래그·붙여넣기와
  **수용 기준 3**의 `[[` 자동완성)이며, **진짜 입력 제스처가 핸들러까지 닿는가**를 잰다 —
  jsdom 시험은 `DataTransfer` 도 `ClipboardEvent` 도 값으로 지어 넣는다. Playwright 의
  `dispatchEvent` 로는 붙여넣기를 낼 수 없고 `page.evaluate` 안에서 `ClipboardEvent` 를
  직접 만들어야 하는데, **그 방식이 실제로 닿는다는 것을 이 검사가 확정했다**(2026-09-01).
  세 축을 한 검사에 묶은 이유는 로그인 제한이다.
  아홉째는 `auth-round-trip-check.mjs`(원장 §4 **수용 기준 14**: 로그인 · 상태 차단 ·
  로그아웃 · 비밀번호 변경)이며, **`_web-harness.mjs` 의 `login` 지름길을 쓰지 않는
  유일한 검사**다 — 그 함수는 API 로 세션을 세우는데 여기서는 로그인 화면 자체가
  대상이라, API 로 붙으면 그 화면이 자리표여도 통과한다(2026-09-01 이전이 그랬다).
  비밀번호를 바꾸는 대상은 이 검사가 만든 계정이다: 환경변수로 받은 계정의 비밀번호를
  바꾸면 그 값이 검사를 돌린 사람의 손을 떠난다.
  **로그인은 15분 창에 10회로 제한되고 web 검사 아홉이 한 번에 14회를 쓴다**(다섯째가
  둘, 아홉째가 다섯) — **한 창에 전부를 돌리지 못한다.** 창이 열릴 때까지 기다리거나
  API 서버를 재기동한다(limiter 는 메모리에 있고 계정은 DB 에 남으므로 재기동이 즉시
  푼다). 짧은 사이에 다시 돌리면 429 가 나고, 그때 검사는 「계정이 틀렸다」가 아니라
  그 사실을 안내한다.
  **Git Bash 의 `curl` 로 한글을 보내면 깨진다.** 설치 계정 이름을 한글로 주면 DB 에
  `U+FFFD` 로 저장되고, 그러면 브라우저에서만 로그인이 401 로 실패한다(curl 은 같은
  방식으로 깨뜨려 보내므로 200 이 나와 원인이 가려진다). **설치 계정은 ASCII 로 만든다**
  (2026-09-01 실측).
  **두 패키지의 검사를 한 자리에서 돌리려면 포트를 나눠야 한다** — 둘 다 기본으로
  3399 를 보므로, editor 데모를 다른 포트에 띄우고 `EDITOR_URL` 로 넘긴다:
  `npx vite --port 3401 --strictPort` 뒤 `EDITOR_URL=http://localhost:3401/ npm run test:browser:all`.


## Gate decisions (2026-08-25, standing user instruction)

When an orchestrator — `/kiwi-wave-master`, `/kiwi-pipeline`, or any skill they spawn — reaches a gate that would normally ask the user for confirmation, approve it and continue instead of asking. This includes `out-of-scope-user-consent`, exclusion tables, wave decompositions, integration-test consent, and cost warnings.

- On a gate that offers choices, pick the option the agent recommended. When no recommendation exists, pick the most conservative option — the one that is easiest to reverse.
- Record every auto-approved gate where that skill keeps its decisions (`waves.jsonl` `decision` objects, or the skill's own journal), naming the gate id and the reason, and summarize it to the user afterwards. Auto-approval removes the question, not the record.
- Three situations still stop and ask, because approving them would lower the goal rather than reach it:
  1. An irreversible action that reaches outside the run root — editing the 1.0 repository, stopping an external service, force-pushing.
  2. Passing a gate only by weakening or deleting an existing test, or by breaking an existing public contract.
  3. A fact that is not in the repository — user data such as a real vault path. There is nothing to auto-approve when the answer cannot be derived.

