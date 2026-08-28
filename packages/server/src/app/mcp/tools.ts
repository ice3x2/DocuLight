/**
 * MCP 도구 목록 — 1.0 의 계약을 이름·인자·기본값 그대로 물려받는다
 * (`FR-ARCH-001` AC-1).
 *
 * 물려받는 것은 **계약**이지 구현이 아니다 (AC-3). 1.0 의 소스를 옮겨 온
 * 파일이 이 패키지에 없고, 각 도구의 동작은 2.0 의 저장소·ACL 위에서 새로
 * 선다.
 *
 * 1.0 의 두 번째 표면(`POST /context`)이 무인증으로 열던 도구 셋 중 고유한
 * 둘은 **이 목록으로 흡수한다**. 별도 표면을 두면 그것이 곧
 * `SEC-ARCH-001` AC-2 가 금지하는 무인증 도구가 되고, 기능을 버리면 1.0 이
 * 하던 일이 사라진다. 셋째 `read_document` 는 이름이 겹쳐 그대로 합쳐진다.
 */

/** 도구 인자 하나의 계약. 기본값이 있으면 그 값도 계약의 일부다. */
export interface McpToolArgument {
  readonly name: string;
  readonly type: 'string' | 'integer' | 'boolean';
  readonly required: boolean;
  readonly description: string;
  readonly default?: string | number | boolean;
  /** 값을 이 목록으로 제한한다. 1.0 의 enum 인자가 쓴다. */
  readonly enum?: readonly string[];
}

export interface McpTool {
  readonly name: string;
  readonly description: string;
  readonly args: readonly McpToolArgument[];
  /**
   * 이 도구가 저장소를 바꾸는가.
   *
   * 쓰기 도구는 **실행 자체를 막는다** (`SEC-ARCH-003`) — 결과를 걸러 내는
   * 것으로는 부족하다. 읽기는 걸러도 상태가 남지 않지만 쓰기는 이미 바뀐
   * 뒤라 되돌릴 것이 생긴다.
   */
  readonly writes: boolean;
}

/**
 * 1.0 의 도구 이름 접두 규칙 (`sanitizeForToolName`).
 *
 * 공백은 밑줄로, 영숫자와 밑줄이 아닌 글자는 버리며, 남는 것이 없으면
 * `DocuLight` 다. 이름이 계약이므로 이 규칙도 계약이다 — 접두가 달라지면
 * 1.0 을 쓰던 에이전트의 도구 호출이 이름에서 어긋난다.
 */
export function sanitizeForToolName(title: string): string {
  const cleaned = title.replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]/g, '');
  return cleaned === '' ? 'DocuLight' : cleaned;
}

const PATH_ROOT: McpToolArgument = {
  name: 'path',
  type: 'string',
  required: false,
  default: '/',
  description: '대상 경로. 생략하면 뿌리부터.',
};

/** 접두를 받아 도구 목록을 세운다. 목록은 호출자마다 달라지지 않는다. */
export function mcpTools(prefix: string): readonly McpTool[] {
  return [
    {
      name: 'list_documents',
      description: '지정 디렉터리를 한 단계만 나열한다. 내용은 읽지 않는다.',
      writes: false,
      args: [
        PATH_ROOT,
        {
          name: 'useDisplayName',
          type: 'boolean',
          required: false,
          default: false,
          description: '참이면 프론트매터의 title 을 이름으로 보인다.',
        },
      ],
    },
    {
      name: 'list_full_tree',
      description: '재귀 트리를 경로만으로 돌려준다. 큰 컬렉션에서는 응답이 커진다.',
      writes: false,
      args: [
        PATH_ROOT,
        {
          name: 'maxDepth',
          type: 'integer',
          required: false,
          description: '내려갈 깊이. 생략하면 전체 깊이.',
        },
        {
          name: 'useDisplayName',
          type: 'boolean',
          required: false,
          default: false,
          description: '참이면 프론트매터의 title 을 이름으로 보인다.',
        },
      ],
    },
    {
      name: 'read_document',
      description:
        '문서 전문을 읽는다. 토큰을 많이 쓰므로 query_document 나 summarize_document 를 먼저 고려하라.',
      writes: false,
      args: [{ name: 'path', type: 'string', required: true, description: '읽을 문서의 경로.' }],
    },
    {
      name: 'create_document',
      description: '문서를 새로 만들거나 덮어쓴다. 상위 디렉터리는 자동으로 만든다.',
      writes: true,
      args: [
        { name: 'path', type: 'string', required: true, description: '만들 문서의 경로.' },
        { name: 'content', type: 'string', required: true, description: '마크다운 본문.' },
      ],
    },
    {
      name: 'delete_document',
      description: '문서를 지운다.',
      writes: true,
      args: [{ name: 'path', type: 'string', required: true, description: '지울 문서의 경로.' }],
    },
    {
      name: `${prefix}_get_config`,
      description: '서버 설정을 돌려준다. 비밀값은 가린 채로 나간다.',
      writes: false,
      args: [
        {
          name: 'section',
          type: 'string',
          required: false,
          default: 'all',
          enum: ['ui', 'security', 'ssl', 'all'],
          description: '돌려받을 구획.',
        },
      ],
    },
    {
      name: `${prefix}_search`,
      description: '이름·제목·본문을 훑는 키워드 검색.',
      writes: false,
      args: [
        { name: 'query', type: 'string', required: true, description: '찾을 말. 두 글자 이상.' },
        {
          name: 'limit',
          type: 'integer',
          required: false,
          default: 10,
          description: '결과 상한. 1 에서 100 사이로 맞춘다.',
        },
        PATH_ROOT,
        {
          name: 'mode',
          type: 'string',
          required: false,
          default: 'snippets',
          enum: ['titles_only', 'snippets', 'full_context'],
          description: '결과를 어느 정도로 실을 것인가.',
        },
      ],
    },
    {
      name: 'query_document',
      description: '한 문서를 섹션으로 쪼개 질의에 가까운 것부터 예산 안에서 고른다.',
      writes: false,
      args: [
        { name: 'path', type: 'string', required: true, description: '대상 문서의 경로.' },
        { name: 'query', type: 'string', required: true, description: '질의.' },
        {
          name: 'maxTokens',
          type: 'integer',
          required: false,
          default: 2000,
          description: '토큰 예산.',
        },
      ],
    },
    {
      name: 'summarize_document',
      description: '전문을 읽지 않고 제목·차례·요점·통계로 구조만 돌려준다.',
      writes: false,
      args: [{ name: 'path', type: 'string', required: true, description: '대상 문서의 경로.' }],
    },
    {
      name: `${prefix}_smart_search`,
      description: '의미 검색과 키워드 검색을 함께 쓰는 문서 횡단 검색.',
      writes: false,
      args: [
        { name: 'query', type: 'string', required: true, description: '질의.' },
        PATH_ROOT,
        {
          name: 'mode',
          type: 'string',
          required: false,
          default: 'auto',
          enum: ['auto', 'semantic', 'keyword'],
          description: '어느 경로로 찾을 것인가.',
        },
        {
          name: 'maxTokens',
          type: 'integer',
          required: false,
          default: 2000,
          description: '토큰 예산.',
        },
        { name: 'limit', type: 'integer', required: false, default: 5, description: '결과 상한.' },
      ],
    },
    {
      name: 'resolve_project',
      description: '프로젝트나 라이브러리 이름을 문서 경로로 해석한다.',
      writes: false,
      args: [
        { name: 'name', type: 'string', required: true, description: '찾을 이름.' },
        {
          name: 'version',
          type: 'string',
          required: false,
          description: '판 번호. 생략하면 전 판.',
        },
        { name: 'limit', type: 'integer', required: false, default: 5, description: '결과 상한.' },
      ],
    },
    {
      name: 'query_code_examples',
      description: '문서에서 코드 블록을 뽑아 질의에 가까운 것부터 돌려준다.',
      writes: false,
      args: [
        { name: 'query', type: 'string', required: true, description: '질의.' },
        PATH_ROOT,
        {
          name: 'language',
          type: 'string',
          required: false,
          description: '언어로 거른다. 생략하면 전체.',
        },
        {
          name: 'maxTokens',
          type: 'integer',
          required: false,
          default: 3000,
          description: '토큰 예산.',
        },
        { name: 'limit', type: 'integer', required: false, default: 10, description: '결과 상한.' },
      ],
    },
    // 아래 둘은 1.0 의 무인증 표면(`POST /context`)에만 있던 도구다. 표면을
    // 없애고 도구만 이 목록으로 옮겨 인증 뒤에 세운다.
    {
      name: 'list_context_documents',
      description: '프론트매터에 description 이 있는 문서만 나열한다.',
      writes: false,
      args: [PATH_ROOT],
    },
    {
      name: 'search_documents',
      description: '본문에서 글자를 찾아 앞뒤 문맥과 함께 돌려준다.',
      writes: false,
      args: [
        { name: 'query', type: 'string', required: true, description: '찾을 글자.' },
        {
          name: 'context_chars',
          type: 'integer',
          required: false,
          default: 50,
          description: '매치 앞뒤로 실을 글자 수.',
        },
        {
          name: 'case_sensitive',
          type: 'boolean',
          required: false,
          default: false,
          description: '대소문자를 가릴 것인가.',
        },
        PATH_ROOT,
        {
          name: 'max_results',
          type: 'integer',
          required: false,
          default: 10,
          description: '파일마다의 결과 상한.',
        },
      ],
    },
  ];
}
