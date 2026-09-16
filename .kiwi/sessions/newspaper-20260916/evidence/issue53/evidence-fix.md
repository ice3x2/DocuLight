# Issue 53 evidence claim correction

Date: 2026-09-17

Requirements: `IR-SHELL-006`, `IR-SHELL-009`

This correction changes evidence descriptions only. Product and test code were not changed, and existing test logs were not regenerated.

## Corrected claims

- `IR-SHELL-009` VE-8 no longer says the Issue 53 checker closes all of AC-3. AC-3 remains unchecked.
- VE-8 now identifies the Playwright subject as the `AppShell`/`LinkPanel`/`TagPanel` fixture and lists its asserted right-panel behaviors. Actual `App` query-error/refetch wiring remains separately covered by `right-panel-wiring.test.tsx`.
- `IR-SHELL-006` VE-7 now records only the computed properties the checker asserts: backlink-list overflow, minimum target heights, semantic colors, focus containment, the two-column computed grid, interactions, and the 12-environment matrix. Its backlink state checks are identified as a separate 1280×720 scenario.
- VE-7, the evidence README, and the TDD chronology no longer claim automated proof of line wrapping, count right alignment/non-overlap, exact 2px outline width plus 2px offset, or successful tag-list scrolling. Long names and large counts are fixture/screenshot inputs only for those unasserted properties.

## Remaining evidence boundary

The Playwright fixture does not establish actual `App` query wiring, exact workspace ACL/filter preservation, or complete AC-3 coverage across every named surface. RTL covers query-error/refetch wiring and tag query/state behavior, but the available Issue 53 evidence does not justify marking `IR-SHELL-009` AC-3 complete.
