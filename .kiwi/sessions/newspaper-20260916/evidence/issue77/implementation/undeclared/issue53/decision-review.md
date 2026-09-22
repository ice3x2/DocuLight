# GitHub #53 Astra decision independent rereview

## Verdict

**PASS — Critical 0, High 0, Medium 0, Low 0.**

The prior Medium finding is resolved. The updated decision now requires resolved backlink and outgoing activation to use the existing recursive `nodeById(workspaces, nodeId)` lookup, preserve `onOpen(found, false)`, and avoid name-based resolution or new metadata. It explicitly covers nested documents and duplicate names at different locations.

The required test-first evidence now includes actual AppShell integration for both link directions, pointer click, Enter and Space, the exact nested document and `false` argument, unresolved-row nonactivation, and Playwright confirmation that the real callback path changes the active document to the intended identity. This closes the gap that previously allowed a root-only lookup to pass the visual, state, security, and 200% matrix while nested resolved links remained inert.

The added navigation contract is a minimal repair of existing resolved-link behavior. It does not introduce a new endpoint, name-resolution policy, permission rule, or interactive behavior for unresolved targets. It remains consistent with FR-SHELL-004, SEC-WORKSPACE-004/005, the issue's behavior-preservation boundary, and the current recursive helper already used by search and favorites.

The rest of the decision remains consistent with the original issue and reviewed requirements: server order and tag name ordering stay authoritative; outgoing occurrences are retained; missing and forbidden targets remain indistinguishable; backlink and tag ACL filtering stays server-side; query loading/empty/error states are not conflated; Radix and native keyboard semantics are retained; and genuine 200% evidence still requires isolated persistent Chromium with `chrome.tabs.setZoom(2)` across the stated light/dark viewport matrix. No invented Phase 2 behavior or new server policy was added.
