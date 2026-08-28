import { Router } from 'express';
import type { Request } from 'express';

import { authenticateToken, type TokenStores } from '../../app/auth/token-service.js';
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
  stores: TokenStores;
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
      const params = (body.params ?? {}) as { name?: unknown };
      const tool = typeof params.name === 'string' ? byName.get(params.name) : undefined;
      if (tool === undefined) {
        res.status(400).json({
          jsonrpc: '2.0',
          id,
          error: { code: RPC.invalidParams, message: '그런 도구가 없다' },
        });
        return;
      }

      // 실행은 아직 없다. 이 자리는 인가와 도구 구현이 함께 채운다.
      res.status(501).json({
        jsonrpc: '2.0',
        id,
        error: { code: RPC.methodNotFound, message: '아직 구현되지 않은 도구다' },
      });
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
