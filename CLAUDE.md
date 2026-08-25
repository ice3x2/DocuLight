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
- The browser checks carry the live-preview acceptance criteria that only a real browser can measure — real gestures, computed style, widget geometry. They are **not** the only evidence: `npm test` also carries axes no browser check covers (the line-unit reveal rule, the table reveal state machine), so a live-preview change needs both. What is true is that **nothing runs the browser checks automatically**: `npm test` is vitest and its `include` does not match `.mjs`, and this repository has no CI at all (there is no `.github/` directory). Measured 2026-08-25. Run all four in one go with `npm run test:browser:all` from the repository root — it forwards to the same script name in `packages/editor`, which runs `browser-check.mjs` (Mermaid), `table-reveal-check.mjs` (table source reveal, `FR-EDITOR-007` AC-7), `heightmap-drift-check.mjs` (widget heightmap drift) and `tag-chip-check.mjs` (body tags actually look like chips — computed style, not class names — plus the AC-10 reveal round trip) in that order, stops at the first failure, and propagates its exit code (`1` = a check failed, `2` = could not measure — usually the dev server is not up, and each script prints how to start it). Whoever changes live preview (tables, code blocks, Mermaid, math), widget geometry, or the reveal rules runs it before committing, with the dev server already up.


## Gate decisions (2026-08-25, standing user instruction)

When an orchestrator — `/kiwi-wave-master`, `/kiwi-pipeline`, or any skill they spawn — reaches a gate that would normally ask the user for confirmation, approve it and continue instead of asking. This includes `out-of-scope-user-consent`, exclusion tables, wave decompositions, integration-test consent, and cost warnings.

- On a gate that offers choices, pick the option the agent recommended. When no recommendation exists, pick the most conservative option — the one that is easiest to reverse.
- Record every auto-approved gate where that skill keeps its decisions (`waves.jsonl` `decision` objects, or the skill's own journal), naming the gate id and the reason, and summarize it to the user afterwards. Auto-approval removes the question, not the record.
- Three situations still stop and ask, because approving them would lower the goal rather than reach it:
  1. An irreversible action that reaches outside the run root — editing the 1.0 repository, stopping an external service, force-pushing.
  2. Passing a gate only by weakening or deleting an existing test, or by breaking an existing public contract.
  3. A fact that is not in the repository — user data such as a real vault path. There is nothing to auto-approve when the answer cannot be derived.

