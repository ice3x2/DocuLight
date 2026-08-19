# 1.0 A-RAG 검색 실측 조사

조사 대상: `C:\Work\git\DocuLight\DocLight` (읽기 전용, 브랜치 `feature/cm6-editor-server-foundation`, HEAD `3180a50`)
조사 일자: 2026-08-19
목적: 2.0 이 1.0 의 A-RAG 검색을 **이식**할지 **신규 작성**할지 판단할 사실을 모은다. 결론이 아니라 근거를 만든다.

> **용어 정리 — "A-RAG" 가 가리키는 것이 둘이다.**
> 1.0 코드에는 이름이 "A-RAG" 인 모듈이 없다. 그 이름에 대응할 후보가 둘 있고, 둘은 서로 다른 물건이다.
> - **(가) MCP 도구 표면 — 외부 에이전트가 주도하는 agentic retrieval.** `POST /mcp` 가 12개 도구를 노출하고, Claude Code 같은 외부 에이전트가 `resolve_project → summarize_document → query_document → smart_search` 를 스스로 조합한다. 검색 지능은 도구 안에 있고, 루프는 외부 에이전트가 돈다.
> - **(나) 내장 LangGraph ReAct 루프.** `ui.indexFile === "CHATBOT"` 일 때만 뜨는 사내 챗봇이 `analyze → tool_call → observe → self_check → (reflexion|double_check) → finalize` 를 돌며 같은 MCP 도구를 호출한다. 루프가 서버 안에 있다.
>
> 아래 §A 는 둘을 나눠 적었다. §D 의 「기능 명세」는 (가)·(나) 가 공유하는 도구 정의다.

---

## A 파이프라인

### A-0. 두 개의 MCP 표면

| 표면 | 마운트 | 인증 | 도구 수 | 파일 |
| --- | --- | --- | --- | --- |
| 메인 MCP | `POST /mcp` (JSON-RPC 2.0, SDK 미사용 직접 구현) | `requireReadLogin` 이 켜져 있을 때만 read 도구에 API 키 요구. write 도구(`create_document`·`delete_document`)는 항상 요구 | 12 | `src/routes/mcp.js` (856줄) |
| Context MCP | `POST /context` | **없음.** 파일 주석에 `인증 불필요 (읽기 전용)` 로 명시 | 3 | `src/routes/context-mcp.js` (319줄) |

메인 MCP 는 프로토콜 버전 `2025-11-25` 만 지원하고 SSE(`GET /mcp`)를 405 로 거부한다. Origin·Host allowlist 검사(`config.mcp.allowedOrigins`·`allowedHosts`)가 있다.

### A-1. (가) MCP `smart_search` 파이프라인 — 질의 입력에서 결과 출력까지

`src/services/agent-tools/handlers/smart-search.js` → `src/services/mcp/smart-search-service.js`

1. **호출 진입.** `tools/call` 로 `{prefix}_smart_search` 도착. `resolveHandlerKey()` 가 prefix(`config.ui.title` 를 sanitize한 값, 기본 `DocuLight`)를 벗겨 핸들러 `smart_search` 로 매핑.
2. **인증 검사.** `requiresReadAuth('smart_search')` = true. `authSettingsStore.get().requireReadLogin` 이 켜져 있으면 `X-API-Key` 또는 `Authorization: Bearer` 를 SHA-256 해시로 `userStore.findByUserKeyHash()` 조회. **인증 결과는 여기서 버려진다 — 이후 검색 로직에 사용자 정보가 전달되지 않는다.**
3. **서비스 인스턴스 생성.** 호출마다 `new SmartSearchService(config, logger)` (상태 없음). `initialize(req.app.locals)` 로 `appLocals.vectorStoreManager` 를 받으려 시도.
4. **입력 검증.** 빈 질의면 `INVALID_QUERY` throw.
5. **모드 결정.** `mode='auto'` 면 `getAvailableMode()` — `config.chatbot.embedding.type` 이 있고 **동시에** `vectorStoreManager` 가 있으면 `semantic`, 아니면 `keyword`.
6. **분기 A — semantic:** `vectorStoreManager.similaritySearch(query, limit)` 호출. LangChain `Document[]` 를 `{path: metadata.filePath || metadata.source, content: pageContent, score: doc.score ?? (1 - index*0.1), source:'semantic'}` 로 정규화.
   **분기 B — keyword:** `searchDocuments()` (§A-3) 로 파일 스캔 → 매치된 각 파일을 `fs.readFile` 로 통째로 읽고 `score = min(1, matches.length/5)`.
7. **실패 폴백.** semantic 이 throw 하면, 그리고 요청 모드가 `auto` 였을 때만, `keyword` 로 재시도한다. 명시적 `mode:'semantic'` 이었으면 그대로 throw.
8. **결과 처리 `processResults()`.** score 내림차순 정렬 → 문서마다 토큰 배당 `min(ceil(maxTokens / N * (0.5 + score*0.5)), 남은토큰)` → `SectionExtractor.extractRelevantSections(content, query, docMaxTokens)` 로 섹션 추출 → 남은 예산 차감.
9. **섹션 추출 `SectionExtractor`** (`src/services/mcp/section-extractor.js`, 315줄):
   - `^(#{1,6})\s+(.+)$` 정규식으로 헤딩 경계를 잡아 문서를 섹션 배열로 자른다. 첫 헤딩 앞 서문은 `level:0` 섹션.
   - 문서 전체가 예산 안이면 통째로 반환.
   - 아니면 섹션별 관련성 점수 = `(질의어 단어경계 매치 수 / 섹션 총 단어 수)` + 헤딩 매치 보너스 `2.0/질의어수` + 코드블록 매치 보너스 `1.5/(질의어수 × 코드블록수)`.
   - 점수순으로 예산이 찰 때까지 담고, **원본 순서로 재정렬**해서 반환. 첫 섹션조차 예산 초과면 잘라서(`truncated:true`) 하나만 반환.
10. **토큰 추정.** `estimateTokens()` = `ceil(UTF-8 바이트 수 / 3)`. tiktoken 등 실제 토크나이저를 쓰지 않는다 (`src/services/chatbot/token-estimator.js` 주석이 명시).
11. **출력.** `formatAsMarkdown()` 이 `# Search Results for "q"` / `**Mode**` / `**Documents**` / 문서별 `## N. path (score: 0.00)` + 섹션 본문 / `**Tokens used**: X / Y` 형태의 **마크다운 문자열 한 덩어리**를 만들고, `{content: [{type:'text', text}]}` 로 감싸 반환한다. 구조화된 JSON 결과는 MCP 로 나가지 않는다.

### A-2. (나) 내장 LangGraph ReAct 루프

`src/services/chatbot/workflow/agentic-graph.js` (668줄). 파일 헤더가 스스로를 "ReAct + Reflexion 하이브리드" 로 부른다 (Reflexion = Shinn 2023).

```
START → analyze → [classify] → tool_call → observe → self_check
                                   ↑                     ├─ done → [double_check] → finalize → END
                                   ├─────────────────────┤ iter ≥ threshold → reflexion → tool_call
                                   └─────────────────────┘ iter < threshold → tool_call
```

- **도구 주입:** `buildAgenticTools()` (`agentic-tools.js`, 91줄) 이 `routes/mcp.js` 의 `buildTools()` 를 SSOT 로 재사용해 MCP 도구 정의를 LangChain 형식으로 변환한다. `create_document`·`delete_document` 는 `EXCLUDED_TOOLS` 로 제외 → **10개 도구**가 챗봇에 노출된다. 핸들러는 HTTP 라우터를 우회해 직접 호출하며, `req.app.locals` 를 참조하는 핸들러를 위해 `{app:{locals: runtimeContext}}` 형태의 fake req 를 만들어 넘긴다.
- **예산 통제** (`src/services/agent-tools/budget.js`, 245줄): `max_iterations=8` (env `CHATBOT_AGENTIC_MAX_ITERATIONS`), `max_tool_calls=12`, `wall_clock=45s`, `input_tokens=60k`, `output_tokens=4k`, 그리고 **dedup** — `SHA-1(도구명 + 정규화된 인자)` 로 동일 호출 2회까지 허용하고 3회째 차단. 경로 인자는 정규화 후 `..` traversal 을 차단.
- **부수 방어:** `injection-guard.js` (246줄) · `security.js` (168줄) · `messages-trim.js` (108줄, tool_use/tool_result 페어링 무결성) · `citations-adapter.js` (167줄) · `token-guard.js` (37줄).
- **경계 조건:** `reflexion` 은 기본 비활성. `self_check` 가 no-progress 를 감지하면 `self_check_score=0.4` 로 낮춰 `double_check` 를 유도.
- **레거시 그래프는 죽어 있다.** 고전적 corrective-RAG 그래프 `workflow/graph.js` (801줄) 는 **어디서도 require 되지 않는다**. `chatbot-service.js:16` 이 `createAgenticGraph` 만 가져간다. 그 그래프가 쓰던 노드들(`retrieve`·`grade`·`rewrite`·`evaluate`·`generate`·`map-summarize`·`deep-read`·`analyze-request`·`contextualize`·`summarize`, 합계 2,620줄)은 `workflow/index.js` 를 통해 **로드만 되고 실행되지 않는다**. agentic-graph 가 실제로 쓰는 노드는 `classify`(245줄)·`double-check`(83줄) 둘뿐이다.

### A-3. 키워드 검색 `searchDocuments()`

`src/services/search-service.js` (432줄). REST(`/api/search`)와 MCP 가 공유.

`ignore` 패키지로 `config.excludes` 필터 → `docsRoot` 아래를 재귀 순회 → `.md` 만, 1MB 초과 파일은 스킵, 점(`.`)으로 시작하는 항목 스킵 → 질의어가 2개 이상이면 **파일 단위 AND 필터**(모든 단어가 파일 어딘가에 있어야 함) → 라인 단위 OR 매치 → 우선순위 `filename(0) > title(1) > content(2)`, 동순위는 매치 수 내림차순 → 5초 하드 타임아웃. 인덱스가 없다. 매 호출마다 전체 트리를 다시 읽는다.

출력 모드 3종: `titles_only` / `snippets`(기본) / `full_context`.

### A-4. 의존성 (실측 — `node_modules/<pkg>/package.json` 의 `version`)

| 패키지 | package.json 선언 | 실제 설치 | 역할 |
| --- | --- | --- | --- |
| `langchain` | `^1.2.6` | **1.2.15** | 메타 패키지 |
| `@langchain/core` | `^1.1.11` | **1.1.17** | Document·Message 타입 |
| `@langchain/community` | `^1.1.9` | **1.1.9** | `HNSWLib` 벡터스토어 |
| `@langchain/openai` | `^1.2.1` | **1.2.3** | `OpenAIEmbeddings`·`AzureOpenAIEmbeddings` |
| `@langchain/ollama` | `^1.1.0` | **1.2.1** | `OllamaEmbeddings` |
| `@langchain/textsplitters` | `^1.0.1` | **1.0.1** | `RecursiveCharacterTextSplitter` |
| `@langchain/langgraph` | `^1.0.7` | **1.1.2** | `StateGraph`·`MemorySaver` |
| `hnswlib-node` | `^3.0.0` | **3.0.0** | 네이티브 HNSW 인덱스 (**node-gyp 빌드 필요**) |
| `async-lock` | `^1.4.1` | **1.4.1** | 벡터스토어 동시성 락 |
| `better-sqlite3` | `^12.9.0` (optional) | **12.9.0** | 1.0 에서는 캐시용. RAG 와 무관 |
| `chokidar` | `^3.5.3` (optional) | **3.6.0** | 문서 변경 감시 |
| `zod` | `^3.25.76` | — | 노드 스키마 |

임베딩 제공자는 `openai` / `azure-openai` / `ollama` 3종 (`embedding-factory.js`, 147줄). 벡터 저장소는 2종 — 인메모리 코사인 브루트포스(`SimpleMemoryVectorStore`) 또는 HNSWLib 영속.

**외부 API:** 임베딩 엔드포인트와 LLM 엔드포인트. 실제 운용 설정(`config.json5`)은 사내 vLLM 을 가리킨다 — 임베딩 `nlpai-lab/KURE-v1` @ `http://10.0.0.50:8002/v1/`, LLM `Qwen/Qwen3.6-35B-A3B-FP8` @ `http://10.0.0.50:8000/v1/`.

### A-5. 색인 생성·갱신

`src/services/chatbot/vector-store.js` (468줄) + `vector-storage.js` (715줄) + `doc-watcher.js` (171줄).

- **최초 구축:** `ChatbotService.initialize()` → `loadExistingDocuments(docsRoot)` 가 트리를 재귀 순회하며 모든 `.md` 를 `addDocument(상대경로, 내용, {source: 절대경로, filename})` 로 넣는다. **동기(await) 이고 전량이다** — 문서 N개면 서버 기동이 N번의 임베딩 API 왕복을 기다린다. 배치 API(`addDocumentsBatch`, batchSize 50)가 있지만 이 경로는 그것을 쓰지 않는다.
- **증분 갱신:** `chokidar` 가 `**/*.md` 를 감시(Windows 는 `usePolling:true`, interval 300ms) → 1초 디바운스 → `add`/`change` 는 `addDocument`, `unlink` 는 즉시 `removeDocument`.
- **변경 판정:** 영속 모드는 `size → mtimeMs → SHA-256 해시` 3단 체크(`isDocumentChanged`). 인메모리 모드는 SHA-256 앞 32자 비교.
- **청킹:** `RecursiveCharacterTextSplitter`, `chunkSize: 1000` / `chunkOverlap: 200`, separators `["\n## ", "\n### ", "\n#### ", "\n\n", "\n", " ", ""]`. **frontmatter 를 제거하지 않는다** — `chatbot-service.loadExistingDocuments` 가 `fs.readFile` 한 원문을 그대로 넘긴다. frontmatter 파서(`doc-loader.js`, 137줄)는 존재하지만 이 경로에서 쓰이지 않는다(`chatbot/index.js` 가 export 만 하고, 소비자는 옛 테스트 하나뿐).
- **삭제 처리 — 여기가 구조의 핵심 제약이다.** HNSWLib 이 개별 벡터 삭제를 지원하지 않는다. 그래서:
  - 삭제·수정은 **소프트 삭제**다. 메타데이터에서 문서를 지우고 `deletedChunks` 카운터만 올린다. 벡터는 인덱스에 남는다.
  - 검색 시 `FilteredRetriever` (270줄)가 `k × overSampleFactor` 만큼 과다 검색한 뒤, `metadata.documents[경로]` 조회 + `version` 일치 검사로 죽은 청크를 걸러낸다. `overSampleFactor = 1 + 삭제비율 + 0.2`, 최대 3배.
  - 삭제 비율이 `compactThreshold`(0.3)를 넘으면 `compact()` 가 **인덱스를 지우고 전량 재구축**한다. 재구축은 모든 문서를 다시 임베딩한다.
  - `_generatePathCandidates()` 가 `source` 메타데이터의 절대/상대·슬래시/역슬래시 변형을 최대 8가지 만들어 대조한다. `addDocument` 가 `{source: docPath, ...additionalMeta}` 순서로 스프레드해 `source` 가 **절대경로로 덮어씌워지는** 것을 사후에 수습하는 코드다.
- **임베딩 모델 변경 감지:** 메타데이터의 `embedding.{type,model,deploymentName}` 과 현재 설정을 비교해 다르면 인덱스를 통째로 지우고 재구축.
- **일관성 검증:** 기동 시 HNSWLib docstore 크기와 메타데이터 `totalChunks` 를 비교, 10% 이상 어긋나면 재구축.
- **메타데이터 저장:** `metadata.json` 에 임시 파일 + `rename` 원자적 쓰기, `.bak` 백업, 파싱 실패 시 백업 복구.

### A-6. 규모 (실측 `wc -l`)

**A-RAG 코어 (검색·색인·추출):**

| 파일 | 총 | 공백 | 주석 | 코드 |
| --- | ---: | ---: | ---: | ---: |
| `services/chatbot/vector-storage.js` | 715 | 93 | 169 | 453 |
| `services/chatbot/vector-store.js` | 468 | 61 | 122 | 285 |
| `services/search-service.js` | 432 | 55 | 79 | 298 |
| `services/mcp/smart-search-service.js` | 389 | 47 | 94 | 248 |
| `services/mcp/summarize-document-service.js` | 389 | 48 | 125 | 216 |
| `services/mcp/project-resolver-service.js` | 355 | 51 | 58 | 246 |
| `services/mcp/section-extractor.js` | 315 | 44 | 77 | 194 |
| `services/mcp/code-block-extractor.js` | 295 | 45 | 43 | 207 |
| `services/chatbot/filtered-retriever.js` | 270 | 45 | 77 | 148 |
| `services/mcp/query-document-service.js` | 264 | 35 | 57 | 172 |
| `services/chatbot/doc-watcher.js` | 171 | 20 | 52 | 99 |
| `services/chatbot/embedding-factory.js` | 147 | 18 | 35 | 94 |
| `services/chatbot/doc-loader.js` (사실상 미사용) | 137 | 22 | 35 | 80 |
| `services/chatbot/token-estimator.js` | 135 | 20 | 46 | 69 |
| **소계** | **4,482** | **604** | **1,069** | **2,809** |

**주변 배선 (MCP 라우팅·핸들러·에이전트 루프):** `routes/mcp.js` 856 + `routes/context-mcp.js` 319 + `agent-tools/handlers/*` 348 (12개 파일) + `agent-tools/*.js` 1,406 + `chatbot/agentic-tools.js` 91 + `workflow/agentic-graph.js` 668 + `workflow/state.js` 383 + `workflow/prompts.js` 669 + `workflow/nodes/{classify,double-check}.js` 328 + `chatbot/chatbot-service.js` 588 = **5,656줄**.

**죽은/미사용 레거시:** `workflow/graph.js` 801 + 미사용 노드 10개 2,620 + `workflow/index.js` 91 = **3,512줄** (require 되어 로드되지만 실행 경로 없음).

**A-RAG 고유 로직 대 배선 비율.** 코어 4,482줄 중 순수 코드는 2,809줄(62.7%)이고 주석·공백이 1,673줄(37.3%)이다. 그 2,809줄 안에서 "A-RAG 고유 알고리즘"(섹션 스코어링·청킹·오버샘플 필터·컴팩션 판정)에 해당하는 것은 대략 절반이고, 나머지 절반은 설정 읽기·경로 정규화·에러 처리·원자적 파일 쓰기·로깅이다. 여기서 **정확한 함수 단위 분류는 하지 않았다** — "대략 절반" 은 읽고 받은 인상이지 센 값이 아니다. 센 값은 위 표의 총/공백/주석/코드 4열이다.

### A-7. 테스트

**존재하는 MCP/검색 테스트와 케이스 수** (`await it(` 기준 실측):

| 파일 | 케이스 | `npm test` 수집 여부 | 직접 실행 결과 |
| --- | ---: | --- | --- |
| `test/mcp/smart-search.test.js` | 19 | **아니오** | 19 passed, 0 failed |
| `test/mcp/section-extractor.test.js` | (헬퍼 시그니처 상이) | **아니오** | 21 passed, 0 failed |
| `test/mcp/search-mode.test.js` | 17 | **아니오** | 17 passed, 0 failed |
| `test/mcp/summarize-document.test.js` | 14 | **아니오** | 미실행 |
| `test/mcp/directory-fallback.test.js` | 12 | **아니오** | 미실행 |
| `test/mcp/query-document.test.js` | 11 | **아니오** | 미실행 |
| `test/mcp/integration-resolve-code.test.js` | (상이) | **아니오** | 미실행 |
| `test/mcp/parity-suite.test.js` | 1 | **아니오** | 미실행 |
| `test/mcp/handler-parity.test.js` | — | 예 | — |
| `test/mcp/streamable-http.test.js` | — | 예 | — |
| `test/mcp/config-security.test.js` · `default-bind` · `mcp-security-docs` · `bearer-auth` | — | 예 | — |

**핵심:** `scripts/run-tests.js` 의 `SUITES` 배열(31개)에 **A-RAG 검색 로직 테스트가 하나도 들어 있지 않다**. `npm test` 가 수집하는 MCP 테스트는 프로토콜·보안·핸들러 패리티뿐이다. 검색 품질 테스트는 파일로만 존재하고 CI 가 돌리지 않는다. 그래서 위에서 확인한 대로 **직접 실행하면 지금도 전부 통과한다** — 방치되었을 뿐 썩지는 않았다.

`test/chatbot/vector-store-memory.test.js` 는 SUITES 에 있다(인메모리 벡터스토어 삭제 버그 회귀 테스트, 커밋 `021bd39`).

**임베딩·LLM 팩토리 테스트는 CI 에서 명시적으로 제외**되어 있다 (`run-tests.js:45-46`, "외부 엔드포인트 필요").

### A-8. 코드에 남은 결함과 미완 — 실측

`TODO`/`FIXME`/`HACK`/`XXX` 마커는 `services/mcp/`·`vector-store*.js`·`filtered-retriever.js`·`agent-tools/handlers/`·`search-service.js` 전체에 **0건**이다. 대신 **마커 없이 실재하는 결함** 셋을 찾았다.

**(결함 1) MCP `smart_search` 는 semantic 모드로 절대 진입하지 못한다.** — 확정
`handlers/smart-search.js` 가 `smartSearchService.initialize(req.app.locals)` 를 호출하고, `SmartSearchService.initialize()` 는 `appLocals.vectorStoreManager` 를 읽는다. 그런데 `src/app.js` 에서 `app.locals.*` 에 대입하는 곳은 `config`·`logger`·`stores`·`cacheManager`·`chatbotService`·`apiLayer`·`projectResolver`·`mcpMounted`·`contextMcpMounted`·`configWatcher` 뿐이고 **`app.locals.vectorStoreManager` 는 어디에도 대입되지 않는다**(전 소스 grep `app\.locals\.\w+\s*=` 결과). `VectorStoreManager` 는 `ChatbotService` 인스턴스 안에만 산다.
결과: HTTP MCP 경로에서 `getAvailableMode()` 는 언제나 `keyword` 를 돌려주고, 명시적 `mode:"semantic"` 은 `SEMANTIC_SEARCH_NOT_INITIALIZED` 로 거부된다. **외부 에이전트(Claude Code 등)가 보는 `smart_search` 는 실질적으로 키워드 검색이다.** 내장 챗봇 경로는 `attachRuntimeContext()` 로 `runtimeContext.vectorStoreManager` 를 채우므로 이 문제를 우회한다.

**(결함 2) 영속(HNSWLib) 모드에서 `similaritySearch()` 는 무조건 TypeError 를 던진다.** — 실행으로 확인
`VectorStoreManager.similaritySearch()` (vector-store.js:389-396) 는 `usePersistence` 분기 없이 `this.vectorStore.similaritySearch(...)` 를 호출한다. 영속 모드에서 `this.vectorStore` 는 `null` 로 남고(실제 스토어는 `this.vectorStorage` 안에 있다), 같은 클래스의 `getRetriever()`·`addDocument()`·`getStats()`·`hasDocument()` 는 전부 영속 분기를 갖고 있는데 `similaritySearch()` 만 빠져 있다.
스크래치패드에서 가짜 임베딩으로 재현 실행한 결과:
```
usePersistence = true | this.vectorStore = null
similaritySearch THREW: TypeError - Cannot read properties of null (reading 'similaritySearch')
```
운용 설정 `config.json5` 은 `chatbot.rag.persistence.dataDir: "./data/vector"` 를 켜 두었으므로 **실제 배포는 영속 모드다**. 즉 내장 챗봇이 `smart_search` 를 `mode:"auto"` 로 호출하면 semantic 이 TypeError 로 죽고 §A-1 7단계 폴백을 타 조용히 키워드로 내려간다. 로그에는 `Semantic search failed, falling back to keyword search` 만 남는다.
챗봇의 **본 RAG 검색 경로**(`getRetriever()` → `FilteredRetriever`)는 이 버그를 타지 않는다. 망가진 것은 `smart_search` **도구**의 semantic 분기다.

**(결함 3) 영속 모드 결과에 파일시스템 절대경로가 새어 나간다.** — 코드 판독 (결함 2 때문에 현재는 도달 불가)
`performSemanticSearch()` 는 `metadata.filePath || metadata.source` 로 경로를 잡는다. `filePath` 는 **인메모리 모드에서만** 설정된다(`vector-store.js:287`). 영속 모드의 `metadata.source` 는 `addDocument` 의 `{source: docPath, ...additionalMeta}` 스프레드에서 `additionalMeta.source`(= 서버 절대경로)로 덮어씌워진 값이다. 따라서 semantic 결과의 `path` 는 `C:\...\test-source\guide\x.md` 같은 절대경로가 된다.

**설계상 한계 (버그가 아니라 선택):**
- 토큰 추정이 `바이트/3` 휴리스틱이다. 한국어 실토큰과 크게 어긋날 수 있고, `maxTokens` 예산의 정확도가 그만큼 흔들린다.
- 인메모리 모드는 매 검색마다 전 벡터를 코사인 브루트포스한다. `SimpleMemoryVectorStore.similaritySearch` 에 인덱스가 없다.
- 인메모리 모드는 서버 재시작마다 전량 재임베딩한다.
- `estimateTokens`·`splitByHeadings`·키워드 스코어링 모두 **문서를 통째로 메모리에 올린 뒤** 동작한다. `searchDocuments` 는 1MB 초과 파일을 스킵하는 것으로 이를 방어한다.
- `resolve_project` 인덱스는 **서버 기동 시 한 번만** 구축된다(`app.js:537`). 문서가 추가돼도 갱신되지 않는다.

---

## B 재사용 비용

### B-1. 브리핑의 전제 하나를 정정한다 — 백엔드는 TS/ESM 강제가 아니다

과제 브리핑은 "2.0 은 TypeScript · ESM 이고 1.0 은 JavaScript · CommonJS" 를 재사용 비용의 근거로 들었다. **2.0 SRS 를 실제로 읽으면 그 제약은 프론트엔드에만 걸려 있다.**

- `CON-ARCH-003` (`docs/spec/02.product-architecture.srs.md:391`): "**프론트엔드는** Vite + React + TypeScript 기반 SPA 로 작성한다." AC-2 도 "**프론트엔드 소스는** React 와 TypeScript 로 작성된다."
- `docs/spec/*.md` 전체에서 `TypeScript|ESM|CommonJS` 를 grep 하면 히트는 5건뿐이고, 전부 프론트엔드 문맥이다. **백엔드 언어를 규정하는 요구사항이 없다.**
- 오히려 `CON-ARCH-002` 는 정반대를 요구한다 — "`DocuLight2.0` 을 별도 리포지토리로 두고 **1.0 의 백엔드 자산을 이식한다**", AC-2: "**MCP 서버·AI/벡터검색**·로깅·config·chokidar·Playwright 자산은 1.0 에서 이식된다."
- `FR-ARCH-001` 은 더 직접적이다 — "1.0 의 AI 기능(LangChain 기반 파이프라인 · 벡터검색 · `smart_search`)과 MCP 서버를 2.0 으로 이관한다", Rationale: "**1.0 이 이미 운용 중인 자산이라 재작성 이득이 없다**". AC-1: "1.0 의 LangChain 기반 AI 파이프라인·벡터검색·`smart_search` 가 2.0 에서 동작한다."
- 현재 2.0 리포에는 `packages/editor` 하나뿐이고 백엔드 패키지가 아직 없다. 즉 **백엔드 언어 결정은 아직 열려 있고, SRS 는 이식 쪽으로 이미 기울어 있다.**

이 정정은 판단을 뒤집는 종류다. TS/ESM 을 백엔드 구속으로 놓으면 "포팅 비용" 이 부풀고, 그 부푼 값이 "신규 작성" 을 정당화하게 된다. 실제 SRS 는 그 구속을 걸지 않았다.

다만 사용자가 이번에 내린 결정("MCP 를 통한 A-RAG 검색을 제외하고 처음부터 다시 만듭시다")은 `FR-ARCH-001`·`CON-ARCH-002` 와 **정면으로 충돌한다** — SRS 는 백엔드를 이식하라 하고, 사용자는 A-RAG 만 남기고 나머지를 재작성하라 했다. 이 충돌은 SRS 개정으로 처리해야 할 사안이지 조사가 결정할 것이 아니다. 여기서는 사실만 적는다.

### B-2. ACL — 1.0 은 필터링을 하지 않는다. 할 자리조차 없다

**1.0 의 권한 모델은 전역 3단계다.** `src/stores/group-store.js` 의 시스템 그룹은 `['superuser','write','read']` / `['write','read']` / `['read']` 셋이고, `middleware/auth.js:74-80` 의 `hasPermission()` 은 그 배열만 본다. **문서·폴더 단위 권한 개념이 코드베이스 어디에도 없다.**

그 결과:
- 인증을 통과한 사용자는 `docsRoot` 전체를 본다. `smart_search`·`search`·`query_document` 어디에도 사용자 인자가 전달되지 않는다 — `handlers/search.js` 의 시그니처는 아예 `(config, logger, args)` 로 `req` 조차 받지 않는다.
- 벡터 인덱스는 사용자 개념을 모른다. `metadata.documents[경로]` 에 저장하는 필드는 `hash`·`size`·`mtime`·`chunkCount`·`version`·`indexedAt` 뿐이다.
- `POST /context` 는 인증 자체가 없다.
- `routes/mcp.js` 의 `requiresReadAuth()` 는 "로그인했는가" 만 묻는 전부 아니면 전무 게이트다.

**2.0 이 요구하는 것** (`SEC-ARCH-002`, Stability=stable):
- AC-1: 서로 다른 ACL 을 가진 두 사용자가 같은 도구를 같은 인자로 호출하면 각자의 유효 권한에 해당하는 결과만 받는다.
- AC-2: 벡터검색 결과 목록에 볼 수 없는 노드가 없다.
- AC-3: 요약·발췌 텍스트에 볼 수 없는 노드의 본문이 없다.
- AC-4: **걸러졌다는 사실을 건수·순번·자리표시 어느 형태로도 노출하지 않는다.**
- `SEC-ARCH-001`: 인증 없이 호출 가능한 도구를 두지 않는다 (→ `POST /context` 는 그대로 이식 불가).
- `SEC-STORAGE-007`: 벡터 인덱스는 노드 삭제·이동·아카이브 시 **동기 갱신**하고, 조회 시점에 존재하지 않는 노드의 엔트리는 **무조건 제외**한다.

SRS 자신이 미해결로 표시한 축이 있다 — `SEC-ARCH-002` Implementation Notes: *"필터를 어느 지점에 적용하는지가 정해져 있지 않다. 벡터 인덱스가 전 문서를 담고 있어 상위 N 건을 먼저 뽑은 뒤 거르면 권한 있는 결과가 통째로 사라져 빈 응답이 나온다."*

**ACL 을 끼워 넣는 세 가지 방식과 그 비용:**

| 방식 | 1.0 코드 재사용도 | AC 충족 | 비용 |
| --- | --- | --- | --- |
| **(가) 사후 필터** — 상위 N 건 뽑고 권한 없는 것 제거 | 높음. `FilteredRetriever._isValidDocument()` 에 조건 하나를 더하면 된다 — 이 클래스는 **이미 과다검색 + 사후필터 구조**다 | AC-2·AC-3 충족. **AC-4 는 자연히 충족**(걸러낸 건수를 표시하지 않음). 단 SRS 가 지적한 "빈 응답" 문제가 실재 | 낮음. `overSampleFactor` 를 권한 비율까지 반영하도록 확장하는 정도 |
| **(나) 사전 필터** — 허용 노드 집합으로 검색 공간을 제한 | 낮음. HNSWLib 은 메타데이터 프리필터를 지원하지 않는다. 벡터 저장소 교체가 필요 | 전부 충족, 빈 응답 없음 | 높음. 저장소 교체 = `vector-storage.js` 715줄 전면 재작성 |
| **(다) ACL 파티션 색인** — 권한 조합별 인덱스 분리 | 낮음 | 충족하나 조합 폭발 | 매우 높음. 수천 명 규모(`CON-ARCH-001`)에서 비현실적 |

**(가)의 비용이 가장 낮고, 그 이유가 중요하다** — `FilteredRetriever` 는 HNSWLib 의 개별 삭제 미지원을 우회하려고 이미 "과다검색 → 유효성 판정 → k개로 자르기" 구조를 갖고 있다. ACL 판정은 그 판정 함수에 술어를 하나 더 얹는 일이다. **1.0 이 ACL 을 하지 않는다는 것이 곧 ACL 을 넣을 자리가 없다는 뜻은 아니다.**

반면 **`smart_search` 쪽은 자리가 없다.** `SmartSearchService`·`searchDocuments`·`QueryDocumentService`·`CodeBlockExtractorService`·`SummarizeDocumentService` 는 모두 사용자 컨텍스트를 인자로 받지 않는다. 호출 사슬 전체(`routes/mcp.js` → `handlers/*` → `services/*`)에 principal 인자를 관통시켜야 한다. 이것은 12개 핸들러 × 6개 서비스의 시그니처 변경이고, 서비스마다 **어느 시점에** 필터를 거는지를 따로 정해야 한다(파일 스캔 단계 / 결과 정렬 전 / 섹션 추출 후).

### B-3. 이식 대 신규 — 무엇이 실제로 더 싼가

**이식이 값을 남기는 자산 (재작성해도 같은 것을 다시 짓게 되는 부분):**

| 자산 | 줄 수 | 재작성 시 다시 짜야 하는 이유 |
| --- | ---: | --- |
| `vector-storage.js` 의 소프트삭제 + 버전 + 컴팩션 기계 | 715 | HNSWLib(또는 대다수 HNSW 구현)이 개별 삭제를 지원하지 않는 것은 라이브러리 사실이다. 저장소를 바꾸지 않는 한 이 우회는 다시 발명된다 |
| `FilteredRetriever` 과다검색·오버샘플 계수 | 270 | 위와 같은 이유. **그리고 ACL 필터가 앉을 유일한 자리다** |
| `SectionExtractor` 섹션 분할·스코어링 | 315 | 토큰 예산 안에서 마크다운 섹션을 고르는 로직. 21개 테스트가 있고 지금도 통과한다 |
| `metadata.json` 원자적 쓰기 + 백업 복구 + 일관성 검증 | (vector-storage 내) | 지루하고, 정확히 짜기 어렵고, 깨지면 조용히 인덱스가 썩는다 |
| MCP JSON-RPC 프로토콜 계층 (Origin/Host allowlist, 프로토콜 버전 협상, notification/response 분류) | 856 | 프로토콜 준수. `test/mcp/streamable-http.test.js` 가 CI 에 들어 있다 |
| 예산·dedup·injection guard | 1,406 | 에이전트 루프 안전장치. 재작성 시 되풀이 |

**이식 가치가 없거나 마이너스인 부분:**

| 자산 | 줄 수 | 사유 |
| --- | ---: | --- |
| `workflow/graph.js` + 미사용 노드 10개 | 3,512 | **죽은 코드.** 이식하면 죽은 채로 옮겨진다 |
| `routes/context-mcp.js` | 319 | 무인증 표면. `SEC-ARCH-001` 위반이라 그대로는 이식 불가 |
| `searchDocuments()` 의 매 호출 전체 스캔 | 432 | 인덱스 없는 선형 스캔 + 5초 타임아웃. 수천 문서 규모에서 재설계 대상 |
| `token-estimator` 바이트/3 휴리스틱 | 135 | 대체가 싸다 (§C-4) |
| `doc-loader.js` | 137 | 사실상 미사용 |

**정리하면:**
- **이식하면 값이 남는 코어는 약 1,300줄** (vector-storage 715 + filtered-retriever 270 + section-extractor 315). 여기에 MCP 프로토콜 계층 856줄과 에이전트 안전장치 1,406줄을 더하면 **약 3,560줄**.
- **그 코어를 다시 쓰는 데 드는 비용**은 줄 수가 아니라 **재발견 비용**이다. HNSWLib 삭제 우회·오버샘플 계수·컴팩션 임계·메타데이터 원자성은 전부 "한 번 데어 본" 흔적이다. 커밋 로그가 이를 증언한다 — `021bd39 fix: 인메모리 벡터 스토어의 문서 벡터 삭제 버그 수정`.
- **이식 비용의 실체는 언어가 아니라 principal 관통이다.** CJS→ESM 변환은 `require`→`import`·`module.exports`→`export` 의 기계적 치환이고, 이 코드베이스는 동적 `require()` 를 함수 안에서 쓰는 곳이 여럿이라(`vector-storage.js:659`, `filtered-retriever.js:92`, `chatbot-service.js:163` 등) 그 부분만 손봐야 한다 — **수십 줄 규모**다. 타입 주석은 이미 JSDoc 이 촘촘해서(주석 1,069줄) `.d.ts` 없이도 `allowJs`+`checkJs` 로 점진 이행이 가능하다.
- **신규 작성 비용의 실체는 "무엇을 만들지 정하는 일" 이 이미 끝나 있지 않다는 것이다.** §D 의 도구 12개는 인자·기본값·출력 포맷·에러 코드가 실제로 굳어 있고, 사내 에이전트들이 이미 그 형태에 맞춰 쓰고 있다. 신규 작성은 그 계약을 다시 확정해야 한다.

**따라서 — 어느 쪽이 더 싼가:**

| 축 | 이식 | 신규 |
| --- | --- | --- |
| 검색 코어 (vector-storage·filtered-retriever·section-extractor, 1,300줄) | **싸다.** 언어 변환은 기계적, JSDoc 이 타입 이행을 돕고, `section-extractor` 는 통과하는 테스트 21개를 갖고 온다 | 비싸다. HNSW 삭제 우회를 재발명해야 한다 |
| ACL 관통 | **양쪽 비용이 같다.** 1.0 에 자리가 없으므로 이식하든 신규든 새로 짜야 한다 | 같음 |
| MCP 프로토콜 계층 (856줄) | **싸다.** CI 테스트 보유 | 비싸다 |
| `smart_search` 서비스 자체 (389줄) | **미묘하다.** 결함 1·2 를 안고 오며, semantic 경로는 실전 검증된 적이 없다 | 싸다. 389줄이고 요구가 바뀌었다 |
| 키워드 검색 (432줄) | 비싸다. 인덱스 없는 스캔은 2.0 규모에서 재설계 대상 | **싸다** |
| 에이전트 루프 (agentic-graph 668 + 안전장치 1,406) | 싸다 — **다만 2.0 이 내장 챗봇을 할 것인지가 SRS 에 없다** | — |

### B-4. SRS 가 아직 정하지 않은 것 (이 판단을 막는 공백)

- 2.0 이 **내장 챗봇 UI** 를 갖는가. `FR-ARCH-001` Implementation Notes: *"이관 범위에 AI 기능의 화면(프롬프트 UI·결과 표시)이 포함되는지는 이 조항이 정하지 않는다."* 이것이 정해지지 않으면 §A-2 의 2,074줄(agentic-graph + prompts + state + 안전장치)의 이식 여부가 미정으로 남는다.
- 2.0 **백엔드의 언어·모듈 시스템**. 위 B-1.
- ACL 필터의 **적용 지점**. `SEC-ARCH-002` 가 명시적으로 미결로 남겼다.
- 2.0 의 **문서 개수 규모 상한**. `CON-ARCH-001` 은 "수천 명" 이라는 사람 수만 전제하고 문서 수를 말하지 않는다. 이 값이 없으면 HNSWLib 유지/교체 판단이 서지 않는다.

---

## C 개선 여지

여기 적는 것은 전부 **가정이 붙은 제안**이다. "최신이 낫다" 는 근거로 쓴 항목은 없다.

### C-1. 검색 방식 — 순수 벡터에서 하이브리드(BM25 + 벡터) + RRF 로

**현재:** `mode:'auto'` 가 semantic **또는** keyword 를 **택일**한다. 둘을 합치지 않는다. semantic 이 실패해야만 keyword 로 내려간다.

**제안:** 두 검색을 항상 병렬로 돌리고 Reciprocal Rank Fusion(`score = Σ 1/(k + rank)`, 관례상 k=60)으로 순위를 합친다.

**얻는 것:** 정확한 식별자 검색(함수명·에러코드·설정 키)은 BM25 가 압도적으로 강하고, 개념 질의는 벡터가 강하다. 사내 개발 문서는 두 종류가 섞인다. 현재는 모드 하나를 골라 나머지를 버린다. 또 semantic 실패 시 폴백이 **조용히** 일어나 사용자가 왜 결과가 나빠졌는지 모른다(결함 2가 정확히 이 상황이다).

**잃는 것:** 호출당 두 배의 작업. 키워드 쪽은 §A-3 대로 인덱스 없는 전체 스캔이라 문서 수에 선형이다 — RRF 를 도입하려면 **키워드 쪽에 역색인이 먼저 필요하다**(C-3). 그 전에 도입하면 모든 질의가 전체 스캔 비용을 무조건 물게 된다. 그리고 융합 점수는 절대 의미가 없어져 `minSimilarityScore` 같은 임계값 튜닝이 다시 필요하다.

**가정:** 문서 수가 수천 단위 이하. 그보다 크면 두 인덱스의 동기화 비용이 이득을 잠식한다.

### C-2. 청킹 — 고정 1000자에서 헤딩 경계 우선 + 부모 문맥 첨부로

**현재:** `RecursiveCharacterTextSplitter(chunkSize:1000, overlap:200)`. separators 가 `\n## `·`\n### `·`\n#### ` 를 앞세우므로 **헤딩을 어느 정도 존중은 한다.** 다만 1000자를 넘는 섹션은 헤딩 경계와 무관하게 잘리고, 잘린 뒷조각은 **자기가 어느 헤딩 아래인지 모른다**.

**제안:** (1) 청크 메타데이터에 조상 헤딩 경로(`# 설치 > ## 윈도우 > ### 인증서`)를 넣는다. (2) 검색 시 히트한 청크 대신 그 청크가 속한 섹션을 돌려주는 small-to-big 방식.

**얻는 것:** 리트리브된 조각의 자기설명력. 지금은 "다음 명령을 실행하세요" 만 담긴 청크가 히트하면 무엇에 대한 명령인지 알 수 없다. 이미 `SectionExtractor` 가 헤딩 분할을 할 줄 알고, `summarize_document` 가 TOC 를 뽑을 줄 안다 — 부품이 있다.

**잃는 것:** 메타데이터가 커지고(청크당 헤딩 경로 문자열), small-to-big 은 반환 토큰이 늘어난다. `maxTokens` 예산 안에서 문서 수가 줄어드는 트레이드가 생긴다. 그리고 **인덱스 재구축이 필요하다** — 청킹 규칙 변경은 기존 벡터를 전부 무효화한다.

**가정:** 문서가 헤딩 구조를 갖는다. `docsRoot` 가 헤딩 없는 긴 텍스트 위주면 이득이 없다.

### C-3. 키워드 검색 — 전체 스캔에서 SQLite FTS5 로

**현재:** `searchDocuments()` 가 호출마다 트리 전체를 `readdir`+`readFile` 한다. 5초 타임아웃이 방어책이자 한계다.

**제안:** SQLite FTS5 역색인. **2.0 은 이미 SQLite 를 쓴다** (`DR-STORAGE-002`: 사용자·그룹·ACL 메타데이터는 SQLite 단일 저장소, `better-sqlite3` 는 1.0 optionalDependencies 에 이미 존재).

**얻는 것:** (1) 검색이 O(문서 수) 에서 벗어난다. (2) **ACL 사전 필터가 SQL `WHERE` 절 하나로 성립한다** — `SEC-ARCH-002` 가 미결로 남긴 "필터 적용 지점" 문제가 키워드 축에서는 자동으로 풀린다. (3) BM25 랭킹이 내장이다(FTS5 `rank`). (4) 새 의존을 들이지 않는다.

**잃는 것:** 색인 동기화 책임이 하나 늘어난다 — 파일 변경 시 벡터 인덱스와 FTS 인덱스 **둘 다** 갱신해야 하고, `SEC-STORAGE-007` 의 동기 갱신 요구가 양쪽에 걸린다. 한쪽만 실패하면 두 검색의 결과가 어긋난다. 한국어 토크나이징은 FTS5 기본 토크나이저로는 부실하고, `unicode61` + trigram 조합이나 별도 토크나이저가 필요하다 — **이 부분은 실측하지 않았다.**

**가정:** 문서 본문의 SSOT 가 파일시스템이라는 `DR-STORAGE-001` 을 지키면서 FTS 를 **파생 색인**으로만 둔다. FTS 를 본문 저장소로 승격하면 SSOT 가 둘이 된다.

### C-4. 토큰 추정 — 바이트/3 에서 실제 토크나이저로

**현재:** `ceil(UTF-8 바이트 / 3)`. 파일 주석이 스스로 "빠른 추정" 이라고 인정한다.

**제안:** 실제 토크나이저(`tiktoken` 또는 사용 중인 모델의 토크나이저)로 교체하거나, 최소한 한/영 비율에 따라 계수를 나눈다.

**얻는 것:** `maxTokens` 예산의 정확도. 지금은 예산을 지킨다고 말하면서 실제로는 지키지 못할 수 있다. 특히 사내 배포가 한국어 임베딩(`KURE-v1`)과 한국어 문서를 쓰므로 오차가 한 방향으로 누적된다.

**잃는 것:** `tiktoken` 은 네이티브 바인딩(또는 WASM)이고, 사내 vLLM 이 Qwen 계열을 쓰므로 **OpenAI 토크나이저는 그 모델의 실제 토큰 수와 다르다.** 정확도를 얻는 대신 "어느 토크나이저가 정답인가" 라는 새 질문이 생긴다. 그리고 매 섹션마다 토크나이저를 돌리면 §A-1 8단계가 느려진다.

**대안 (더 싸다):** 바이트/3 을 유지하되 **보수적으로** 잡는다(예: 한글 비율이 높으면 바이트/2). 예산을 넘기는 것보다 덜 채우는 쪽이 안전하다.

### C-5. 리랭킹 — 없음에서 cross-encoder 리랭커로

**현재:** 리랭킹이 없다. 벡터 유사도 순위가 그대로 최종 순위다. `SectionExtractor` 의 키워드 스코어링이 **문서 안에서** 섹션을 고르지만 **문서 사이** 순위는 손대지 않는다.

**제안:** 상위 20~50건을 뽑아 cross-encoder(예: `bge-reranker`)로 재정렬 후 상위 5건 반환.

**얻는 것:** 리랭킹은 RAG 정확도 개선 중 투입 대비 효과가 가장 확실한 축이다. 특히 §C-1 의 하이브리드와 함께 쓰면 RRF 의 거친 융합을 정교하게 다듬는다.

**잃는 것:** **추론 인프라가 하나 더 필요하다.** 사내 vLLM 에 리랭커 모델을 추가 배포해야 하고, 이는 조사 범위 밖 인프라 결정이다. 지연이 늘어난다(50건 리랭킹 = 50회 cross-encoder forward). 그리고 리랭커 없이도 §C-1·C-2 만으로 상당한 개선이 나므로 **우선순위는 마지막이다**.

**가정:** 사내 GPU 여유가 있고 임베딩 서버(`10.0.0.50:8002`)에 모델을 하나 더 얹을 수 있다. **확인 못 함** — 인프라 담당에게 물어야 안다.

### C-6. 벡터 저장소 — HNSWLib 유지 여부

**현재의 진짜 문제는 성능이 아니라 삭제다.** HNSWLib 이 개별 삭제를 지원하지 않아서 소프트삭제 + 버전 필터 + 주기적 전량 재구축이라는 3중 우회가 붙어 있고, 이것이 `vector-storage.js` 715줄 중 상당 부분의 존재 이유다.

**후보 A — sqlite-vec (또는 `better-sqlite3` + 벡터 확장):** 얻는 것 — 삭제가 `DELETE` 한 줄이 되어 소프트삭제·버전·컴팩션 기계 전체가 사라진다. **ACL 사전 필터가 `WHERE` 절로 성립해 `SEC-ARCH-002` 의 미결 축이 풀린다.** 메타데이터 SQLite 와 저장소가 하나로 합쳐진다. 잃는 것 — 순수 ANN 성능은 HNSWLib 보다 떨어진다(sqlite-vec 은 현재 brute-force 중심). 문서 수가 크면 이 손해가 커진다. `hnswlib-node` 네이티브 빌드 의존은 사라지지만 새 확장의 빌드 의존이 생긴다.

**후보 B — HNSWLib 유지:** 얻는 것 — 이식 비용 0, 검증된 코드. 잃는 것 — 삭제 우회 3중 구조를 그대로 안고 간다. `SEC-STORAGE-007` 의 "조회 시점에 존재하지 않는 노드를 무조건 제외" 는 `FilteredRetriever` 로 이미 충족되지만, "노드 삭제 시 같은 처리 안에서 엔트리 제거" 는 소프트삭제로는 **문면 그대로 충족하지 못한다** — 벡터가 인덱스에 남기 때문이다. 이 해석 차이를 SRS 소유자에게 확인해야 한다.

**판단에 필요한데 없는 값:** 2.0 이 다룰 문서 수의 상한. `CON-ARCH-001` 이 사람 수만 전제한다. 이 값 없이 A/B 를 고를 수 없다.

### C-7. 임베딩 모델

현재 사내 배포는 `nlpai-lab/KURE-v1` 을 쓴다. **이것은 한국어 특화 임베딩으로 합리적인 선택이며, 바꿀 근거를 이 조사에서 찾지 못했다.** 다국어 범용 모델로 바꾸면 영문 기술용어 검색이 나아질 수 있으나 한국어 본문 검색이 나빠진다 — 사내 문서 구성비를 모르는 상태에서 권할 수 없다. `embedding-factory.js` 가 provider 3종을 추상화해 두었으므로 **모델 교체 비용 자체는 설정 한 줄이다**(단, 인덱스 전량 재구축은 자동으로 일어난다 — `_isEmbeddingModelChanged()`).

---

## D MCP 도구 명세

2.0 이 물려받을 「기능」의 정본이다. 정의는 `src/routes/mcp.js:201-465` (`buildTools(prefix)`) 에서 그대로 옮겼다.
`{prefix}` = `sanitizeForToolName(config.ui.title)` — 공백은 `_`, 영숫자·`_` 외 문자는 제거, 비면 `DocuLight`. 운용 설정(`ui.title: "DOCU LIGHT"`)에서는 `DOCU_LIGHT` 가 된다.
**모든 도구의 반환 형식은 `{content: [{type:'text', text: <마크다운 문자열>}]}` 이다.** 구조화 JSON 을 돌려주는 도구가 없다.

### D-1. 메인 MCP 표면 — `POST /mcp` (12개)

| # | 도구 이름 | 인증 | 챗봇 노출 |
| --- | --- | --- | --- |
| 1 | `list_documents` | read 게이트 | O |
| 2 | `list_full_tree` | read 게이트 | O |
| 3 | `read_document` | read 게이트 | O |
| 4 | `create_document` | **항상 필수 + write 권한** | X (`EXCLUDED_TOOLS`) |
| 5 | `delete_document` | **항상 필수 + write 권한** | X (`EXCLUDED_TOOLS`) |
| 6 | `{prefix}_get_config` | read 게이트 | O |
| 7 | `{prefix}_search` | read 게이트 | O |
| 8 | `query_document` | read 게이트 | O |
| 9 | `summarize_document` | read 게이트 | O |
| 10 | `{prefix}_smart_search` | read 게이트 | O |
| 11 | `resolve_project` | read 게이트 | O |
| 12 | `query_code_examples` | read 게이트 | O |

"read 게이트" = `authSettingsStore.get().requireReadLogin` 이 켜져 있을 때만 API 키 요구. 꺼져 있으면 무인증 공개.

---

**1. `list_documents`**
- 입력: `path` (string, 기본 `/`) · `useDisplayName` (boolean, 기본 false — true 면 frontmatter title 표시)
- 동작: 지정 디렉터리 **한 단계만** 나열. 내용은 읽지 않는다.
- 출력: 파일·폴더 이름 목록 (마크다운)

**2. `list_full_tree`**
- 입력: `path` (기본 `/`) · `maxDepth` (integer, 생략 시 전체 깊이) · `useDisplayName` (boolean, 기본 false)
- 동작: 재귀 트리. 경로만, 내용 없음.
- 출력: 트리 구조 (마크다운). 설명이 스스로 "큰 컬렉션에서는 커질 수 있다" 고 경고.

**3. `read_document`**
- 입력: `path` (**필수**)
- 동작: 파일 전문을 읽는다. `getRawContent(config, logger, path)`.
- 출력: `# {path}\n\n{전문}`
- 설명이 명시적으로 "토큰을 많이 쓴다, 대신 `query_document`·`summarize_document`·`{prefix}_smart_search` 를 고려하라" 고 유도한다.

**4. `create_document`**
- 입력: `path` (**필수**) · `content` (**필수**, 마크다운)
- 동작: 새 문서 생성 또는 **덮어쓰기**. 상위 디렉터리 자동 생성.
- 인증: `X-API-Key`/`Bearer` 필수 + `hasPermission(perms,'write')`

**5. `delete_document`**
- 입력: `path` (**필수**)
- 동작: 파일 또는 **디렉터리 전체** 영구 삭제. 되돌릴 수 없다.
- 인증: 4와 동일

**6. `{prefix}_get_config`**
- 입력: `section` (enum `ui`|`security`|`ssl`|`all`, 기본 `all`)
- 동작: 서버 설정 반환. **API 키 등 민감값은 마스킹**.

**7. `{prefix}_search` — 키워드 검색**
- 입력: `query` (**필수**, 최소 2자) · `limit` (integer, 기본 10, 1~100 클램프) · `path` (기본 `/`) · `mode` (enum `titles_only`|`snippets`|`full_context`, 기본 `snippets`)
- 동작: §A-3. 파일명·H1 제목·본문 매치. 우선순위 filename > title > content. 다중 질의어는 파일 단위 AND. 5초 타임아웃, 1MB 초과 파일 스킵.
- 출력: `# Search Results for "q"` + `**Mode**` + `**Statistics**: N matches in M files scanned (Xms)` + 모드별 본문
  - `titles_only`: `1. path - "title"` 목록
  - `snippets`: 파일별 `**Line N**: 매치라인` + ``` 로 감싼 전후 2줄 문맥
  - `full_context`: 매치를 포함한 **섹션 전문**
- 에러 코드: `INVALID_QUERY` · `QUERY_TOO_SHORT` · `PATH_TRAVERSAL` · `NOT_FOUND` · `INVALID_PATH` · `TIMEOUT`

**8. `query_document` — 단일 문서 내 질의**
- 입력: `path` (**필수**) · `query` (**필수**) · `maxTokens` (기본 2000)
- 동작: 한 문서를 섹션으로 쪼개 질의 관련성 순으로 예산 안에서 고른다(`SectionExtractor`). **`path` 가 디렉터리면 대표 파일을 자동 선택** — 우선순위 `.summary.md` → `readme.md` → `index.*` → `overview.*` → 숫자로 시작하는 첫 파일. 결정 못 하면 `INVALID_PATH` 와 함께 후보 목록을 돌려준다.
- 출력: 문서 경로 + 선택된 섹션들 + 토큰 사용량

**9. `summarize_document` — 구조 요약**
- 입력: `path` (**필수**)
- 동작: 전문을 읽지 않고 구조를 반환. `query_document` 의 디렉터리 대표파일 로직을 공유.
- 출력: `# Document Summary: {path}` + `## Title` + `## Table of Contents`(계층 번호 매김) + `## Key Points`(섹션별 추출) + `## Statistics`(단어 수·문자 수·섹션 수·코드블록 수·추정 토큰)

**10. `{prefix}_smart_search` — 하이브리드 검색**
- 입력: `query` (**필수**) · `path` (기본 `/`) · `mode` (enum `auto`|`semantic`|`keyword`, 기본 `auto`) · `maxTokens` (기본 2000) · `limit` (기본 5)
- 동작: §A-1.
- 출력: `# Search Results for "q"` + `**Mode**: semantic (embedding: {model})` 또는 `keyword` + `**Documents**: N matches` + `**Path**` + 문서별 `## N. {path} (score: 0.00)` + 섹션 본문(잘렸으면 `*[Content truncated due to token limit]*`) + `**Tokens used**: X / Y`
- 에러 코드: `INVALID_QUERY` · `SEMANTIC_SEARCH_UNAVAILABLE`(임베딩 설정 없이 semantic 강제) · `SEMANTIC_SEARCH_NOT_INITIALIZED`(VectorStore 미초기화)
- **주의: `path` 인자는 semantic 경로에서 무시된다.** `performSemanticSearch(query, limit)` 가 경로를 받지 않는다. keyword 경로에서만 유효하다.
- **주의: 결함 1 때문에 HTTP MCP 경로에서는 언제나 keyword 로 동작한다.**

**11. `resolve_project` — 이름 → 경로 해석**
- 입력: `name` (**필수**, 자연어 — 예 `json5`·`AnnotaQL`·`옵션위버`) · `version` (예 `2.0`, 생략 시 전 버전) · `limit` (기본 5)
- 동작: 서버 기동 시 구축한 인덱스에 대해 계단식 점수 매칭 — 디렉터리명 완전일치 1.0 → alias 완전일치 0.95 → 제목 완전일치 0.90 → 디렉터리명 포함 0.80 → 역포함 0.75 → alias 부분일치 0.70 → 제목 포함 0.65 → Levenshtein 거리 0.50×(1−d/max) → alias Levenshtein 0.45×(...). 질의 끝의 `v?\d+(\.\d+)*` 패턴을 버전으로 분리. `v?\d+(\.\d+)*` 형태의 하위 디렉터리를 버전으로 인식.
- 인덱스 소스: 각 디렉터리의 `.md` 파일에서 frontmatter `aliases`(쉼표 구분)·`description`·`version`, 그리고 첫 H1 을 제목으로.
- 출력: `# Project Resolution for "name"` + 결과별 `## N. {title} (score: 0.00)` + Path/Directory/Description/Documents/Versions/Latest + **Next steps** 안내(`query_document`·`query_code_examples`·`{prefix}_smart_search` 로 이어가라)
- 에러: `INVALID_QUERY` · `INDEX_NOT_BUILT`

**12. `query_code_examples` — 코드 블록 추출**
- 입력: `query` (**필수**) · `path` (기본 `/`) · `language` (예 `java`·`python`, 생략 시 전체) · `maxTokens` (기본 3000) · `limit` (기본 10)
- 동작: 파일 또는 디렉터리에서 코드 펜스를 추출 → 언어 필터 → 질의어 매칭 점수 → **0.25 임계값 미만 제외** → 점수순 → 토큰 예산 안에서 선택(남은 예산 > 50이면 잘라서라도 하나 더)
- 출력: 코드 블록 + 주변 문맥(헤딩·설명)

**MCP `initialize` 응답의 `instructions`** — 서버가 에이전트에게 주는 권장 워크플로:
> 1. `resolve_project` 로 프로젝트/라이브러리 이름의 문서 경로를 찾는다
> 2. 해석된 경로로 `query_document` 또는 `query_code_examples` 를 호출한다
> 3. 문서 횡단 자연어 검색은 `{prefix}_smart_search`
> 4. 전문을 읽기 전에 `summarize_document` 로 구조를 파악한다

### D-2. Context MCP 표면 — `POST /context` (3개, **무인증**)

**13. `list_context_documents`** — 입력 `path`(기본 `/`). frontmatter `description` 이 있는 문서만 나열.
**14. `read_document`** — 입력 `path`(**필수**). frontmatter 를 제거한 본문 반환.
**15. `search_documents`** — 입력 `query`(**필수**, 1~200자) · `context_chars`(기본 50, 10~500) · `case_sensitive`(기본 false) · `path`(기본 `/`) · `max_results`(파일당, 기본 10, 1~100). 전역 상한: 최대 500 매치 / 1000 파일.

**이 표면은 `SEC-ARCH-001`("인증 없이 호출할 수 있는 도구를 두지 않는다")과 정면 충돌하므로 2.0 에 그대로 이식할 수 없다.** 기능을 남기려면 메인 표면으로 흡수하거나 인증을 붙여야 한다.

---

## 권고

**이식이 낫다 — 단, 이식 대상은 「검색 코어 3개 파일 + MCP 프로토콜 계층」이고 `smart_search` 서비스 자체는 재작성한다.**

근거 셋:

1. **재작성해도 같은 것을 다시 짓게 되는 코드가 실재한다.** `vector-storage.js`(715줄)의 소프트삭제·버전필터·컴팩션 3중 구조는 HNSWLib 이 개별 삭제를 지원하지 않는다는 라이브러리 사실에서 나온 것이고, 저장소를 바꾸지 않는 한 신규 작성에서도 똑같이 발명된다. `FilteredRetriever`(270줄)의 과다검색·오버샘플 구조는 **2.0 의 ACL 필터가 앉을 가장 싼 자리이기도 하다** — `_isValidDocument()` 에 권한 술어를 하나 더하면 `SEC-ARCH-002` AC-2·AC-3·AC-4 가 성립한다. `section-extractor.js`(315줄)는 지금 실행해도 통과하는 테스트 21개를 함께 갖고 온다.

2. **이식 비용의 실체가 언어가 아니다.** 브리핑이 전제한 "2.0 은 TS/ESM" 은 SRS 상 **프론트엔드에만** 걸린 제약이고(`CON-ARCH-003` AC-2), 백엔드 언어를 규정하는 요구사항은 `docs/spec/**` 어디에도 없다. 오히려 `CON-ARCH-002` AC-2 와 `FR-ARCH-001` AC-1 이 **MCP 서버와 AI/벡터검색을 이식 자산으로 명시**한다. CJS→ESM 변환은 함수 내부 동적 `require()` 몇 곳(`vector-storage.js:659`·`filtered-retriever.js:92`·`chatbot-service.js:163` 등)을 손보는 수십 줄 규모이고, JSDoc 이 1,069줄로 촘촘해 `checkJs` 점진 이행이 가능하다. 진짜 비용은 **principal(호출자) 인자를 12개 핸들러 × 6개 서비스에 관통시키는 일**인데, 이 비용은 이식이든 신규든 **동일하게** 든다 — 1.0 에 ACL 개념 자체가 없기 때문이다(권한은 `superuser`/`write`/`read` 전역 3단계뿐).

3. **`smart_search` 서비스만은 이식 이득이 마이너스다.** 389줄 중 semantic 경로가 **한 번도 실전 동작한 적이 없다** — HTTP MCP 경로에서는 `app.locals.vectorStoreManager` 가 아예 대입되지 않아 항상 keyword 로 떨어지고(결함 1), 내장 챗봇 경로에서도 운용 설정이 영속 모드라 `similaritySearch()` 가 TypeError 로 죽어 조용히 keyword 로 폴백한다(결함 2, 실행으로 재현). 검증된 적 없는 389줄을 옮기는 것보다, §D-1 의 도구 계약(인자·기본값·출력 포맷·에러 코드)만 명세로 물려받고 §C-1(하이브리드+RRF)·§C-3(SQLite FTS5, ACL 사전필터가 `WHERE` 한 줄로 성립)로 새로 쓰는 편이 싸고 요구에도 맞는다.

---

## 확신도와 못 본 것

### 확신도 높음 (실행 또는 전수 grep 으로 확인)
- 결함 2(영속 모드 `similaritySearch` TypeError) — 스크래치패드에서 가짜 임베딩으로 **재현 실행**했다.
- 결함 1(`app.locals.vectorStoreManager` 미대입) — `app\.locals\.\w+\s*=` 전수 grep 으로 대입 지점 10곳을 모두 확인했고 거기에 없다.
- 의존성 버전 — `node_modules/<pkg>/package.json` 의 `version` 을 직접 읽었다. 선언(`^`)과 실제가 다른 것이 여럿이다.
- 줄 수 — `wc -l`·`grep -c` 실측. 공백/주석/코드 분해도 실측.
- 테스트 케이스 수와 통과 여부 — `grep -c "await it("` 로 세고, 3개 파일은 실제로 실행해 결과를 봤다.
- `npm test` 가 A-RAG 검색 테스트를 수집하지 않는다 — `scripts/run-tests.js` 의 `SUITES` 배열 31개를 전부 읽었다.
- 1.0 에 문서 단위 ACL 이 없다 — `group-store.js` 시스템 그룹 정의와 `hasPermission()` 구현을 직접 읽었다.
- `workflow/graph.js` 가 죽어 있다 — `require` 하는 곳을 전수 grep 했고 0건이다.
- 2.0 SRS 에 백엔드 TS/ESM 요구가 없다 — `docs/spec/*.md` 전체 grep 결과 5건, 전부 프론트엔드 문맥.
- MCP 도구 12개 + Context MCP 3개의 이름·입력 스키마·기본값 — `routes/mcp.js:201-465` 와 `context-mcp.js:15-84` 를 그대로 옮겼다.

### 확신도 중간 (코드 판독, 실행 미확인)
- 결함 3(절대경로 유출) — 메타데이터 스프레드 순서로 추론했다. 결함 2 때문에 현재 도달 불가라 실행으로 확인할 수 없었다.
- `resolve_project` 인덱스가 기동 후 갱신되지 않는다 — `app.js:537` 에서 `buildIndex()` 한 번 호출 외에 재호출 지점을 찾지 못했으나, 설정 핫리로드(`configWatcher`) 경로가 서버를 재시작하는지는 확인하지 않았다.
- "A-RAG 고유 로직 대 배선 비율 대략 절반" — 함수 단위로 세지 않은 인상이다. 숫자로 쓸 값이 아니다.

### 못 본 것 · 확인 못 함
- **`test/chatbot/*` 전체를 읽지 않았다.** `run-tests.js` SUITES 에 챗봇 테스트가 13개 들어 있는데(agentic-graph·budget·injection-guard·security·vector-store-memory 등) 각각의 케이스 수와 커버리지를 세지 않았다. → `node test/chatbot/<파일>` 을 각각 실행하면 알 수 있다.
- **`npm test` 를 통째로 돌리지 않았다.** 31개 스위트 전체의 현재 PASS/FAIL 상태를 모른다. → `npm test` 로 확인 가능(단 최대 31×30초).
- **실제 운용 인덱스의 규모.** `data/vector/metadata.json` 을 읽지 않았다 — 문서 수·청크 수·삭제 비율을 알면 컴팩션 빈도와 HNSWLib 유지/교체 판단의 근거가 생긴다. → 그 파일의 `stats` 를 읽으면 된다.
- **semantic 검색의 실제 품질.** 결함 1·2 때문에 실전 동작한 적이 없으므로 **비교 기준이 존재하지 않는다.** "1.0 보다 잘 만들 수 있는가" 의 semantic 축은 비교 대상이 없는 셈이다.
- **SQLite FTS5 의 한국어 토크나이징 실효성.** §C-3 의 전제인데 실측하지 않았다. `unicode61`/trigram 조합으로 한국어 검색 품질이 나오는지는 별도 실험이 필요하다.
- **리랭커 배포 가능 여부.** §C-5 의 전제. 사내 GPU/vLLM 여유는 인프라 담당에게 물어야 안다.
- **2.0 이 다룰 문서 수 상한.** `CON-ARCH-001` 이 사람 수만 전제한다. 이 값 없이 §C-6 의 저장소 선택(HNSWLib 유지 vs sqlite-vec)을 결정할 수 없다.
- **2.0 이 내장 챗봇 UI 를 갖는가.** `FR-ARCH-001` Implementation Notes 가 명시적으로 미정으로 남겼다. 이것이 정해져야 §A-2 의 2,074줄(agentic-graph 668 + prompts 669 + state 383 + 안전장치 일부) 이식 여부가 결정된다.
- **`SEC-STORAGE-007` 의 "동기 갱신" 해석.** 1.0 의 소프트삭제는 벡터를 인덱스에 남기므로 문면 그대로는 충족하지 못한다. 조회 시점 배제로 갈음되는지는 SRS 소유자 판단이 필요하다.
