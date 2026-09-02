import { Router } from 'express';
import type { Request } from 'express';

import { authenticateToken, type TokenStores } from '../../app/auth/token-service.js';
import { callTool, type DispatchStores, type ToolRule } from '../../app/mcp/dispatch.js';
import { mcpTools, sanitizeForToolName, type McpTool } from '../../app/mcp/tools.js';
import type { TokenScope } from '../../domain/auth/token-scope.js';
import type { PrincipalId } from '../../domain/principal/principal.js';

/**
 * MCP 표면 (`SEC-ARCH-001` · `IR-AUTH-002`).
 *
 * **인증이 가장 앞이다.** 도구 종류로 갈리지 않는다 — 1.0 은 read 계열만
 * 게이트 뒤에 두고 그 게이트조차 설정으로 끌 수 있었으며, `POST /context`
 * 라는 두 번째 표면은 아예 인증이 없었다. 문서별 ACL 이 핵심인 2.0 에서는
 * 그 전제가 깨진다: 인증이 없으면 뒤따르는 ACL 필터와 쓰기 권한 검사가
 * 판정할 주체 자체를 갖지 못한다.
 *
 * **표면은 이 하나다.** 두 번째 표면을 두지 않는 것이 `SEC-ARCH-001` AC-2
 * 를 지키는 방법이다 — 목록을 아무리 훑어도 목록 밖의 표면은 잡히지 않는다.
 */

/** 인증을 통과한 호출자. 도구는 이 주체의 권한으로만 돈다. */
export interface McpSubject {
  readonly userId: PrincipalId;
  readonly scope: TokenScope;
}

export interface McpDeps {
  stores: TokenStores & DispatchStores;
  /**
   * 도구 이름의 접두 (`FR-ARCH-001` AC-1).
   *
   * 1.0 은 이것을 UI 제목에서 만들었다. 이름이 계약이므로 접두도 계약이며,
   * 생략하면 `sanitizeForToolName` 의 기본값이 선다.
   */
  toolPrefix?: string;
}

/** JSON-RPC 2.0 오류 코드 — 표준이 정한 값이다. */
const RPC = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
} as const;

/**
 * `Authorization: Bearer <PAT>` 에서 평문을 꺼낸다.
 *
 * **쿠키를 보지 않는다** (`IR-AUTH-002` AC-4). 브라우저 세션으로 이 표면이
 * 열리면 사용자가 로그인한 채 다른 사이트를 여는 것만으로 그 사이트가
 * 사용자의 권한으로 도구를 부른다 — PAT 는 브라우저가 자동으로 싣지 않아
 * 그 경로가 서지 않는다.
 */
function bearerOf(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return undefined;

  const [scheme, ...rest] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer') return undefined;

  const plain = rest.join(' ').trim();
  return plain === '' ? undefined : plain;
}

function subjectOf(stores: TokenStores, req: Request): McpSubject | undefined {
  const plain = bearerOf(req);
  if (plain === undefined) return undefined;

  // 존재·미폐기·미만료·계정 열림 네 관문은 이미 한 자리에 있다
  // (`SEC-AUTH-006` · `SEC-AUTH-009`). 여기서 다시 세우면 두 곳이 같은
  // 책임을 나눠 갖고, 한쪽만 고쳐진다.
  return authenticateToken(stores, plain);
}

/**
 * 1.0 전역 API Key 를 실은 요청인가 (`MIG-AUTH-002` AC-4 · AC-5).
 *
 * 1.0 은 이 헤더 하나로 전역 키를 받았다(1.0 `src/middleware/auth.js`).
 * 2.0 은 그 값을 **자격증명으로 읽지 않는다** — 주체가 없는 공유 비밀로는
 * `effectiveLevel(사용자, 노드)` 판정 자체가 불가능하기 때문이다(원장
 * `R58`). 읽는 것은 값이 아니라 **그 헤더가 왔다는 사실**뿐이고, 그것은
 * 자격이 아니라 보낸 쪽이 1.0 클라이언트라는 표식이다.
 *
 * 값을 보지 않는 것이 중요하다 — 값을 대조하는 순간 그 헤더가 자격증명이
 * 되고, 유예 없이 폐기하기로 한 것(AC-4)이 조용히 되살아난다.
 */
function carriesLegacyApiKey(req: Request): boolean {
  return typeof req.headers['x-api-key'] === 'string';
}

/**
 * 1.0 클라이언트에게 보내는 갈아타기 안내 (`MIG-AUTH-002` AC-5).
 *
 * 발급 **화면**을 가리킨다. 그 표면이 서기 전에는 가리키지 않았고 그것이
 * 옳았다 — 없는 화면을 가리키는 안내는 안내가 아니라 오도이기 때문이다.
 * 그러나 그 선택은 「발급받으십시오」를 **수행 불가능한 지시**로 남겼고,
 * `SEC-AUTH-007` AC-1 의 발급 경로가 서면서 그 사정이 풀렸다.
 *
 * 화면 이름을 지목하되 URL 을 싣지 않는다 — 이 응답은 배포 오리진을 모르고,
 * 틀린 주소는 없는 화면을 가리키는 것과 같은 실패다.
 */
const LEGACY_KEY_GUIDANCE =
  '1.0 전역 API Key 는 이행 시점부터 인정되지 않습니다. 유예 기간은 없습니다. ' +
  '설정 › 개인 › 액세스 토큰에서 개인 액세스 토큰(PAT)을 발급받아 ' +
  'Authorization: Bearer 헤더로 보내십시오.';

interface RpcRequest {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

export function mcpRouter(deps: McpDeps): Router {
  const router = Router();
  const tools = mcpTools(deps.toolPrefix ?? sanitizeForToolName(''));
  const byName = new Map<string, McpTool>(tools.map((one) => [one.name, one]));

  router.post('/mcp', (req, res) => {
    // **인증이 먼저다.** 본문을 해석하기 전에 막는다 — 뒤에 두면 해석
    // 단계의 오류 응답이 인증 없이 나가고, 그 응답의 차이가 표면의 모양을
    // 알려 준다.
    const subject = subjectOf(deps.stores, req);
    if (subject === undefined) {
      // 거부는 같고 안내만 붙는다 — 안내가 붙는다고 통과하지 않는다.
      if (carriesLegacyApiKey(req)) {
        res.status(401).json({ error: { message: LEGACY_KEY_GUIDANCE } });
        return;
      }
      res.sendStatus(401);
      return;
    }

    const body = req.body as RpcRequest;
    if (body === null || typeof body !== 'object' || body.jsonrpc !== '2.0') {
      res.status(400).json({
        jsonrpc: '2.0',
        id: null,
        error: { code: RPC.invalidRequest, message: 'jsonrpc 2.0 요청이 아니다' },
      });
      return;
    }

    const id = body.id ?? null;

    if (body.method === 'tools/list') {
      res.json({
        jsonrpc: '2.0',
        id,
        result: {
          tools: tools.map((one) => ({
            name: one.name,
            description: one.description,
            inputSchema: schemaOf(one),
          })),
        },
      });
      return;
    }

    if (body.method === 'tools/call') {
      const params = (body.params ?? {}) as { name?: unknown; arguments?: unknown };
      const tool = typeof params.name === 'string' ? byName.get(params.name) : undefined;
      if (tool === undefined) {
        res.status(400).json({
          jsonrpc: '2.0',
          id,
          error: { code: RPC.invalidParams, message: '그런 도구가 없다' },
        });
        return;
      }

      const args =
        typeof params.arguments === 'object' && params.arguments !== null
          ? (params.arguments as Record<string, unknown>)
          : {};

      void callTool(deps.stores, subject, tool, args).then(
        (outcome) => {
          if (outcome.ok) {
            res.json({ jsonrpc: '2.0', id, result: outcome.result });
            return;
          }
          const [status, message] = failureOf(outcome.rule);
          res.status(status).json({
            jsonrpc: '2.0',
            id,
            error: { code: RPC.invalidParams, message },
          });
        },
        () => {
          res.status(500).json({
            jsonrpc: '2.0',
            id,
            error: { code: RPC.invalidRequest, message: '도구 실행이 실패했다' },
          });
        },
      );
      return;
    }

    res.status(400).json({
      jsonrpc: '2.0',
      id,
      error: { code: RPC.methodNotFound, message: '그런 메서드가 없다' },
    });
  });

  return router;
}

/**
 * 실패를 응답으로 옮긴다.
 *
 * **`not-found` 와 `forbidden` 이 같은 값으로 나간다** (`SEC-ACL-006` AC-5).
 * 사유가 갈리면 그 차이가 곧 존재 여부를 알려 주는 신호가 되므로, 권한이
 * 없어 못 보는 것과 애초에 없는 것이 글자까지 같은 응답을 받는다. 그래서
 * 403 을 쓰지 않는다 (AC-3).
 */
function failureOf(rule: ToolRule): [number, string] {
  switch (rule) {
    case 'missing-argument':
      return [400, '인자가 모자란다'];
    case 'not-implemented':
      return [501, '아직 구현되지 않은 도구다'];
    default:
      return [404, '그런 문서가 없다'];
  }
}

/** 도구 인자를 JSON Schema 로 옮긴다. MCP 클라이언트가 이 모양을 읽는다. */
function schemaOf(tool: McpTool): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const arg of tool.args) {
    properties[arg.name] = {
      type: arg.type,
      description: arg.description,
      ...(arg.default === undefined ? {} : { default: arg.default }),
      ...(arg.enum === undefined ? {} : { enum: [...arg.enum] }),
    };
  }

  return {
    type: 'object',
    properties,
    required: tool.args.filter((one) => one.required).map((one) => one.name),
  };
}
