# Foundation review correction RED report

Requirement: `IR-SHELL-006`, especially AC-5 and AC-7. Original decision contract: `docs/decision/newspaper-forms.md` Invalid rule.

## Corrections

- Normal and invalid borders are now separate observations. `#normal-name` checks the approved normal boundary `#7A7B71`; invalid `#name` checks danger `#963F38`.
- Invalid communication now checks `aria-invalid="true"`, `aria-describedby` membership for the error element, non-empty corrective text, and a visible non-color `!` icon.
- The IME assertion expects the invalid danger boundary to remain present while composition suppresses submission; it no longer asks invalid state to look normal.
- The shadcn check compares the distribution bytes to the complete official `shadcn@4.21.0` MIT license and its frozen SHA-256. The official copyright, permission grant, conditions, warranty disclaimer, and liability disclaimer are all part of the exact-byte comparison.

## RED result

- Component: exit 1 at the pre-existing missing public component barrel; no component assertions were weakened.
- Browser: exit 1, 23 failed assertions across four viewport cases. Non-color invalid communication passes; normal and invalid boundaries both remain native `rgb(118, 118, 118)`, so the distinct approved boundaries are RED.
- Build: exit 0.
- Dist: exit 1, 17 failed assertions. The frozen official license fixture passes at 1063 bytes and the approved hash; the missing distribution license reports 0 bytes and the empty-file hash, so the obligation remains RED.

No product implementation, dependency install, SRS/issue/root-state mutation, commit, or push was performed. Earlier RED logs were preserved unchanged.
