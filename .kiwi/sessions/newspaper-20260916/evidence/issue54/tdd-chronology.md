# Issue 54 TDD chronology

## Independent-review redo

The first implementation chronology below was rejected because browser assertions had been added after product mutations. For the binding redo, all #54 product changes were removed while preserving unrelated #53 and #55/#56 files. The final assembly and Playwright tests were then run against the clean product baseline. `review-red-final.txt` records the intended failures. Only after that RED was observed were the integration CSS, document hooks, resolved CodeMirror theme compartment, stable-host state marker, system-media listener, and composition deferral reapplied. `review-final-verification.txt` records GREEN.

| Contract | RED | Minimal implementation | GREEN |
| --- | --- | --- | --- |
| One post-vendor semantic integration sheet; semantic role mappings; resolved theme flag | `red-editor-contract.txt` reaches three intended assertions | `newspaper-integration.css`, stylesheet import, parameterized `atomicEditorTheme` | `green-editor-contract.txt` |
| Bounded product surface, explicit mode hooks, source scroller, 720px text measure and 40/24px padding | `red-web-contract.txt` reaches the missing hook/geometry assertions | `DocumentSurface.tsx` data hooks and the bounded flex/container rules | `green-web-targeted.txt` |
| Computed 16/28 body, heading/quote/source typography, measure, padding, task glyph and theme identity across the required matrix | The final checker was written, the integration import was removed, and `red-playwright.txt` failed at the actual 17px versus required 16px assertion. The import was then restored. | The same integration stylesheet supplies geometry and semantic styles; the editor uses a theme compartment and defers reconfiguration during composition. | `green-playwright.txt`, `green-measurements.json`, screenshots |
| Merge selection uses the selected semantic surface | `red-merge-selection.txt` reaches the missing selector assertion | Two scoped merge selection rules | `green-editor-contract.txt` |

No #55-owned complex-content behavior was implemented. The old source-string geometry tests were removed after the redo; geometry, colors, identity, state, and checkbox rendering now live in Playwright. The remaining Vitest only guards the meaningful CSS/theme assembly boundary.
