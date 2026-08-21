# wave-1 판정 문서 독립 검증

| 항목 | 값 |
|---|---|
| 검증 대상 | `docs/analysis/kiwi-srs-feasibility-2026-08-20.doculight2.wave-1/report.md` |
| 검증 | 2026-08-21 |
| 검증자 | 독립 검증 서브에이전트 (대상 문서 작성에 관여하지 않음) |
| 방법 | 외부 사실은 Microsoft Learn 원문 대조 · 원장 인용은 `docs/spec/00.decision-log.md` 행 단위 대조 · ID 는 저장소 전수 검색 |
| 결과 | **CRITICAL 1 · HIGH 4 · MEDIUM 5 · LOW 6** |

> 대상 문서는 수정하지 않았다. 아래는 검증 소견뿐이다.

---

## 0. 먼저 — 결함이 **아닌** 것

작성자의 자기신고(§6)와 별개로 직접 확인한 결과, 아래는 **참이다.** 없는 결함을 만들지 않기 위해 먼저 적는다.

| 확인한 것 | 판정 | 증거 |
|---|---|---|
| §4 표의 22행이 baseline 과 ID 단위로 일치 | **참** | `design-baseline/wave-1.md:47-68` 의 22개 ID 와 `report.md:210-231` 의 22행이 **완전 일치.** 빠진 ID·없는 ID 0건 |
| 분포 `high 19 · medium 3 · low 0 · blocked 0` | **참** | 직접 계수 — medium 은 `DR-WORKSPACE-002`·`FR-WORKSPACE-004`·`OPS-STORAGE-001` 셋(`report.md:221,223,227`), 나머지 19행 high. 합 22 |
| **인용한 조항 ID·요구사항 ID·파일 경로가 실재하는가** | **전건 실재. 지어낸 참조 0건** | 아래 §4 참조 |
| Windows 금지 문자 `< > : " / \ \| ? *` + 제어문자 0–31 | **참** | Microsoft Learn *Naming Files, Paths, and Namespaces* — 예약 문자 9개를 그대로 열거하고, 별도로 "Integer value zero" 와 "characters whose integer representations are in the range from 1 through 31" 을 금지한다 |
| 말단 공백·마침표가 실제로 잘리는가 | **참** | Microsoft Learn *File path formats on Windows systems* §Trim characters — *"If the path doesn't end in a separator, all trailing periods and spaces (U+0020) are removed."* 「조용히 잘라낸다」는 서술이 정확하다 |
| `MAX_PATH` 260 이 드라이브 문자부터 세는 절대 경로 한계인가 | **참** | Microsoft Learn *Maximum Path Length Limitation* — *"A local path is structured in the following order: drive letter, colon, backslash, name components separated by backslashes, and a terminating null character. For example, the maximum path on drive D is `D:\<some 256-character path string><NUL>`"* |
| NTFS 255 = UTF-16 코드 단위 | **참** | 같은 문서 — 컴포넌트 한계는 `GetVolumeInformation` 의 `lpMaximumComponentLength`(NTFS 에서 255)이고 *"the file system treats path and file names as an opaque sequence of **WCHAR**s"* 다. W-API 의 WCHAR = UTF-16 코드 단위 |
| ext4 255 = 바이트 | **참** | `ext4_dir_entry_2` 의 `name_len` 이 `__u8` 로 축소되어 255**바이트** 상한. 다바이트 인코딩에서는 글자 수가 그만큼 줄어든다 |
| 한글 UTF-8 3바이트 → ext4 실질 85자 | **참** | 255 ÷ 3 = 85. 산술과 전제 모두 맞다 |
| **§2.2 ② 의 결론(UTF-8 255바이트로 검사)이 안전한가** | **참** | 255 UTF-8 바이트는 어떤 조합에서도 UTF-16 코드 단위 255 를 넘지 않는다(ASCII 최악의 경우 정확히 255). 표의 근거가 흔들려도(M-3) **결론 자체는 성립한다** |
| 원장 축자 인용 12건 | **전건 일치** | `R40-a` 비고 · `R40-d` · `R40-e` · `R40-f` 비고 · `R55-b` 본문·비고 · `R76-a` 비고 · `R77` · `R77-b` 본문·비고 · `R102` 비고 · `R139` 스키마 — `00.decision-log.md:351,354,355,356,495,216,218,219,45,145` 와 축자 대조해 어미 변조·의미 절단 없음 |
| SRS 인용 | **일치** | `FR-WORKSPACE-004` Rationale(`13.workspace.srs.md:788`) 축자 일치 · `AC-7`(`:800`) 정확 · Implementation Notes 의 *"구현 전에 이 셋을 정하고 근거를 남겨라"*·*"구현 판단으로 남긴다"*(`:815,818`) 정확 · `DR-STORAGE-001` 제목(`14.storage.srs.md:58`) 정확 |
| B-2 의 *"독립 담당자 B 가 `REL-AUDIT-001` 을 자기 wave-1 로 끌어왔다"* | **참** | `wavesplit-b.json` `waves[0].requirement_ids`(31건)에 `REL-AUDIT-001` 존재 |
| `REL-AUDIT-001` 이 wave-9 라는 것 | **참** | `design-baseline/wave-9.md:82` · `reconcile.json:387,948` |

---

## 1. CRITICAL

### C-1. `CON-WORKSPACE-001` 을 「경로 깊이 상한」으로 읽었다 — 요구사항이 그 말을 하지 않으며, 그 오독이 권장값 ③ 을 떠받치고 있다

**대상 문면 두 곳**

- `report.md:216` — `` | `CON-WORKSPACE-001` | high | 4단계 계층 상한. **경로 파싱에서 깊이를 세면 된다** | ``
- `report.md:109` — *"4단계 계층 상한(`R38`·`CON-WORKSPACE-001`)이 **이미 깊이를 묶으므로 255 는 넉넉하다.**"*

**원문 (`docs/spec/13.workspace.srs.md:110-140`)**

- Requirement — *"옵시디언의 볼트에 해당하는 별도 계층을 두지 않는다. 노드 계층은 `루트 → 워크스페이스 → 디렉토리 → 문서` 로 끝나며 **그 사이에 중간 계층을 추가하지 않는다.**"*
- Rationale — 전부 **기각된 3계층(볼트) 안을 닫는 이야기**다. 디렉토리 중첩 깊이는 한 글자도 나오지 않는다.
- AC-1 · AC-2 · AC-3 — 모두 *"어떤 **중간 계층**도 존재하지 않는다"* 형태다.
- **Verification Method = `review`** — 코드로 강제하는 규칙이 아니라 설계 검토 대상이다.

**왜 결함인가**

1. 이 조항은 계층의 **종류**를 넷으로 닫은 것이지 **경로 세그먼트 수**를 넷으로 묶은 것이 아니다. 원장 `R35` 비고가 워크스페이스를 *"옵시디언의 볼트(vault)에 해당하는 개념"* 으로 못박고(`00.decision-log.md:340`), `R40-c` 가 *"문서와 디렉토리는 실제 이름을 그대로 유지한다"* 로 옵시디언 호환을 지킨다(`:353`). **옵시디언 볼트는 폴더를 임의 깊이로 중첩한다.** 「깊이를 세어 5단계를 거부」하는 구현은 `워크스페이스/a/b/c.md` 를 막고, 그것은 이 제품의 존재 이유(`R1`·`R3`)를 정면으로 깬다.
2. 그럼에도 §4 는 이것을 **구현 지시문**("경로 파싱에서 깊이를 세면 된다")으로 적었다. 판정표는 wave-1 구현자가 읽는 자리다.
3. 더 나쁜 것은 §2.2 ③ 이다. **권장값 255 의 유일한 정당화가 "깊이가 이미 묶여 있다"** 인데, 깊이가 묶여 있지 않으면 *"255 는 넉넉하다"* 는 근거를 잃는다. 중첩이 자유로우면 한글 디렉토리 서너 겹만으로 255바이트에 닿는다(한글 1자 = 3바이트).

**공정을 위해 — 모호성은 실재한다.** AC-4 *"노드 경로·ID 체계·권한 모델은 4단계를 넘는 조상 체인을 전제하지 않는다"* 는 깊이 읽기로도 읽힌다. **문제는 어느 쪽이 맞느냐가 아니라, 판정 문서가 이 모호성을 열린 물음으로 세우지 않고 한쪽으로 조용히 닫은 뒤 그 위에 값을 얹었다는 것**이다. 이 자리는 §5 의 「구현 전에 결정해야 하는 것」에 올라갔어야 한다.

---

## 2. HIGH

### H-1. **「예약어 전량」이 전량이 아니다** — Microsoft 가 문서화한 예약어 6개가 빠졌다

`report.md:76-77` — *"**예약어 전량** (Win32 장치 이름 — `등` 을 닫는다): `CON` · `PRN` · `AUX` · `NUL` · `COM1`~`COM9` · `LPT1`~`LPT9`."*

**원문 (Microsoft Learn, *Naming Files, Paths, and Namespaces*, 갱신 2025-04-11)**

> Do not use the following reserved names for the name of a file:
> CON, PRN, AUX, NUL, COM1, COM2, COM3, COM4, COM5, COM6, COM7, COM8, COM9, **COM¹, COM², COM³**, LPT1, LPT2, LPT3, LPT4, LPT5, LPT6, LPT7, LPT8, LPT9, **LPT¹, LPT², and LPT³.**
>
> Note — Windows recognizes the 8-bit ISO/IEC 8859-1 superscript digits ¹, ², and ³ as digits and treats them as valid parts of COM# and LPT# device names, **making them reserved in every directory.** For example, `echo test > COM¹` fails to create a file.

**빠진 것 — `COM¹` `COM²` `COM³` `LPT¹` `LPT²` `LPT³` (6개).**

이것이 왜 중대한가 — 이 문서는 `R40-e` 의 `등` 을 **닫겠다고 선언**하고(§2.2 ①) 그 목록을 wave-1 검증기의 블록리스트로 넘긴다. 목록이 닫히지 않았는데 닫혔다고 적힌 것이 결함이다. 그리고 이 값의 목표가 §2.1 이 세운 *"어느 OS 에서도 열리는 볼트"* 인데, Linux 에서 만든 `COM¹.md` 는 Microsoft 가 *"fails to create a file"* 이라고 명시한 바로 그 이름이다 — 이 목록이 막아야 했던 사례에 정확히 해당한다.

`report.md:5` 의 검증 축 §5(개수·범위 단정)에서 이 저장소가 반복했다고 기록한 유형(`00.handoff.md` §6-g ① — *"개수 단정을 뺐더니 범위 단정(`뿐`)에서 같은 유형이 재발"*)이 한 번 더 나왔다.

### H-2. B-1 의 논증 *"`R77-a` 의 존재 자체가 증명"* 은 **원장 안에 반례가 있다** — 그것도 같은 wave-1 안에

`report.md:129-131` — *"**`R77-a` 의 존재 자체가 증명이다** … **ID 가 파일 어딘가에 적혀 있었다면 이 추측이 필요 없다.**"* 그리고 표제는 *"**원장이 답한다: DB 에만 산다**"*(`:120`).

**반례 — `R40-b` (`00.decision-log.md:352`)**

> 각 워크스페이스 디렉토리 안에 **`.workspace.json`** 을 두어 `{id, name, createdAt}` 을 기록한다

**ID 가 파일에 적혀 있다.** 그리고 `R40-d`(`:354`)는 그 상태에서도 *"권위는 DB 다 … `id` 중복 발견 시 나중 것을 격리하고 재조정 대기열에 기재한다"* 로 **여전히 방어적 재조정을 요구한다.**

즉 원장은 「ID 가 파일에 적혀 있다 **그리고** 정본은 DB 다 **그리고** 그래도 재조정이 필요하다」가 동시에 성립하는 설계를 **이미 한 번 썼다.** 그러므로 *"ID 가 파일에 적혀 있었다면 이 추측이 필요 없다"* 는 전제가 원장 자신에 의해 반증된다. 이 반례는 wave-1 밖이 아니라 **wave-1 안**에 있다 — `DR-WORKSPACE-002` 가 `R40-b`·`R40-d` 를 담고 있고, 이 문서 자신이 `report.md:221` 에서 그것을 *"사이드카·권위 관계는 명확하나"* 라고 적었다.

보조 반례 둘 — ① 서버 밖에서 옮겨진 파일은 사이드카가 유실·복제될 수 있으므로 ID 가 파일에 있어도 상관 판정은 여전히 필요하다. ② 첨부 같은 바이너리에는 본문 삽입 자체가 불가능하다.

**무엇이 남는가** — B-1 의 *결론*(노드 ID 의 **권위**는 DB 이고 경로는 파생 캐시다)은 `R76` 문면으로 그대로 선다. 무너지는 것은 **"DB 에**만**산다"는 범위 단정과 그 「증명」**이다. `report.md:219` 이 `DR-STORAGE-003` 을 *"**B-1 로 해소**"* 로 닫았으므로, 근거가 불완전한 채 해소로 표시된 상태다.

### H-3. B-3 이 *"판정할 것이 없다"* 고 닫았으나, `SEC-STORAGE-006` 은 **wave-9 요구사항에 명시적으로 의존한다** — B-2 와 같은 결함인데 잡히지 않았다

`report.md:174` — *"**따라서 이 자리에 판정할 것이 없다.**"* 그리고 `:231` 에서 `SEC-STORAGE-006` 을 `high`·*"B-3 로 해소"* 로 닫는다.

**원문 (`docs/spec/14.storage.srs.md:1303-1345`)**

- Trace Links — `` | Requirement | REL-STORAGE-001 | depends_on | - | ``
- AC-3 — *"서버가 돌아가는 동안 docsRoot 에 직접 넣은 파일은 **재조정으로 등록되기 전까지** 서빙되지 않는다."*

**`REL-STORAGE-001`(= 원장 `R77`, 기동 시·주기 재조정)은 wave-9 다** — `design-baseline/wave-9.md:84` (`` | `REL-STORAGE-001` | `R77` · `R77-b` | ``) · `reconcile.json:387,948`. wave-1 의 22건에 없다(`design-baseline/wave-1.md:47-68`).

따라서 wave-1 은 **거부만 있고 그것을 푸는 장치가 없는 상태**로 출하된다. B-3 이 *"원장은 이 창(window)을 이미 계산했다"* 며 인용한 `R77`·`R77-b` 는 **둘 다 wave-9 조항**이다 — 창을 닫는 쪽이 8개 wave 뒤에 있다는 사실이 논증에서 빠졌다.

이것은 B-2 가 `DR-WORKSPACE-002` 에서 정확히 잡아낸 것과 **같은 종류의 이음매**다(명령은 wave-1, 받을 그릇은 wave-9). 같은 검사를 `SEC-STORAGE-006` 에 적용하지 않은 것이 결함이다. 게다가 이쪽은 SRS 가 `depends_on` 으로 **기계 판독 가능하게 선언**해 둔 자리라 놓치기 더 어려웠어야 한다.

### H-4. B-2 의 권장 *"참조 감사 행은 nullable 이어야 한다"* 는 **`R139` 를 정면으로 위반**한다

`report.md:154-155` — *"`R139` 가 정한 대기열의 형태는 `reconciliation_finding(유형, 참조 감사 행 1..N, 해소 감사 행)` 이고, **참조 감사 행은 nullable 이어야 한다** — wave-1 에는 감사 로그가 없다."*

**원문 (`00.decision-log.md:145`, `R139`)**

> **일어난 일의 기록은 `audit_log` 에만 두고, 대기열은 유형과 감사 행 참조만 갖는다** — **시각 · 대상 노드 · 행위자 · 해소 시각 · 해소자를 자기 칸으로 갖지 않고 전부 참조 감사 행에서 읽는다.**

참조 감사 행이 비면 그 항목은 **시각도 대상 노드도 행위자도 없다.** `R139` 설계에서 그 다섯 값의 **유일한 출처**가 참조 감사 행이기 때문이다. nullable 로 두는 순간 남는 것은 `유형` 하나뿐인 껍데기 행이고, 격리된 워크스페이스가 무엇인지조차 적히지 않는다 — `R40-d` 가 기재를 요구한 목적 자체가 사라진다.

`R139-a`(`:146`)가 못을 하나 더 박는다 — *"R77 이 만든 신규 노드는 `audit_log` 에 `생성` 1행, **대기열에 그 행을 가리키는 항목 1건**이다. 사실은 두 번 적히지 않는다."* 그리고 *"대기열 행은 경로·시각·행위자를 **자기 칸으로 갖지 않고 감사 행 ID 만 참조**하므로 `R124` 위반이 아니다"* — 즉 **참조가 있다는 것이 `R124` 무위반의 조건**이다. 참조를 비우면 그 면제가 사라지고, 값을 채우려면 대기열에 칸을 뚫어야 하며, 그 순간 `R124` 위반이 된다.

문서는 이 권장을 §5 의 우선순위 **2번**("스키마 결정이다. 나중에 바꾸면 마이그레이션이 붙는다")으로 올렸다. 원장과의 충돌을 표시하지 않은 채 스키마 결정으로 제시한 것이 결함이다. 작성자는 §6-5 에서 *"`R139` 를 원문 전량으로 읽지 않았다"* 고 신고했는데, **읽지 않은 그 문장이 정확히 이 권장을 무효화하는 문장**이다.

---

## 3. MEDIUM

### M-1. B-1 이 `R20` 을 **원문보다 넓게** 인용했다

`report.md:127` — *"그 다른 곳이 `R20`(**메타데이터는** SQLite 단일 저장소)이다."*

**원문 (`00.decision-log.md:213`)** — *"**사용자·그룹·ACL** 메타데이터는 **SQLite 단일 저장소**에 둔다"*. SRS 제목도 같다 — `14.storage.srs.md:113` *"사용자·그룹·ACL 메타데이터는 SQLite 단일 저장소에 둔다"*.

`R20` 은 **셋을 열거**한 조항이고 「노드 ID」는 그 열거에 없다. *"메타데이터는"* 으로 일반화하면 열거가 사라져 조항이 하지 않은 말을 하게 된다. 노드 ID 의 소재를 정하는 조항으로 `R20` 을 세우려면 그 확장 자체가 논증돼야 하는데, 문서는 괄호 안 축약으로 처리했다. H-2 와 같은 뿌리다.

### M-2. B-4 의 *"이 조항의 **존재 이유가 바로 그 OS 의존성**이다"* 는 `R40-f` 비고를 뒤집어 읽은 것이다

**원문 (`00.decision-log.md:356`, `R40-f` 비고 전문)**

> Windows 파일시스템에서 같은 파일인데 경로 기반 판정이 갈리는 문제는 접미사**로도** 해소된다. **거부로 두면 "보이는 동명은 거부 / 안 보이는 동명은 접미사" 라는 흐름 차이가 생겨 R102 가 없앤 존재 오라클이 되살아난다**(R113 위반)

`report.md:181-182` 는 앞 문장만 인용부호 안에 넣고 뒤 문장을 버렸다. 그런데 **굵게 강조된 쪽은 뒤 문장**이고, 앞 문장의 조사는 *"접미사로**도**"* — 부수 효과를 가리키는 표지다. 이 조항의 존재 이유는 **존재 오라클 차단(`R102`·`R113`)** 이고 OS 의존성 해소는 덤이다. 문서는 덤을 존재 이유로 승격시켰다.

결론(응용 계층 케이스 폴딩)은 바뀌지 않는다. 다만 근거의 무게중심이 원문과 반대이고, 이 문서는 §3 전체가 *"원장이 이미 답했다"* 를 논증하는 자리라 조항의 취지를 어느 쪽으로 읽었는지가 곧 판정의 질이다.

### M-3. APFS 행이 부정확하다 — 255 는 APFS 의 한계가 아니다

`report.md:89` — `` | APFS | 255 | UTF-8 바이트 | ``

APFS 온디스크 구조에서 이름 길이 필드는 **10비트**이며, 이는 이름을 **1023바이트(널 포함) 수준**까지 허용한다. 255 는 **macOS 가 거는 제한**이지 APFS 자체의 한계가 아니고, 출처에 따라 *"255 UTF-8 **characters**"* 로 기술되기도 해 **단위조차 확정적이지 않다.**

문서는 이 표를 근거로 *"**단위가 갈린다**"* 는 판단을 내리고 권장값을 도출한다. 세 행 중 한 행의 값과 단위가 모두 불확실한 상태에서 표가 확정 사실처럼 제시됐다.

**다만 결론은 살아남는다** — 실질 제약은 ext4 의 255**바이트**이고, 255 UTF-8 바이트는 NTFS·APFS 어느 쪽도 넘지 않는다(§0 참조). 값 `255`·단위 `바이트` 라는 §2.2 ② 의 결론은 그대로 유효하다. 고칠 것은 표의 APFS 행이지 권장값이 아니다.

### M-4. §1 은 열린 것이 **둘**이라 하고 §4·§5 는 **셋**이라 한다

- `report.md:28` — *"**실제로 열려 있는 것은 둘이다.**"* (표에 `FR-WORKSPACE-004`·`DR-WORKSPACE-002` 둘)
- `report.md:233` — *"medium **셋**"*, `report.md:239-245` — 「구현 전에 결정해야 하는 것」 **3행**

`OPS-STORAGE-001` 이 §1 에서만 사라진다. 요약이 본문보다 작게 말하는 형태이며, 요약만 읽는 독자는 착수 전 결정 항목 하나를 통째로 놓친다.

### M-5. §6-5 의 `R139` 계열 열거가 불완전하다 — `R139-g` 가 있다

`report.md:266` — *"`R139` 계열(**`R139-a`~`R139-f`**)을 **전수로** 읽어야 한다."*

실제 계열은 **`R139-a` ~ `R139-g`** 다 — `00.decision-log.md:152` 에 `R139-g` 가 있다(*"한정어 없는 `감사 목록` 을 지시어로 쓰지 않는다 … `재조정 대기열`(R77 계열·R40-d — 이 조항이 새로 준 이름)"*).

「전수로 읽으라」는 지시문 자체가 한 건을 빠뜨렸으므로, 지시를 그대로 따르는 다음 세션도 같은 건을 빠뜨린다. 하필 `R139-g` 는 B-2 가 다루는 **대기열의 이름과 지시 대상을 확정하는 조항**이다.

---

## 4. LOW

| # | 소견 | 증거 |
|---|---|---|
| **L-1** | *"`CON.md` 도 `con.txt` 도 장치 이름으로 해석된다"*(`:81`)에 **Windows 11 단서**가 빠졌다. Win32 문서는 여전히 *"NUL.txt and NUL.tar.gz are both equivalent to NUL"* 이라 하지만, .NET 문서는 *"Prior to Windows 11, a path that begins with a legacy device name is always interpreted as a legacy device … **Because this no longer applies with Windows 11**"* 라고 적어 두 문서가 갈린다. **거부한다는 결론은 안전한 쪽이라 유지**되나, 근거를 단정으로 적을 자리는 아니다 | MS Learn *Naming a file* / *File path formats on Windows systems* §Handle legacy devices |
| **L-2** | `COM0`·`LPT0` 은 **현행 Microsoft 예약어 목록에 없다**(내가 대조한 2025-04-11 판). 다만 일부 문서 판본이 이를 포함했고 Go 는 `filepath` 에서 예약 취급을 검토했으며(golang/go#67245) 실측으로는 생성이 **되는** 것으로 보고됐다. **결함은 아니나 다툼이 있는 자리**이므로 값을 확정할 때 근거 판본을 명시해야 한다 | MS Learn 원문 · golang/go#67245 |
| **L-3** | `MAX_PATH` 260 을 **불변 상수처럼** 적었다(`:101`). Windows 10 1607+ 는 레지스트리 `LongPathsEnabled` + 매니페스트 `longPathAware` 로 해제된다. **§2.2 ③ 의 상대 경로 상한 권장은 오히려 이 사실로 더 강해진다**(*"you cannot use the `\\?\` prefix with a relative path, relative paths are always limited to a total of MAX_PATH characters"*) — 빠진 것은 근거이지 결론이 아니다 | MS Learn *Maximum Path Length Limitation* |
| **L-4** | `R76` 인용에서 `(R50-a)` 를 **생략 표시 없이** 뺐다(`:125` vs `00.decision-log.md:215`). 의미는 바뀌지 않으나, 나머지 인용은 `…` 를 제대로 쓰고 있어 일관되지 않다 | — |
| **L-5** | `00.handoff.md` §6-f 인용(`:25-26`)이 인용부호 안에서 어형이 바뀌었다. 원문은 *"공백을 등재하기 전에 **「정말 없는가」를** 원장 전수로 확인한다"*(`docs/next/00.handoff.md:280`), 문서는 *"정말 없는지"*. **§6-f 자체는 실재하고 뜻도 같다** | `docs/next/00.handoff.md:264,280` |
| **L-6** | §2.2 ① 이 *"판정은 확장자를 뗀 basename 에 대해"* 를 **새 권장**처럼 제시하나, `FR-WORKSPACE-004` Implementation Notes 가 이미 *"예약어 판정은 확장자를 뗀 basename 에 대해 수행해야"* 라고 적어 두었다. 또 B-4 구현부의 *"응용이 두 번째 이름을 **거부하고 접미사를 붙인다**"*(`:193`)는 「거부 후 제안」(= `R102` 가 폐기한 `R44-a`)으로 오독될 수 있다. `R102` 는 *"확인 단계를 두지 않는다"* 다 | `13.workspace.srs.md:818` · `00.decision-log.md:45` |

---

## 5. 축별 종합

| 축 | 판정 |
|---|---|
| **축 1 — 외부 사실 (§2.2)** | 4개 물음 중 **3개는 참**(금지 문자 · 말단 공백/마침표 · `MAX_PATH` 계수). **예약어는 거짓**(H-1, 6개 누락). 파일시스템 표는 NTFS·ext4 참, **APFS 부정확**(M-3). 한글 85자 산술 참. 전부 Microsoft Learn 원문과 대조했다 |
| **축 2 — 원장 인용 (B-1~B-4)** | **축자 인용은 전건 정확하고 오귀속 0건.** 무너지는 것은 **인용에서 결론으로 가는 논증** 넷 중 셋이다 — B-1 의 「증명」에 원장 내부 반례(H-2), B-2 의 권장이 `R139` 위반(H-4), B-3 의 「판정할 것 없음」이 선언된 `depends_on` 을 놓침(H-3). B-4 는 결론은 서나 조항 취지를 뒤집어 읽었다(M-2) |
| **축 3 — 22행 계수** | **결함 없음.** ID 22건 완전 일치, 분포 19/3/0/0 직접 계수로 확인 |
| **축 4 — 실재하지 않는 인용** | **결함 없음. 지어낸 참조 0건.** 조항 ID 전건(`R1`·`R3`·`R4`·`R19`·`R20`·`R33-a`·`R35`·`R38`·`R40`계열·`R55-b`·`R56`·`R64`계열·`R76`계열·`R77`계열·`R87`·`R92`·`R102`·`R139`), 요구사항 ID 전건, `REL-AUDIT-001`(wave-9), `C-23`(`constraints-2.json:119`), `00.handoff.md` §6-f, `packages/editor`(Vite 8 + React 19 + TS 7), `00.index.md` 11 scope — 모두 실재 |
| **축 5 — 개수·범위 단정** | **「전량」 2건이 거짓**(H-1 예약어 · M-5 `R139` 계열). 「DB 에**만**」 1건이 과잉(H-2). 「이 자리에 판정할 것이 **없다**」 1건이 거짓(H-3). 「열려 있는 것은 **둘**」이 본문과 어긋남(M-4). **이 축이 이 문서의 최대 취약점이며, `00.handoff.md` §6-g ① 이 기록한 재발 유형과 정확히 같다** |

---

## 6. 작성자 자기신고(§6)와의 대조

| 자기신고 | 검증 |
|---|---|
| 1. vendor 테스트 미실행 | 확인하지 않음 (범위 밖) |
| 2. `docsRoot` 실제 경로 모름 | 참. 다만 **더 큰 미지는 계층 깊이**였다 → C-1 |
| 3. 비-ASCII 케이스 폴딩 미정 | 참. 적절히 신고됨 |
| 4. `OPS-STORAGE-001` 검증 방법 미정 | 참. 다만 §1 에서 누락 → M-4 |
| 5. `R139` 전량 미독 | 참. **그 미독이 H-4 를 직접 유발**했다 — 읽지 않은 문장이 자기 권장을 무효화한다 |
| 6. 22건 AC 미정독 | 참. **그 미정독이 H-3 을 직접 유발**했다 — `SEC-STORAGE-006` 의 `depends_on` 과 AC-3 이 그 자리에 있었다 |
| 7. §2.2 외부 사실 미대조 | 참이고 **적중**했다 → H-1 · M-3 |

**신고하지 않은 결함 넷**이 더 무겁다 — C-1(계층 깊이 오독) · H-2(B-1 반례) · M-1(`R20` 확장) · M-2(`R40-f` 취지 전도). 셋은 §3 「원장이 이미 답한다」 판정 안에 있다. **자기신고가 성실했던 만큼, 남은 위험은 작성자가 "확인했다"고 믿은 자리에 몰려 있다.**

---

## 7. 내가 확인하지 못한 것

1. **APFS 한계를 Apple 1차 문서로 대조하지 못했다.** *Apple File System Reference* 원문에 접근하지 못했고, 상세 분석 글(eclecticlight.co)은 **HTTP 403** 으로 차단됐다. M-3 은 검색 결과 요약에 기댔으며 **10비트 필드·1023바이트 수치를 Apple 1차 문서로 확인하지 못했다.** M-3 을 「APFS 행이 확정 사실이 아니다」 이상으로 강하게 읽지 말 것.
2. **NTFS 255 의 단위를 Microsoft 문서가 「UTF-16 코드 단위」라고 명시한 문장을 찾지 못했다.** 문서는 *"255 characters"* 와 *"opaque sequence of WCHAR s"* 를 따로 말하고, 나는 그 둘을 **결합해** 판정했다. 결합 자체는 W-API 정의상 타당하나 축자 근거는 아니다. **서로게이트 쌍(BMP 밖 문자·일부 이모지)에서 「1 문자 = 2 코드 단위」로 갈리는 경계는 실측하지 않았다.**
3. **Windows 에서 실제로 실행해 보지 않았다.** `COM¹` 생성 실패 · `CON.md` 거동 · 말단 공백 절삭 · Windows 11 legacy device 변경 — 전부 **문서 대조이지 실측이 아니다.** L-1·L-2 의 다툼은 실측 없이는 닫히지 않는다.
4. **`CON-WORKSPACE-001` AC-4 의 원의도를 확정하지 못했다.** C-1 은 「문서가 모호성을 닫아 버렸다」는 판정이지 「반대 해석이 옳다」는 판정이 **아니다.** 어느 쪽이 맞는지는 이 조항을 쓴 사람만 답할 수 있다.
5. **22건의 AC 를 전량 정독하지 않았다.** `SEC-STORAGE-006`·`DR-STORAGE-003`·`CON-WORKSPACE-001`·`FR-WORKSPACE-004` 넷만 블록 전문을 읽었다. **나머지 18건의 AC 와 Trace Links 에 H-3 과 같은 미선언 wave 간 의존이 더 있을 수 있고, 나는 그것을 훑지 않았다.**
6. **§4 의 「근거」 열이 각 요구사항에 대해 타당한지 18건은 판정하지 않았다.** ID 존재와 분포 계수만 확인했다. `high` 판정 자체의 타당성은 축 3 의 범위 밖이었다.
7. **`OPS-STORAGE-001`·`CON-ARCH-009` 등의 stability 권고**가 적절한지 평가하지 않았다 — feasibility 판정의 본래 산출물이나 위임받은 5개 축에 없었다.
8. **`report.md:254-256` 의 vendor 테스트·`it.each(` 자기신고**를 검증하지 않았다. `packages/editor` 테스트를 실행하지 않았다.

---

**출처 (외부 사실)**

- [Naming Files, Paths, and Namespaces — Win32 apps, Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file)
- [Maximum Path Length Limitation — Win32 apps, Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/fileio/maximum-file-path-limitation)
- [File path formats on Windows systems — .NET, Microsoft Learn](https://learn.microsoft.com/en-us/dotnet/standard/io/file-path-formats)
- [path/filepath: COM0 and LPT0 are now reserved on Windows — golang/go#67245](https://github.com/golang/go/issues/67245)
- [Ext4 — Wikipedia](https://en.wikipedia.org/wiki/Ext4) · [Apple File System — Wikipedia](https://en.wikipedia.org/wiki/Apple_File_System)
