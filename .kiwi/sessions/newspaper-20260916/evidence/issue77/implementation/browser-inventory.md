# Issue 77 browser and page inventory

Evidence classes follow the Astra addendum: Product, Production-component fixture, Unit/service/contract, and Design/reference.

| Owner | Surface | Current disposition |
| --- | --- | --- |
| #42-46 | trace, build/tokens, light/dark/system runtime | Existing reviewed evidence retained; fresh build/typecheck and current editor/product theme transitions executed. |
| #47-49 | controls, fields, overlays, data display/states | Fresh run-owned shared-UI component matrices and forced-colors evidence retained under `implementation/components`. |
| #50-53 | shell, tree/favorites, search, links/tags | Fresh shell/tree/search/right-panel evidence includes bounded virtualization, exact zoom/resize identity, keyboard focus, and forced-colors coverage. |
| #54-57 | editor layout, complex content, versions, conflict | Fresh editor 12-environment, reduced-motion, actual-product composition/read-write/version/conflict evidence retained under `implementation/undeclared` and `product-suite-final`. |
| #58-60 | files, pre-auth, install | Fresh run-owned file and actual-product pre-auth/install evidence retained. Native password-manager/autofill UI is untested by decision. |
| #61-63 | fourteen settings categories, personal/account, PAT | Current role authority is 4/5/8/14 plus superuser 11/12. This run does not reuse obsolete 10/11 expectations. Existing product evidence is referenced; interrupted issue61 staging is excluded. |
| #64-66 | trash, sharing, move/copy | Fresh component and actual-product owner matrices retained, including the relocation contrast RED/GREEN. |
| #67-70 | users, groups, ACL audit, audit log | Fresh component and product role/security evidence retained; endpoint authorization is backed by product responses. |
| #71-73 | instance policy, workspace management/create | Fresh product form, picker, L2/L3, role, focus and mutation matrices retained. |
| #74-76 | offboarding, indexing queue, resilient app states | Fresh product evidence retained, including the offboarding focus RED/GREEN; native OS input and native high contrast remain untested limitations. |
| #77 | integrated final audit | Fresh tree/editor/reduced-motion/product-composition fixes and evidence complete; independent review and final owner-by-owner aggregation still required before issue/SRS closure. |

## Declared browser entry accounting

- Root `test:browser:all` remains unsuitable as the sole #77 proof because it assumes a prestarted editor demo and omits newspaper/product entries.
- The generated inventory accounts for all 77 declared root/editor/web browser commands: 47 fresh PASS, 30 source-backed N/A aliases/supersessions, and 0 FAIL/NOT-RUN. Required follow-up #78 was run fresh rather than scope-excluded.
- Full unit suites cover every current editor/server/web unit entry.
- `coverage/declared-browser-inventory.json` links every PASS and each of the 30 N/A equivalence dispositions to current run-owned artifacts and SHA-256 values. `coverage/leaf-matrix.jsonl` contains 427 current-SRS Requirement/AC rows and explicitly blocks all unaccepted runtime claims; the strict validator rejects unknown ACs, generic labels, circular manifests, stale hashes, incomplete N/A equivalence, and PASS without independent acceptance.
