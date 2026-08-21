# wave-1 구현 계획 독립 검증 (eval)

- 검증 대상: `docs/plans/2026-08-20.doculight2.wave-1.plan.md` · `docs/plans/2026-08-20.doculight2.wave-1.sidecar.json`
- 분모(외부 고정): `docs/analysis/kiwi-planner-2026-08-20.doculight2.wave-1/inventory.json` — REQ 24건 / AC 118개
- 검증자: 독립 검증 서브에이전트. 작성자의 정당화는 전달받지 않았고, 원본 요구사항(`npx speckiwi show`)·원장(`docs/spec/00.decision-log.md`)·저장소 실측만으로 판정했다.
- 계획 파일은 수정하지 않았다.

## 종합 판정

| severity | 건수 |
|---|---:|
| CRITICAL | 0 |
| HIGH | 3 |
| MEDIUM | 7 |
| LOW | 5 |

**팀 리드가 지목한 `R139` 위반은 없다.** 계획은 참조 감사 행을 nullable 로 만들지 않았고, 오히려 세 자리에서 NOT NULL 과 "항목당 1건 이상"을 명시적으로 못 박았다(축 5).

실제 결함은 다른 자리에 있다 — **커버리지 111/118 중 최소 1건이 계획 자신의 판정 규칙을 어기고 부풀려져 있고**(H-1), **유예 7건 중 1건은 사실이 아닌 전제 위에 서 있으며**(H-2), **red 19건 전부의 실패 근거가 "모듈 부재" 하나로 획일화되어 있다**(M-1).

---

## 축 1. AC 가 실제로 검증되는가

계획은 §6.1 에서 covered/deferred 판정 규칙을 스스로 선언한다:

> **covered** — wave-1 이 그 AC 에 대한 검증 산출물을 만든다. AC 가 이름으로 드는 주체 일부가 wave-1 에 없더라도 **존재하는 주체에 대해 실제로 시험되면** 커버로 센다.
> **deferred** — 그 AC 에 대한 검증 산출물을 wave-1 이 **전혀** 만들 수 없다.

이 규칙 자체는 합리적이다. 아래 결함은 규칙이 나쁜 것이 아니라 **계획이 자기 규칙을 일관되게 적용하지 않은 자리**다.

### H-1 (HIGH) — `CON-ARCH-002` AC-7 은 covered 가 아니라 deferred 여야 한다

- **AC 문면** — "1.0 의 REST 표면(tree · raw · search)에 대응하는 2.0 엔드포인트는 전부 요청자 권한 필터를 거친다."
- **계획의 처리** — `sidecar.coverage[CON-ARCH-002].ac_covered = 8`, `missing_ac_ids = []`. AC-7 은 T-PH009-02(review)가 덮는다고 적혀 있다.
- **그런데 같은 계획이 두 자리에서 반증한다.**
  - `plan.md:2477` (RISK-06): "**`CON-ARCH-002` AC-7 이 wave-1 에서 공허하게 참이다** … 위반 대상이 없어 판정이 통과로 나가지만 **실질 검증은 아니다**."
  - T-PH009-02 의 `action`: "**AC-7 은 wave-1 이 tree·raw·search 대응 엔드포인트를 만들지 않아 위반 대상이 없다** — 그 엔드포인트가 서는 wave 에서 재판정한다."
- **판정** — §6.1 의 covered 는 "**존재하는 주체**에 대해 실제로 시험되면"이 조건이다. AC-7 의 주체는 ① tree·raw·search 대응 엔드포인트 ② 요청자 권한 필터 — wave-1 에 **둘 다 0건**이다(ACL scope 는 wave-1 밖). 존재하는 주체가 공집합이므로 §6.1 의 deferred 정의("전혀 만들 수 없다")에 정확히 해당한다.
- **영향** — §4 역색인의 `CON-ARCH-002 8/8` 과 총계 "덮은 AC **111** · 유예 **7**"이 1건 부풀려져 있다. 올바른 값은 110 / 8 이다. 코더가 T-PH009-02 를 통과시키면 AC-7 에 `verified` 가 붙지만 그 근거는 "위반할 대상이 없었다"뿐이다.
- **증거** — `docs/plans/2026-08-20.doculight2.wave-1.plan.md:2477`(RISK-06), `:2456`(§4 역색인 행), `:2654`(§6.1 판정 규칙), sidecar `coverage[1]` / `tasks[T-PH009-02].covers`.

### H-3 (HIGH) — `REL-AUDIT-001` AC-7 의 커버가 반증 불가능한 단언 위에 놓였다

- **AC 문면** — "같은 사실이 audit_log 와 대기열에 두 번 적히지 않는다."
- **계획의 처리** — `covers` 상 AC-7 을 덮는 것은 **T-PH003-04 하나**다(sidecar `tasks[T-PH003-04].covers = {"REL-AUDIT-001":["AC-7"]}`).
- **문제** — 그 짝 red(T-PH003-03)의 acceptance test 는 "**대기열 테이블에 같은 값을 담은 칸이 존재하지 않는다**"인데, 실행 순서상 그 시점에 `reconciliation_finding` 테이블은 아직 **없다**:
  - `T-PH003-03.depends_on_task = ["T-PH003-02"]`, `T-PH003-04 ← T-PH003-03`, `T-PH003-05 ← T-PH003-04`, `T-PH003-06 ← T-PH003-05`.
  - 대기열 테이블은 T-PH003-**06** 이 만든다(`migrations/003_reconciliation_finding.sql`).
- **결과** — "대기열에 그 칸이 없다"는 단언이 red 에서도 green 에서도 **공허하게 참**이다. 실패시킬 수 없는 단언은 커버리지가 아니다.
- **실질 검증은 뒤에 있으나 크레딧이 붙지 않았다** — T-PH006-03 의 integration test "같은 사실이 두 저장소에 값으로 복제되지 않는다"가 진짜 시험이지만, 그 짝 green(T-PH006-04)의 `covers` 는 `REL-AUDIT-001: ["AC-6"]` 뿐이고 AC-7 이 없다.
- **증거** — sidecar `tasks[T-PH003-03].acceptance_tests[1]`, `tasks[T-PH003-04].covers`, `tasks[T-PH003-06].files[0]`, `tasks[T-PH006-04].covers`.

### M-6 (MEDIUM) — 업로드 축 AC 2건은 존재하지 않는 경로에 대해 covered 로 계상됐다

| REQ | AC | 문면 | 계획의 처리 |
|---|---|---|---|
| `FR-WORKSPACE-004` | AC-3 | 같은 검사가 **업로드된 파일 이름**에도 적용된다 | covered (T-PH004-06) |
| `SEC-STORAGE-005` | AC-2 | 이름이 점으로 시작하는 파일의 **업로드**는 거부된다 | covered (T-PH004-10) |
| `SEC-STORAGE-004` | AC-3 | **첨부 다운로드** 전용 엔드포인트는 … | **deferred** ("ATTACH scope … wave-1 에 없다") |

T-PH004-05 의 `action` 이 스스로 적는다 — "**HTTP 업로드 라우트 자체는 ATTACH scope 의 뒤 wave 소유**이며, 그 라우트가 이 검증기를 경유해야 한다는 계약을 테스트가 고정한다." 즉 업로드 축 시험은 **존재하지 않는 호출자에 대한 계약**을 자기 자신에게 거는 형태다.

같은 사유(ATTACH scope 부재)로 `SEC-STORAGE-004` AC-3 은 유예했으면서 업로드 축 둘은 covered 로 센 것은 **같은 규칙의 비대칭 적용**이다. 검증기 자체는 실재하므로 H-1 만큼 공허하지는 않지만, "업로드 경로에 적용된다"는 AC 의 핵심 주장은 wave-1 에서 관측되지 않는다.

- **증거** — sidecar `tasks[T-PH004-05].action`, `tasks[T-PH004-06].covers`, `tasks[T-PH004-10].covers`, `deferred_ac[5]`.

### M-7 (MEDIUM) — `CON-ARCH-002` AC-8 을 좁혀 닫고 그 사실을 위험으로 올리지 않았다

- **AC 문면** — "1.0 리포는 **동결된 상태로 운영 가능하게 유지된다**."
- T-PH009-02 의 `action` — "AC-8 의 '운영 가능하게 유지' 는 2.0 저장소 밖의 사실이므로 여기서는 '2.0 이 1.0 을 수정하지 않았다' 까지만 판정한다."
- AC 를 절반만 판정하고 covered 로 계상한 것 자체는 §6.1 규칙 안이나, **잔여(1.0 의 실제 운영 가능성)가 §5.1 위험 어디에도 없다.** 같은 형태의 다른 잔여는 전부 위험으로 올렸다(RISK-04·05·06·12). AC-8 만 빠졌다.
- **증거** — sidecar `tasks[T-PH009-02].action`, `plan.md:2471~2487`(§5.1 전 12행에 AC-8 언급 0건).

### M-5 (MEDIUM) — `CON-ARCH-007` AC-2 판정 근거에서 `docs/research/` 가 빠졌다

- **AC 문면** — "**설계 문서와 결정 문서**가 `docs/spec` 밖에 존재하지 않는다."
- T-PH009-04 의 `action` 과 OQ-04 가 실측 근거로 드는 목록 — "`docs/rule/`·`docs/next/`·`docs/analysis/`·`docs/plans/` 를 `docs/spec` 밖에 두고 있다".
- **누락** — 저장소에는 `docs/research/editor/` 가 있고 그 안에 `02.atomic-editor-analysis.md` · `03.implementation-plan.md` 가 있다. 이름과 내용 모두 **설계 문서로 읽힐 소지가 가장 큰 자리**인데 판정 근거 목록에서 빠졌다. `packages/editor/vite.config.ts:5` 의 주석이 그 문서를 설계 근거로 인용한다("docs/research/editor/03 §4").
- 이 누락은 판정을 통과 쪽으로 기울인다 — 다음 검토자가 목록을 그대로 받으면 실제 위반 후보를 보지 못한다.
- **증거** — sidecar `tasks[T-PH009-04].action`, `plan.md:2511~2517`(OQ-04), 실측 `docs/research/editor/*.md` 4개 파일, `packages/editor/vite.config.ts:5`.

### L-4 (LOW) — `DR-WORKSPACE-001` AC-5 의 첨부 축은 AC-4 의 재진술로 닫힌다

AC-5("워크스페이스 개명 후에도 기존 **첨부 URL** 과 백업 경로가 그대로 유효하다")에 대해 T-PH005-03 이 쓰는 시험은 "표시 이름 변경 후 물리 경로와 **그 경로 기반 URL** 이 그대로다"다. 첨부가 wave-1 에 없으므로 실질은 AC-4(물리 경로 불변)와 같다. AC-5 의 실질 내용이 AC-4 와 겹치므로 실해는 작다.

---

## 축 2. 유예 7건이 정당한가

`docs/analysis/kiwi-wave-master-.../design-baseline/wave-1.md` §요구사항 표(24건)로 대조했다. wave-1 의 scope 는 **ARCH · AUDIT · STORAGE · WORKSPACE** 넷뿐이고, AUTH · ACL · SHELL · ATTACH · EDITOR scope 요구사항은 **0건**이다.

| # | REQ · AC | 유예 사유의 scope 주장 | 실측 판정 |
|---|---|---|---|
| 1 | `CON-ARCH-003` AC-4 | EDITOR scope | **부당 — H-2 참조** |
| 2 | `DR-STORAGE-002` AC-3 | AUTH · ACL scope | 정당 (가입 승인·그룹 변경·ACL 변경 어느 것도 24건에 없음) |
| 3 | `FR-WORKSPACE-005` AC-3 | SEC-SHELL-002 (SHELL) | 정당 (`SEC-SHELL-002` 실재 확인, wave-1 24건 밖) |
| 4 | `FR-WORKSPACE-005` AC-4 | ACL scope | 정당 |
| 5 | `FR-WORKSPACE-006` AC-6 | EDITOR · SHELL scope | 정당 (팀 리드 명시 제외 대상) |
| 6 | `SEC-STORAGE-004` AC-3 | ATTACH scope (R66) | 정당 (`R66` 원장 실재, 24건 밖) |
| 7 | `SEC-STORAGE-004` AC-4 | 휴지통·버전 API | 정당 |

7건 중 6건은 대상 scope 가 실제로 wave-1 밖이며 사유가 참이다.

### H-2 (HIGH) — `CON-ARCH-003` AC-4 유예 사유가 사실과 다르고, mermaid 축은 wave-1 에서 닫을 수 있다

- **AC 문면** — "`mermaid` · `katex` · `@codemirror/merge` 는 동적 import 로 분리된다."
- **계획의 유예 사유** — "**wave-1 SPA 는 셋 중 어느 모듈도 도입하지 않는다**(`packages/editor` 는 빌드 배선만 편입하고 `src/**` 를 건드리지 않으므로 **mermaid 도 SPA 번들에 들어오지 않는다**). 분리 여부를 관측할 대상이 없어 통과도 실패도 판정할 수 없다."
- **실측 반증**
  - `packages/editor/package.json` 의 `dependencies` 에 **`"mermaid": "^11.4.1"`** 이 이미 선언돼 있다.
  - `packages/editor/src/core/mermaid-render.ts:101` — **`const { default: mermaid } = await import('mermaid');`** 그 줄 위 `:99` 의 주석이 "**동적 import 기본 구현. mermaid 는 최초 렌더 시점에만 적재된다**" 라고 적는다.
  - T-PH001-01 이 만드는 루트 `package.json` 은 `workspaces: ["packages/*"]` 와 **워크스페이스 전체를 도는 `build` 스크립트**를 정의한다. 즉 wave-1 의 빌드는 `packages/editor` 를 포함하고, 그 번들에 mermaid 가 들어간다.
- **두 겹의 결함**
  1. **사실 오류** — "어느 모듈도 도입하지 않는다"는 거짓이다. `src/**` 를 건드리지 않는 것과 번들에 들어오지 않는 것은 다른 명제인데 사유가 전자를 후자의 근거로 쓴다(비논리).
  2. **범위 축소** — §6.1 의 covered 규칙("존재하는 주체에 대해 실제로 시험되면 커버")을 적용하면 mermaid 축은 **관측 가능하므로 covered** 여야 하고, katex·`@codemirror/merge` 잔여는 §5.1 위험으로 올리는 것이 계획 자신의 다른 자리(RISK-04·05·12)와 일치하는 처리다. 지금은 셋 다 관측 불가로 묶여 유예됐다.
- **닫는 비용은 거의 없다** — T-PH009-03 이 이미 `npm run build` 산출물을 검토하고, T-PH001-03 이 이미 `packages/editor` 의 빌드 배선을 만진다. 청크 분리 관측은 그 자리에 한 줄 붙는 검토다.
- **증거** — `packages/editor/package.json`(dependencies), `packages/editor/src/core/mermaid-render.ts:99-101`, sidecar `deferred_ac[0].reason`, `tasks[T-PH001-01].action`, `plan.md:2556`(§5.4 표 첫 행).

> **wave-1 안의 것으로 닫을 수 있는데 유예한 자리는 이 1건이다.** 나머지 6건은 닫을 방법이 없다.

---

## 축 3. TDD 페어가 실질인가

red 19 · green 19 쌍은 전부 `depends_on_task` 로 연결돼 있고, `type=code` 38건 중 TDD 면제는 0건이다. 아래는 그 위의 문제다.

### M-1 (MEDIUM) — red 79건 전부의 실패 근거가 "모듈 부재" 하나다

sidecar 의 red test_case 79건을 전수로 집계한 결과, `expected_failure_signature` 가 **예외 없이 `Cannot find module .*<경로>` 형태**다. 18종의 서로 다른 모듈 경로가 나오지만 실패 유형은 하나뿐이다.

```
8 | Cannot find module .*domain/naming/name-validator
8 | Cannot find module .*app/reconciliation/reconcile
7 | Cannot find module .*infra/fs/workspace-layout
6 | Cannot find module .*infra/sqlite/finding-queue-repository
... (총 18종 / 79건, 전부 동일 유형)
```

**왜 문제인가** — 모듈이 없으면 그 파일의 테스트는 **단언 내용과 무관하게** 전부 실패한다. 그래서 red 통과가 "각 단언이 변별력을 갖는다"를 전혀 증명하지 않는다. 특히 **부재를 주장하는 AC** 에서 치명적이다:

- `REL-AUDIT-001` AC-3 "대기열 항목이 시각·대상 노드·행위자·해소 시각·해소자를 자기 칸으로 갖지 않는다" — 금지 칸이 실제로 있을 때 이 단언이 실패하는지는 모듈 부재 red 로 확인되지 않는다.
- `CON-WORKSPACE-001` · `SEC-STORAGE-006` AC-2 등 같은 형태 다수.

계획 자신의 TDD-POLICY-01 은 "red 는 **AC 를 명시적으로 열거한 실패 테스트**를 쓰고"라고 적는데, 모듈 부재는 AC 를 열거하지 않아도 나는 실패다.

- **증거** — sidecar 전 red task 의 `tdd.test_cases[].expected_failure_signature` 79건 집계.

### M-2 (MEDIUM) — green Task 19개의 test_case 79건 전부가 `expected_failure_signature` 를 그대로 달고 있다

green 은 실패를 기대하지 않는 단계다. 그런데 green test_case 79건 **전부**(`greenWithSig = 79 / greenTC = 79`)가 짝 red 와 **동일한** `expected_failure_signature` 를 갖는다. 예 — T-PH003-06(green)의 6건이 T-PH003-05(red)의 6건과 자구까지 같다.

red/green test_case 는 `-01` / `-02` 접미사만 다르고 `ac_refs` · `test_symbol` · `test_file` 이 동일하므로, **이 필드만 읽는 자동 게이트는 두 단계를 구별할 수 없다.**

- **증거** — sidecar `tasks[T-PH003-05].tdd.test_cases` 대 `tasks[T-PH003-06].tdd.test_cases`, 전 green task 집계 79/79.

### M-3 (MEDIUM) — T-PH006-05 의 red 는 선언한 신호로 실패할 수 없다

- T-PH006-05 의 test_case 는 `expected_failure_signature = "Cannot find module .*app/reconciliation/reconcile"` 을 선언한다.
- 그러나 `packages/server/src/app/reconciliation/reconcile.ts` 는 **T-PH006-02 가 이미 만든다**. 의존 사슬은 T-PH006-05 ← T-PH006-04 ← T-PH006-03 ← (PH-006 진입) 이고 T-PH006-02 는 그보다 앞이다.
- 즉 그 모듈은 red 시점에 존재하며, 선언된 실패는 일어나지 않는다. 실제 red 는 단언 실패로 나야 하는데 계획이 그 형태를 적지 않았다.
- **파일 생성 순서 기준 기계 검사에서 79건 중 이 1건만 걸렸다.** 나머지 78건의 signature 는 모두 아직 없는 모듈을 가리킨다.
- **증거** — sidecar `tasks[T-PH006-05].tdd.test_cases[].expected_failure_signature`, `tasks[T-PH006-02].files[0]`.

### green 이 red 보다 더 구현하려 하는가 — 아니다

green 19건의 `files[]` 를 짝 red 의 signature·acceptance_tests 와 대조했다. 확장은 전부 해당 AC 를 통과시키는 데 필요한 최소 동반물이다(예 — T-PH003-02 는 `database.ts` 외에 `migration-runner.ts` · `001_init.sql`; T-PH004-02 는 `node-id.ts` 외에 `004_node.sql` · `node-repository.ts` — AC-3 의 통합 시험에 필요). green DoD 는 전건이 "red 전건 통과 + 회귀 통과" 형태이고 추가 기능을 지시하는 자리가 없다. **범위 초과 green 은 0건이다.**

### 면제 17건의 사유가 진짜인가 — 대체로 진짜다

- **`type=code` 면제 0건** — TDD-POLICY-03 대로다.
- **면제 근거의 사실성 확인** — review 로 닫는 요구사항 9건(`CON-ARCH-001/002/003/007/008/009` · `CON-WORKSPACE-001` · `OPS-ARCH-001` · `OPS-STORAGE-001`)의 `Verification Method` 를 `speckiwi show` 로 전수 조회한 결과 **9건 전부 실제로 `review`** 다. 면제 사유가 인용한 사실이 참이다.
- 20자 채우기용 사유는 없다. 각 사유가 "왜 실패시킬 동작이 없는가"와 "대체 검증이 무엇인가"를 함께 적는다.

#### L-1 (LOW) — T-PH009-06 의 면제 사유가 없는 것을 대체 검증으로 든다

여섯 PH-009 Task 의 면제 사유는 "대체 검증은 검토 기록과 **`verification_cmd` 의 검색 결과**다"로 끝난다. 그런데 **T-PH009-06 의 `verification_cmd` 는 `null`** 이다. 대체 검증으로 든 것이 그 Task 에 존재하지 않는다.

(같은 형태인 T-PH008-02 도 `verification_cmd` 가 null 이지만, 그쪽 사유는 "대체 검증은 절차 검토다"로 적어 모순이 없다.)

#### L-2 (LOW) — PH-009 여섯 Task 의 면제 사유가 자구까지 동일하다

T-PH009-01 ~ T-PH009-06 의 `exempt_reason` 이 **문자 단위로 같은 문자열 하나**다. 내용은 참이고 각 Task 의 변별은 `verification_cmd` 가 지지만, 사유 자체는 Task 별 판단을 담지 않는다.

---

## 축 4. 팀 리드가 준 경계를 지켰는가

### `packages/editor/src/**` — 위반 0건 ✔

Task 55개의 `files[]` 전수(중복 제거)에서 `packages/editor` 를 가리키는 항목은 **`packages/editor/vite.config.ts` 하나**뿐이다. 빌드/테스트 배선이므로 허용 범위 안이다.

- T-PH001-03 의 DoD 가 "`packages/editor/src/**` 에 **diff 0줄**"을 명시적으로 건다.
- T-PH001-04 는 vendor 테스트 실패 중 `src/**` 수정이 필요한 건("② 제품 결함")을 **이 wave 밖으로 이관**하도록 지시한다.
- sidecar `external_module_impact[0].forbidden_changes` 가 `src/**` 수정 · `package.json` 의존성/스크립트 변경 · dev 포트 변경 셋을 금지로 등재했다.
- `packages/` · `docs/` 밖 파일은 `package.json` · `package-lock.json` · `tsconfig.base.json` · `ecosystem.config.cjs` 넷뿐이다.

### 포트 — 프론트 dev 서버는 3399 ✔ / dev Express 3400 은 사유 명시 있음

plan.md 에 3399 15회 · 3400 3회, sidecar 에 3399 11회 · 3400 2회. 다른 포트는 0건.

- `packages/web` dev = **3399** (T-PH001-06), 운영 Express = **3399** (T-PH007-02 · T-PH008-01).
- dev Express = **3400**. C-09 는 "사유 없이 다른 포트를 쓰지 않는다"이고, 계획은 RISK-09 와 §6.4 제약표에 사유를 적었다("3399 가 제품 dev 서버 몫이기 때문").

#### L-5 (LOW) — 3400 을 정한 조항은 어디에도 없다
사유는 적혔으나 3400 이라는 값 자체의 근거는 "3399 다음 수"뿐이다. 규칙 위반은 아니다.

### 1.0 저장소(`C:\Work\git\DocuLight\DocLight`) — 이를 가리키는 설정·Task 0건 ✔

경로가 등장하는 자리는 전부 **금지 서술**이다:
- T-PH008-01 `action` — "1.0 저장소(`C:\Work\git\DocuLight\DocLight`)의 구성 파일을 **복사하지 않고** 참고만 해 새로 쓴다."
- sidecar `external_module_impact[1]` — `ownership: "read-only-reference"`, `allowed_changes: []`.
- T-PH001-01 · T-PH008-01 · T-PH009-02 가 각각 "1.0 경로 참조 0건"을 DoD/검증 명령으로 건다.

#### L-3 (LOW) — 1.0 경로 검사 문자열이 양쪽으로 어긋난다

- T-PH001-01 의 검토 기준은 "`package.json` 안에 **`C:\Work\git\DocuLight`** 문자열이 0건" 인데, **현 저장소 경로 `C:\Work\git\DocuLight2.0` 이 그 문자열을 접두로 포함한다.** 절대 경로가 한 줄이라도 들어가면 위양성이 난다.
- 반대로 T-PH008-01 · T-PH009-02 의 실제 검사어는 **`DocLight`** (u 없음)이라 `C:\Work\git\DocuLight\` 까지만 쓴 참조는 놓친다.
- 두 검사가 같은 사실을 서로 다른 문자열로 재는 것 자체가 `CON-ARCH-008`(한 사실 한 곳)과 어긋난다.

### `FR-WORKSPACE-006` AC-6 — 계획에 들어가 있지 않다 ✔

"옵시디언 볼트를 그대로 넣으면 브라우저에서 읽기와 편집이 동작한다"는 **유예 7건에 포함**돼 있고(`deferred_ac[4]`), T-PH005-07 의 `action` 이 "**AC-6 … 은 이 wave 밖이다**"를 명시하며 DoD 가 "AC-6 을 다루지 않았음이 테스트 주석에 적혀 있다"를 요구한다. 계획에 들어가면 안 되는 것이 들어가지 않았다.

---

## 축 5. 계획이 답하기로 한 결정을 실제로 답했는가

`docs/analysis/kiwi-srs-feasibility-2026-08-20.doculight2.wave-1/report.md` §5 의 다섯 항목을 전수 대조했다. **다섯 다 답했고, 다섯 다 근거가 있다.**

| # | feasibility §5 항목 | 계획의 답 | 근거 실측 |
|---|---|---|---|
| 1 | wave 경계 수정 — `REL-STORAGE-001`·`REL-AUDIT-001` 을 wave-1 로 | §1.2 — "이 계획의 입력 인벤토리는 그것이 반영된 24건" | ✔ inventory.json 에 두 REQ 실재. `SEC-STORAGE-006` AC-3 · `DR-WORKSPACE-002` AC-6 이 실제로 wave-1 안에서 닫힌다 |
| 2 | `FR-WORKSPACE-004` 세 값 | §5.5 말미 ①②③ — 금지 문자 집합 / 255 UTF-8 바이트 / 상대 경로 512 바이트 | ✔ 근거를 원문 인용 수준으로 적음(Microsoft Learn *Naming Files, Paths, and Namespaces* · `ext4_dir_entry_2.name_len` 이 `__u8` · NTFS UTF-16 255). **512 도출이 특히 견고** — `255 × 2 + 2`, "AC-5 가 허용하는 이름을 AC-6 이 거부하는 자기모순"을 피하는 최소값 |
| 3 | `CON-WORKSPACE-001` 을 깊이 상한으로 읽는가 | OQ-01 — **아니다**(계층의 종류를 닫은 조항) | ✔ 요구사항 문면·AC-1~3 형태·Rationale·`DR-WORKSPACE-001` AC-7 충돌을 근거로 듦. **남는 모호성(AC-4)을 스스로 인정**하고 사용자 확인 필요로 표시 |
| 4 | `R139` 계열 전수 정독 | T-PH002-03 + §6.3 "`R139` 계열 전수(**8행**)" | ✔ **실측 일치** — 아래 상세 |
| 5 | `OPS-STORAGE-001` 검증 방법 | OQ-03 — AC-1·AC-4 는 런북(문서), AC-2·AC-3 은 자동 테스트로 **가름** | ✔ 요구사항 Implementation Notes 가 두 축을 이미 갈라 놓았다는 인용이 실재 |

### `R139` 대기열 스키마 — 팀 리드가 지목한 위반은 **없다**

`docs/spec/00.decision-log.md` 에서 `R139` 로 시작하는 표 행을 직접 세었다 — **8행**:

| 행 | 줄 |
|---|---:|
| `R139` | 145 |
| `R139-a` | 146 |
| `R139-b` | 147 |
| `R139-c` | 148 |
| `R139-d` | 149 |
| `R139-e` | 150 |
| `R139-f` | 151 |
| `R139-g` | 152 |

계획 §6.3 의 "`R139` 계열 전수(8행)" 와 정확히 일치한다. (feasibility 검증이 "초판이 `R139-a`~`R139-f` 로 적었으나 `R139-g` 가 있다"고 지적한 M-5 를 계획이 반영했다.)

**참조 감사 행을 nullable 로 만들지 않았다.** 세 자리에서 반대로 못 박는다:

1. **T-PH002-03** `action` — "**참조 감사 행을 nullable 로 만들지 않는다**(비우면 다섯 값의 유일한 출처가 사라져 `R139` 를 정면 위반한다)". DoD 에 "참조 감사 행 NOT NULL 이 계약에 명시됐다".
2. **T-PH003-06** `action` — `reconciliation_finding(id, type)` + `reconciliation_finding_audit_ref(finding_id, audit_log_id, ordinal)`, "참조 테이블의 두 칸은 **NOT NULL** 이고 항목마다 참조가 **1건 이상**임을 삽입 경로에서 강제한다. **`resolution_audit_id` 는 대기열 행의 유일한 nullable 칸**이며 그 비어 있음이 곧 미해소다."
3. **§6.2 금지된 확장** — "**`R139` 대기열의 참조 감사 행을 nullable 로 만들지 않는다.** … `R139-a` 가 준 `R124` 면제의 조건도 사라진다."

원장 문면(`reconciliation_finding(유형, 참조 감사 행 1..N, 해소 감사 행)`, "미해소 는 해소 감사 행 이 비어 있는 상태이지 별도 칸이 아니다")과 대조했을 때 **정합한다.** 계획은 오히려 이 제약 때문에 wave-1 이 최소 `audit_log` 를 함께 열어야 한다는 귀결까지 끌어냈다(OQ-08 · RISK-02 · T-PH003-04).

`R139` 계열 전수를 다시 대조한 결과, 계획이 놓친 조항은 없다 — `R139-e`(스코프는 참조 감사 행에서 파생)는 T-PH002-03 확정 사항에, `R139-b`(`system:reconciler`)는 T-PH003-04 에, `R139-a`(생성 1행 + 항목 1건)는 T-PH006-03/04 에 반영돼 있다. `R139-d`(화면 배치) · `R139-f`(배지) · `R139-g`(이름 규율)는 화면 요구사항이 wave-1 밖이라 반영 대상이 아니다.

---

## 축 6. 존재하지 않는 것을 인용했는가

**허위 인용 0건.** 아래는 전부 실측으로 실재를 확인했다.

| 인용 대상 | 판정 |
|---|---|
| 요구사항 ID — `SEC-SHELL-002` · `FR-ARCH-001` | ✔ 둘 다 `speckiwi show` 로 조회됨 |
| 원장 조항 — `R66` · `R94` · `R102` · `R141` · `R84` · `R55-b` · `R124` · `R124-a` · `R1` · `R3` · `R38` · `R40-c` · `R21-b` · `R33-a` · `R76` · `R77-a` · `R110-a` | ✔ 전부 `00.decision-log.md` 에 실재 |
| 미결 공백 — `G34` · `G35` | ✔ 실재 |
| `packages/editor/vite.config.ts:15` | ✔ **정확** — 그 줄이 `include: ['test/**/*.test.{ts,tsx}'],` 이고, 넓히려는 대상이 바로 그것이다 |
| `packages/editor/src/vendor/atomic-editor/__tests__` 의 **7개 파일** + `setup.ts` | ✔ 정확 — 테스트 파일 7개(`edit-helpers` · `editor` · `markdown-contracts` · `multiline-decoration` · `read-only` · `table-widget` · `wiki-links`) + `setup.ts` + `fixtures/` |
| "현재 `test.include` 때문에 한 번도 수집된 적이 없다" (RISK-01) | ✔ 정확 — 현 `include` 는 `test/**` 만 잡고 vendor 테스트는 `src/vendor/.../__tests__` 아래 |
| §1.1 "루트에 `package.json` 이 없고 … 기존 패키지는 `packages/editor` 하나다" | ✔ 정확 |
| `npx speckiwi links check --json` | ✔ 실재하고 동작(checked 426 · broken 0) |
| 신규 작성 파일(`packages/server/**` · `packages/web/**` · `docs/ops/backup-restore.md` 등) | 아직 없는 것이 정상 — 결함 아님 |

### M-4 (MEDIUM) — 검증 명령 하나가 현재 상태에서 통과할 수 없다

T-PH009-04 의 `verification_cmd.posix` 는

```
npx speckiwi validate --fail-on-warning --json && npx speckiwi links check --json
```

**지금 실행하면 첫 명령이 exit 1 로 끝나고 `links check` 는 실행되지 않는다.** 원인은 wave-1 과 무관한 **선재 경고 2건**이다:

- `SRS-W072` — `02.feature-request-live-preview.md` 가 scope 문서 `02.product-architecture.srs.md` 와 앞 번호를 공유
- `SRS-W023` — draft 요구사항 `FR-SHELL-011`(`docs/spec/08.app-shell.srs.md:1035`)

acceptance test 의 문면은 "**새** 오류를 내지 않는다"라 선재 경고를 허용하는 뜻인데, 명령은 `--fail-on-warning` 하드 게이트라 그 의도와 어긋난다. windows 변형(`; if ($?) { ... }`)도 같다. T-PH002-01 의 acceptance test 도 같은 명령을 쓴다.

(errors 는 0건이므로 `--fail-on-warning` 을 빼면 통과한다.)

---

## 결함이 아닌 것

없는 결함을 만들지 않기 위해, **확인했는데 문제없던 것**을 그대로 적는다.

1. **`R139` 대기열 스키마 위반 — 없다.** 팀 리드가 지목한 "참조 감사 행 nullable" 은 계획이 세 자리에서 명시적으로 금지했고 `resolution_audit_id` 만 nullable 이다(축 5 상세). 원장 `R139` 로 시작하는 행은 직접 세어 **8행**이고 계획의 "8행" 주장과 일치한다.
2. **`packages/editor/src/**` 위반 — 0건.** files[] 전수 중 editor 항목은 `vite.config.ts` 하나. DoD 에 "diff 0줄"이 걸려 있다.
3. **1.0 저장소를 가리키는 설정·Task — 0건.** 등장하는 자리는 전부 금지 서술이다.
4. **`FR-WORKSPACE-006` AC-6 이 계획에 들어가지 않았다** — 유예 7건에 정확히 포함돼 있다.
5. **프론트 dev 서버 포트는 3399** 이며, 3400 은 dev Express 전용이고 사유가 두 자리에 적혀 있다.
6. **feasibility §5 결정 다섯이 전부 근거와 함께 답해졌다.** ②의 세 값은 외부 표준(Microsoft Learn · `ext4_dir_entry_2.name_len` 이 `__u8` · NTFS UTF-16 255)을 근거로 들고, 512 는 "AC-5 가 허용하는 이름을 AC-6 이 거부하는 자기모순"을 피하는 최소값으로 도출한다 — 임의 선택이 아니다.
7. **TDD 면제 근거가 사실이다.** review 로 닫는 9개 요구사항 전부 실제 `Verification Method = review` 임을 `speckiwi show` 로 확인했다. `type=code` 면제는 0건이다.
8. **`type=code` Task 의 `covers` 는 100% test_case 로 뒷받침된다.** green 19건의 `covers` 에 든 AC 가 짝 red 의 `test_cases[].ac_refs` 에 전건 나타난다(불일치로 잡힌 10건은 전부 TDD 면제 infra/review/doc Task 로, 설계상 test_case 가 없는 것이 정상).
9. **green 이 red 보다 더 구현하려 하지 않는다.** 19쌍 전수 확인.
10. **유예 7건 중 6건의 scope 주장이 참이다.** wave-1 24건에 AUTH · ACL · SHELL · ATTACH · EDITOR scope 요구사항이 0건임을 baseline 표로 대조했다.
11. **인용한 요구사항 ID·원장 조항·명령·파일:줄 참조가 전부 실재한다**(축 6 표).
12. **계획이 스스로 위험을 숨기지 않는다.** RISK-04·05·06·12 가 "AC 의 일부 축만 관측된다"는 사실을 자기 손으로 적고, §6.2 가 "계획이 하지 않은 것"을 열거하며, OQ 8건 중 4건에 "사용자 확인 필요"를 붙인다. H-1 도 계획 자신의 RISK-06 문면 덕분에 찾을 수 있었다.

---

## 내가 확인하지 못한 것

1. **유예 7건의 `owner_hint` 가 실제로 그 wave 에서 닫히는지 확인하지 않았다.** `wave-2.md` ~ `wave-9.md` 를 읽지 않았다. scope 가 wave-1 밖이라는 사실까지만 대조했다.
2. **세 값의 외부 근거를 원문으로 대조하지 않았다.** Microsoft Learn 의 예약어 28개 목록과 판본 날짜(2025-04-11), `ext4_dir_entry_2.name_len` 이 `__u8` 이라는 주장, NTFS 의 UTF-16 코드 단위 255 — 전부 계획이 적은 대로 받았다. feasibility 보고서 자신이 §6-7 에서 "그 사실을 문서로 대조 확인하지 않고 지식에서 적었다"고 밝힌 축이므로, **이 축은 여전히 미검증으로 남는다.**
3. **`expected_failure_signature` 79건의 실제 실행 가능성을 검증하지 않았다.** 파일 생성 순서 기준 기계 검사로 T-PH006-05 한 건을 잡았을 뿐, 각 red 가 정말 그 신호로 실패할지는 코드를 쓰기 전에는 알 수 없다.
4. **plan.md §3(Task 상세 55개, 약 2,360줄)의 서술과 사이드카 필드가 자구까지 일치하는지 전수 대조하지 않았다.** 사이드카를 정본으로 읽고, plan.md 는 §1 · §2 · §4 · §5 · §6 과 PH-001/002/008/009 구간을 정독했다.
5. **wave-1 밖 요구사항(88건 규모)이 이 24건과 충돌하는지 보지 않았다.** 검증 범위를 24건으로 한정했다.
6. **`docs/analysis/.../notes.md`(19KB)를 읽지 않았다.** 계수 방법의 정본이라고 계획이 가리키지만, 팀 리드가 계수 축을 실측 완료로 지정해 다른 축에 시간을 썼다.
7. **`CON-ARCH-007` AC-2 의 "설계 문서" 정의를 확정하지 못했다.** M-5 는 `docs/research/` 가 판정 근거 목록에서 빠졌다는 사실만 지적하며, 그 문서들이 실제로 AC-2 위반인지는 판정하지 않았다(그 판정은 OQ-04 의 해석에 달려 있고 계획이 사용자 몫으로 남긴 자리다).
8. **`packages/editor` vendor 테스트를 실제로 켜 보지 않았다.** RISK-01 이 "켜 보기 전에는 알 수 없다"고 적은 그대로다.
