# GitHub #61 strict rebuild RED

Requirement: IR-SHELL-008 AC-1/AC-2.

On 2026-09-17, following the AGENTS test-after recovery rule, the expanded
checker was completed first. The complete settings-specific geometry block in
`packages/web/src/styles/shell.css` was then removed while preserving its exact
text for restoration. The checker was run against that implementation-free
state with:

```text
npm run test:browser:settings --workspace @doculight/web
```

Exit code: **1**. The checker completed every environment and reported
`settings matrix failed (15)`:

- 100%: light and dark at 1280x720, 1440x900, and 1920x1080 (6 failures)
- breakpoint: CSS viewport widths 899, 900, and 901 (3 failures)
- actual 200%: light and dark at physical 1280x720, 1440x900, and 1920x1080
  after the disposable extension called `chrome.tabs.setZoom(tabId, 2)` and
  `chrome.tabs.getZoom(tabId)` returned 2 (6 failures)

All six 100% environments and all three breakpoint environments completed the
inspection and reported nine independent failures. Representative output:

```text
inspection failures (9): dialog width 560; dialog height 510.53125;
navigation overflow visible; content overflow visible; nav width 510;
content right padding 0; focus contrast ...;
navigation did not retain independent scroll: 0;
content did not scroll independently: 0
```

All six actual 200% environments reached the representative real child and
failed its final-action visibility contract:

```text
AssertionError [ERR_ASSERTION]: real final action is fully visible
false !== true
```

Thus the recovery RED directly covers width/height, the 899/900/901 breakpoint
contract, both required scrollports and their isolation, focus contrast, and
the real InstanceSettings final action at actual extension-driven 200%. This is
the repository-mandated recovery sequence for an implementation that had been
written before complete failing browser evidence; it supplies a genuine rebuilt
RED, but does not rewrite historical chronology. The minimum implementation was
then restored from the already-running checker contract before GREEN.
