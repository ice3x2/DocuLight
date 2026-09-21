# Issue 82 TDD chronology

- Primary requirement: `IR-PRINCIPAL-004`.
- The two primary tests were hashed before any production edit in `red-test-hashes.json`.
- `red-server-behavior-raw.txt` records the authoritative preview endpoint missing (2 failed / 2 total).
- `red-web-behavior-raw.txt` records the old disabled one-click surface lacking the L3 path (3 failed / 3 total).
- The earlier `red-server-raw.txt` and `red-web-raw.txt` are retained as infrastructure evidence: the isolated worktree initially had no installed dependencies, so those commands failed before collection and are not claimed as behavioral RED.
- The first server RED hash was `A0FAE51F33E0D6C9BD970F494BEFB3B0032B792094B5B4E818B54A9F7A542EB1`. Independent review required a direct persisted-row oracle and unplaceable row, producing the final server hash `87B9E8BF4549495DC72D7B7B491E59FA4F837F8816058742B7641ABD6908697C`; `green-server-final-raw.txt` records 2/2 GREEN with that strengthened oracle.
- The first web RED hash was `71F1BB79BCA802399845F83E846320F44B34288718846858FABC9C1F957212DD`. Its all-Korean `.toUpperCase()` fixture was corrected to mixed Latin/Korean, and duplicate-owner, refresh-separation, stable focus, and no-focus-theft cases were added. `final-test-hashes-before-redo.json` binds the completed seven-test file to `ACF9BA79FF8998E048011A474C111157118AF473B6BDDC4F62258F424B04CD93`. The product entry point was then disconnected, `red-web-final-suite-raw.txt` recorded 7/7 RED, and only then was the implementation reconnected and corrected; `green-web-final-raw.txt` records 7/7 GREEN without changing that test hash.
- Independent re-review rejected that entry-point-only replay. Every #82 production edit was therefore removed from all nine tracked server/web/package files, leaving only the final hashed tests and evidence. `red-server-full-reset-raw.txt` records 2/2 RED and `red-web-full-reset-raw.txt` records 7/7 RED against that true preimplementation baseline. The exact production patch was applied again only after both RED runs completed.
- Focused preservation GREEN: server 129/129 including system-group and workspace routes; web 29/29 for the #68/#81 regression set. Final Issue 82 GREEN: server 2/2 and web 7/7.
- Full GREEN after review fixes: server 1614/1614; web 1374/1374; workspace typecheck and build passed.
- Actual-App product evidence is in `browser/`; `capture-manifest.json` was written only after the staging bundle passed secret scanning, then the directory was atomically renamed into place.
