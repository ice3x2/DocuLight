# Issue 58 — binding image, download and new-version decisions

Decision: Astra, 2026-09-17, under delegated design ownership. Supporting implementation direction; `docs/spec/` remains authoritative. No product implementation, tests or requirement verification is claimed.

## Authority, inherited contracts and scope gates

Read AGENTS/SRS index, GitHub #58, newspaper guide/forms/handoff, approved #46 theme, #48 shared-overlay and #50 shell reviews, DocumentSurface/surface-contract, NewVersionPrompt, tree/upload contracts and read-only inspection of AppShell/App upload callbacks. SpecKiwi confirmed `C:\Work\git\DocuLight2.0`, `server-cwd-discovery`, mode `sdd`, target `phase-1`, no stability blockers.

FR-ATTACH-003, FR-SHELL-008, FR-EDITOR-006, FR-CONFIRM-010 and FR-CONFIRM-005 are verified/stable. IR-SHELL-009 AC-6 and IR-SHELL-006 AC-5/7..9 supply presentation/state rules; IR-SHELL-008 and #48 supply overlay rules. Existing permissions, stable file ID, md-version preservation and binary irreversible behavior remain authoritative.

The original presentation scope is DocumentSurface and NewVersionPrompt with scoped styles/tests. IR-SHELL-010 additionally authorizes the narrow upload-result connection through App.tsx, AppShell.tsx and NewVersionPrompt.tsx, including the required result types and tests. Preserve #50 shell geometry, #46 root theme/approved palette and #48 overlay ownership/focus behavior. Do not add PDF viewers, image zoom/pan tools, thumbnails, format support, server/API changes, upload policy, new file-name rules, server-side transformation, tree feature redesign, image-cache policy or generic overwrite behavior.

**Authorized wiring correction:** NewVersionPrompt has `onPick(file):void`; AppShell invokes it then immediately unmounts the prompt, and App catches failures without returning an outcome. IR-SHELL-010 now authorizes changing that exact App→AppShell→NewVersionPrompt boundary so the mounted prompt receives real upload and refresh outcomes. Do not reinterpret callback return/unmount as success, add a fabricated progress percentage, keep an indefinite spinner or bypass the parent by calling the API directly.

**Observed confirmation defect:** binary file selection currently calls `onPick` immediately inside an alert-shaped wrapper. File selection is input, not confirmation. #58 must implement the existing L2 contract with a distinct affirmative step after a file is selected (FR-CONFIRM-010, FR-CONFIRM-005), using local prompt state; this requires no new API or policy. Markdown remains L1/no confirmation. Classification uses the existing server-supplied `overwriteIrreversible` value; do not duplicate storage classification from selected file name/MIME. Missing/inconsistent classification metadata, if observed, is a separately traced producer-contract concern, not permission to invent a client classifier.

## Image preview

Keep `surfaceOf`'s existing image classification and `<img>` rendering. Do not convert SVG to inline DOM, canvas or a new viewer. Use the existing authenticated node URL; no public asset URL, unguarded fetch or alternate path is introduced. Non-md surfaces have no read/live/source toggle.

The preview occupies the available document-body region with document surface and 16px padding. Use a bounded flex/grid chain with `min-width:0`, `min-height:0` and border-box sizing. Center the image within the remaining region. Preserve intrinsic aspect ratio with `object-fit:contain`, `max-width:100%`, `max-height:100%`, auto width/height; do not upscale an image beyond intrinsic size, stretch, crop or use `cover`. Tall and wide images fit the available width/height without making the editor/app wider or hiding an edge. Metadata/status remains outside the measured image-fit area, and surrounding content can scroll if extremely short zoomed height leaves insufficient room. A native browser zoom enlarges the UI but still fits the complete image in its bounded preview area.

Keep original image bytes/colors/transparency and animation behavior; no dark-mode inversion/filter, recompression, theme tint, decorative checkerboard texture, shadow or forced image border. Document surface behind transparency follows the theme. `alt` is the full existing file name, not a guessed description or internal node/path. An image with no distinct action is not a fake button or extra Tab stop. Do not add a download toolbar to the image surface.

Use actual image events for honest local state:

- While the current image request is pending, show shared LoadingState `이미지를 불러오는 중입니다.` and mark the preview region busy.
- Successful load displays the complete image and clears busy; handle cached-complete images without leaving perpetual loading.
- Error displays `이미지를 표시할 수 없습니다.` with an actual same-resource reload action `다시 시도` if implemented through this image element. It must attempt a new load, not merely clear the error. Do not add timestamp query parameters, new endpoints or an automatic retry loop.
- Reset local state and ignore stale events on node/resource identity change. Missing and forbidden image resources receive the same safe generic error, not guessed permission/existence reasons. A same-node image cache-refresh gap after upload belongs to the external upload/read integration, not an invented URL policy here.

## Generic/PDF download-only surface

Keep the existing anchor to the stable node URL with `download={file.name}`. PDF and every existing non-image/non-md classification use this same simple surface: **no iframe, object, embed, canvas, text extraction, PDF dependency or browser-content preview.** The content area contains a full wrapping filename download link, optionally one short instruction `파일을 내려받아 확인하세요.`; do not manufacture file size/type metadata absent from the contract.

Use document surface, 24px inset, 14/22px sans text, action-primary underline and visible shared focus ring. Link target has at least 36px block-axis hit area and wraps very long Korean/Latin filenames without pushing the shell. Its visible name remains `{file.name} 내려받기`; do not use an icon-only action. Selection/copying of the displayed filename is allowed.

Preserve authenticated URL, requested filename and server-delivered bytes. No client renaming, extension replacement, body decoding, Blob transformation or conversion is introduced. A browser download link does not expose transfer completion to this component: uploading/loading/success/error/progress states for that transfer are N/A with the current native-anchor contract. Do not show “다운로드 완료” on click or intercept it with a new fetch path just to add status. Validate actual download event, suggested filename and byte content in the browser; any server route/header mismatch is a separate integration finding.

## New-version picker and irreversible confirmation

Entry remains the existing authorized **file-node context-menu** action. No overwrite option is added to directory drag/drop, ordinary upload, document attachment paste, creation, directories or pass-through nodes. Existing client tree permissions and server enforcement remain; the prompt must not infer editing permission from file visibility or selected file type. Do not broaden tree/App wiring in this issue.

Use shared ordinary Dialog for the file-selection form, titled `새 버전 올리기`, with its existing cancel path. This is input UI, not the confirmation grade. Maximum width 560px, at most viewport minus 48px, 24px inset, 6px radius, control surface and approved overlay. Long target/selected names wrap in full. Native `input type=file` has persistent visible label `새 버전 파일`, accessible name including the existing target file name, at least 36px control height and 4px radius; style `::file-selector-button` with shared button roles while keeping native keyboard/file-picker behavior. Single file only; do not add `accept` filtering, MIME/extension validation or hardcoded upload limits. Preserve the original File object.

Selected file name may be repeated as wrapping 12/18px text below the native control when the browser truncates its filename. Show the existing target name separately so selection cannot be mistaken for renaming: `대상 파일: {node.name}`. The server target remains `node.id`; choosing a differently named file supplies content and must not change the target name/ID or its ACL/history identity. Do not normalize bytes or file names in the UI.

### Markdown / reversible target

When the existing server flag indicates the non-warning path, selecting a file invokes the existing `onPick(file)` once, as today. No confirmation dialog, extra “are you sure” step or L3 token is added. The ordinary picker form is not an L2 gate. `그만두기`, Escape and native-picker cancel before selection produce no upload; canceling the native chooser may simply leave the form open. Preserve the existing parent close-on-pick behavior without calling it upload success.

### Binary / irreversible target

The picker form shows a persistent warning from the existing supplied classification: `{node.name} 은(는) 버전으로 보관되지 않습니다. 새 버전을 올리면 지금 내용을 되돌릴 수 없습니다.` Use warning surface/status-warning with explicit text. Selecting a file only stores that File locally; it must not call `onPick`.

After selection, `새 버전 올리기` opens **one** shared L2 AlertDialog. It is disabled while no File is selected. The alert lists target and selected file names and repeats the irreversible consequence; input selection is not the affirmative action. Alert title `기존 파일을 교체하시겠습니까?`; cancel `돌아가기` uses secondary styling and receives initial focus; affirmative `교체하기` uses destructive styling. Only affirmative activation calls `onPick` once with the still-current selected File and target. No typed token, fake impact count or second confirmation is introduced.

Cancel/Escape from the alert returns to the picker with selection intact and no upload. Outside pointer interaction never accepts or dismisses the risk alert. `그만두기`/ordinary Dialog close cancels the whole form and discards only its local File selection, never server content. Use #48 ownership-aware topmost dismissal and focus trapping; remove the existing global Escape listener that would close multiple layers. Return alert-cancel focus to the initiating form action. Whole-form focus return uses the existing surviving invocation target or a meaningful existing fallback; a missing external focus handoff must be recorded separately rather than silently modifying App/tree.

If target identity changes while open, discard obsolete selection/confirmation so old consent cannot upload to a different target. Repeated keyboard/click activation of the same accepted File invokes the callback once. Native file chooser interaction cannot be treated as application confirmation. IME composition Enter must not activate the risk acceptance; no text field or new composition-dependent filename editor is added.

## Upload outcomes — conditional presentation contract and explicit gap

IR-SHELL-010 supplies the authoritative parent signals and requires the prompt to remain mounted through these states:

| Real operation phase | Required presentation |
| --- | --- |
| Upload in flight | `새 버전을 올리는 중입니다.` and busy/duplicate prevention; no invented percentage or abort control |
| Server success | The mounted prompt's single result region announces `새 버전을 올렸습니다.` only after the actual 204 response; tree and applicable document refresh outcomes are observed separately within the same composite result |
| Failure | Safe generic `새 버전을 올리지 못했습니다.`; never unconditional success/close feedback inferred from callback invocation |
| Retry | Existing endpoint with exact retained target/File. A binary retry is a new upload attempt and receives one fresh L2 confirmation; markdown remains L1. No blind auto-retry, guessed reconstructed file or alternate overwrite route |

This table is now implemented through the narrow IR-SHELL-010 handoff. The upload-feedback completion criterion requires actual success/failure and refresh-result tests and cannot be replaced by callback spies. L1 undo-completeness cannot be invented from a void upload response.

**Superseding decision for IR-SHELL-010:** the earlier `still-applicable L2 consent` wording is withdrawn. Input retention and consent lifetime are separate: the same `nodeId` and original `File` stay selected after failure, while every binary upload attempt, including a retry, receives a fresh L2 confirmation. A post-204 screen-data refresh retry performs GET only and receives no new L2. After a 204 response, one mounted result region moves through accepted/refreshing, accepted/refresh-failed, and accepted/refreshed states; it never shows separate success and failure announcements. Focus destinations follow IR-SHELL-010 AC-9 and are asserted through Playwright `activeElement` checks.

**Scope disposition:** registration of IR-SHELL-010 approves the #58 result connection in App.tsx, AppShell.tsx and NewVersionPrompt.tsx. Earlier App/AppShell expansion prohibitions are superseded only for that connection; all other scope exclusions remain.

## Acceptance and independent evidence checklist

- [ ] TDD first: observe failing computed-style/state/interaction tests before implementation, especially binary selection not uploading until L2 acceptance, cancel/no mutation, image fit/load/error, PDF download-only and one-shot callback ownership.
- [ ] Real product file click opens bounded image preview or download-only surface with no md mode controls. Include tiny, very wide, very tall and transparent images, long Korean/Latin filenames, cached load and failed/missing/forbidden loads. Measure actual image rectangle/aspect ratio against available content; no crop, stretch, upscaling or shell-width growth.
- [ ] PDF and generic binary trigger real Playwright download events through existing authenticated URLs. Verify exact fixture byte hash and supported Unicode suggested filename; no viewer DOM, text fetch/render or misleading completion message. An existing backend/header mismatch is a separate reported gap, not scope for a new route.
- [ ] Actual tree context-menu new-version path: only allowed file/edit nodes; directories, pass-through and view-only cannot invoke overwrite through existing contracts. Direct server permission-loss rejection remains enforced. Ordinary directory upload and paste keep their existing create/attachment route and never overwrite an existing target.
- [ ] Markdown selects and hands off without a confirmation gate and server preserves prior body/version according to existing behavior. Binary selection makes no upload request; cancel/escape makes none; one affirmative L2 action issues exactly one request with the selected File. Changed target/file cannot reuse stale consent.
- [ ] Actual upload integration, beyond spies: inspect selected-file bytes arriving unchanged, target ID/name/ACL retained, binary replaced only through new-version endpoint, md prior-version behavior preserved, and the authorized App/AppShell handoff kept mounted through real results. Test network and authorization failure separately. Verify tree refresh always and the applicable observed document query independently, including tree-only failure, document-only failure, both failures and failed-GET-only retry with no extra POST or L2. Callback handoff alone never proves success.
- [ ] Matrix: 1280×720, 1440×900, 1920×1080 × light/dark × 100%/real 200% = 12 environments. Inspect image/download/picker/binary warning/confirmation, long names, native input and `::file-selector-button`, button states, theme inheritance in portals, actual colors, radii, overflow and focus rectangles. Capture screenshots and geometry; preserve #50's three-panel access.
- [ ] Genuine 200% uses isolated persistent Chromium extension `chrome.tabs.setZoom(tabId,2)`, confirms `getZoom===2`, records before/after CSS viewport/DPR. CSS zoom, transforms, device scale or reduced viewport do not substitute. Image edges, filename, file input and cancel/confirm remain reachable without shell expansion.
- [ ] Keyboard: native picker, Tab order, visible 2px ring/2px separation, cancel-first L2 focus, alert Escape-only top layer, outside-alert click inert, focus restoration after cancel and single Enter/Space acceptance. No global Escape listener bypasses overlay ownership. Ordinary picker cancellation does not become confirmation or upload.
- [ ] No application text input is introduced, so native filename-entry IME inside the OS picker is not claimed by browser synthetic tests. Use a real file with a composed Korean/emoji filename and preserve it; composition key events reaching the risk dialog cannot accept. Existing editor IME regressions remain unchanged if shared source integration is touched.
- [ ] Normal text ≥4.5:1, large text ≥3:1, active controls/focus ≥3:1 using actual light/dark composed surfaces. Image pixels are original content, not palette test targets. Warning/error have visible text, not color alone. Disabled no-file action and read-only preview are distinguished; unsupported-format validation is N/A because this flow does not add format filtering.
- [ ] Independent reviewer checks original SRS/issue, final scoped diff, red/green and Playwright product-browser artifacts. Verify upload feedback, deterministic focus restoration and tree/applicable-document refresh against IR-SHELL-010. Any remaining resource-refresh gap must be reported rather than hidden. This decision does not verify FR-ATTACH-003/FR-SHELL-008 anew or complete unrelated aggregate design requirements.
