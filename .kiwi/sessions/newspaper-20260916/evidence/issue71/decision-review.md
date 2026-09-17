# Issue #71 Astra decision independent review

Verdict: **PASS — Critical 0 / High 0 / Medium 0 / Low 0**

## Scope and requirement fit

The decision stays within the issue's `InstanceSettings` policy-form scope and preserves the #61 settings-shell dependency. It maps the work to `IR-SHELL-002` AC-7 and `DR-SHELL-001`, then follows the stable downstream contracts that give the five values meaning: `FR-AUTH-004`, `FR-ATTACH-006`, `FR-STORAGE-004`, `FR-STORAGE-007`, and `REL-AUDIT-003`. It does not add a sixth setting, a client-side defaults authority, an immediate cleanup operation, or a new server promise.

The current product supports the proposed narrow implementation boundary. `InstanceSettings` already calls the real `loadSettings`/`saveSettings` Promise adapters; `/settings` is guarded by the server's authenticated-superuser check; GET returns all registry keys and PUT accepts a string-valued known-key patch. The decision correctly distinguishes this support from capabilities the product does not have: there is no settings revision/CAS token, retention-impact preview, structured validation response, or current-default-ACL value in this query.

## Five keys, values, units, and numeric semantics

The five rows exactly match the server registry and shell contract:

| Key | UI unit/choice | Current registry default | Verified consumer domain |
| --- | --- | ---: | --- |
| `signup-mode` | `open` / `approval` / `invite-only` | `approval` | Existing three-value auth contract |
| `upload-size-limit-bytes` | bytes | `104857600` | finite and greater than zero |
| `retained-version-count` | count | `20` | finite and greater than zero |
| `trash-retention-days` | days | `30` | finite and at least zero; zero is unlimited |
| `audit-retention-days` | days | `365` | finite and at least zero; zero is unlimited |

The decision labels defaults and byte units as observed server-registry behavior rather than inventing missing SRS policy. That distinction matters because `FR-ATTACH-006` does not itself settle the default, unit, or zero meaning. It also avoids imposing integer-only, maximum, rounding, MB-conversion, or canonicalization rules that neither the consumers nor SRS currently share. Rejecting blank text, nonnumeric/nonfinite input, and invalid signs before PUT prevents `Number('')` from becoming an accidental unlimited value while preserving the current finite-number domain.

The cross-field rule matches `REL-AUDIT-003` AC-5 and the actual `covers` function: audit zero covers every trash value; trash zero requires audit zero; otherwise audit days must be at least trash days. Validation covers the full proposed pair, including an unchanged companion, so coordinated valid edits remain possible and an isolated edit cannot bypass the invariant.

## Load, draft, save, and uncertain outcomes

The proposed state model fixes the current component's material honesty gaps without claiming unsupported server guarantees. Initial GET failure cannot become an editable blank/default form. Baseline and draft stay separate; reset returns to the last confirmed baseline; only changed known keys are sent in one PUT; pending submission is snapshot-locked; and failed or uncertain PUT retains the user's draft instead of replacing the form with a load-error state.

The accepted-write/readback split is accurate for the actual void/204 adapter. A successful PUT followed by failed GET is reported as an accepted save with refresh failure, and retrying performs GET only. A transport failure is explicitly uncertain and triggers read-before-deliberate-resave rather than a false claim that storage was unchanged. Generation checks protect later edits, owner changes, and unmounts from obsolete responses. The preflight GET reduces stale-baseline mistakes while the decision plainly records the remaining same-key race because the API has no conditional write.

## Retention cuts and departure guard

`FR-CONFIRM-007` requires a fresh affected count: zero maps to L2, a positive count maps to L3, and the positive count is the exact token. No current HTTP/client contract can produce that count. The decision therefore blocks every snapshot containing a semantic reduction, including unlimited-zero to finite, and preserves the entire draft. It does not guess zero, choose a conservative grade without evidence, derive counts from currently visible rows, partially save unrelated keys from the same attempted snapshot, or combine trash-node and audit-row counts into a fabricated token. The delayed-cleanup copy is correctly tied to `FR-CONFIRM-008`. Expansion and finite-to-zero changes remain eligible for the ordinary explicit-save path.

The dirty category/modal-exit behavior is also honestly conditional. `InstanceSettings` cannot stop its own parent from unmounting, and the current #61 shell has no callable child-to-parent leave guard. The proposed handoff exposes only dirty count and continuation ownership, keeps form values in the child, and must exist before category change, close, Escape, or outside-click safety can be claimed. This is a concrete prerequisite rather than hidden completion. It preserves cancellation focus and draft state and does not add save-and-leave or browser persistence that could bypass validation or retain privileged values across users.

## Layout, accessibility, and browser evidence contract

The max-640 content column, persistent labels, programmatically associated units/help/errors, 36px controls, wrapping action row, and reserved space beneath the in-scrollport sticky action bar are feasible inside the approved #61 right scrollport. The plan covers loading, ready, invalid, pending, blocked, save-error, accepted-with-refresh-error, and leave-confirmation states. It also requires visible focus and non-color warning/error cues under dark and forced-colors modes, preserves native keyboard behavior, and prevents composition Enter from submitting.

The Playwright contract covers 1280×720, 1440×900, and 1920×1080 in light/dark at 100% and genuine 200%, for 12 environments, with forced-colors at both zoom levels. Genuine zoom is defined through an isolated persistent Chromium profile and an extension calling `chrome.tabs.setZoom(tabId, 2)`, followed by `getZoom === 2` and CSS viewport/DPR recording. It excludes CSS zoom, transforms, device emulation, DPR substitution, and a manually halved viewport. The required measurements include the real product shell, scroll reachability, sticky-row non-overlap, long Korean wrapping, focus, keyboard, IME composition, resize while dirty, permissions, and actual GET/PUT/readback behavior rather than a disconnected visual fixture.

## Sources inspected

- Original GitHub issue #71 via `gh issue view 71 --json number,title,body,url`
- `AGENTS.md` and `docs/spec/00.index.md`
- `docs/spec/08.app-shell.srs.md`: `IR-SHELL-002`, `DR-SHELL-001`
- `docs/spec/09.auth.srs.md`: `FR-AUTH-004`
- `docs/spec/11.confirmation-grades.srs.md`: `FR-CONFIRM-007`, `FR-CONFIRM-008`
- `docs/spec/12.audit-log.srs.md`: `REL-AUDIT-003`
- `docs/spec/14.storage.srs.md`: `FR-STORAGE-004`, `FR-STORAGE-007`
- `docs/spec/15.attachments.srs.md`: `FR-ATTACH-006`
- `docs/spec/04.screen-design-settings.md` and approved #61 decision review
- Current `InstanceSettings.tsx`, settings shell/client adapters, `/settings` routes, settings registry/write logic, retention comparison, upload/version/trash/audit/signup consumers, and related tests
- `.kiwi/sessions/newspaper-20260916/evidence/issue71/astra-decision.md`

This is a pre-implementation decision review. No product change, browser execution, or implementation-test result is claimed. The two unsupported integrations are explicitly blocked and remain required evidence before their corresponding behavior may be reported complete.
