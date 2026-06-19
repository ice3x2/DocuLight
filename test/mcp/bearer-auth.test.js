'use strict';

/**
 * bearer-auth.test.js
 *
 * MCP validateApiKey 는 일반 API 경로(auth.js)와 동일하게
 * X-API-Key 헤더와 Authorization: Bearer 토큰을 모두 허용해야 한다.
 *
 * 배경: validateApiKey 가 X-API-Key 만 읽어 Bearer 클라이언트(예: Claude Code)
 * 의 모든 도구 호출이 requireReadLogin=true 에서 UNAUTHORIZED 로 거부됐다.
 *
 * Acceptance: exits 0 and prints "All MCP Bearer auth tests passed"
 */

const assert = require('assert');
const crypto = require('crypto');
const createMcpRouter = require('../../src/routes/mcp');

const { validateApiKey } = createMcpRouter;

console.log('Running MCP Bearer auth tests...\n');

const USER_KEY = 'unit-test-user-key';
const keyHash = crypto.createHash('sha256').update(USER_KEY).digest('hex');

const stores = {
  userStore: {
    getUserCount: () => 1,
    findByUserKeyHash: (h) =>
      h === keyHash ? { id: 'u1', email: 'tester@example.com', groupId: 'g1', status: 'active' } : null
  },
  groupStore: {
    findById: (id) => (id === 'g1' ? { id: 'g1', permissions: ['read', 'write'] } : null)
  }
};

function mockReq({ apiKey, bearer }) {
  const headers = {};
  if (apiKey) headers['x-api-key'] = apiKey;
  if (bearer) headers['authorization'] = `Bearer ${bearer}`;
  return {
    header(name) {
      return headers[name.toLowerCase()];
    },
    headers,
    app: { locals: { stores } }
  };
}

// Test 1: X-API-Key 헤더 인증 (회귀 방지)
{
  const result = validateApiKey(mockReq({ apiKey: USER_KEY }), {});
  assert.strictEqual(result.valid, true, 'X-API-Key should authenticate');
  assert.strictEqual(result.user.email, 'tester@example.com');
  console.log('✅ Test 1: X-API-Key header authenticates');
}

// Test 2: Authorization: Bearer 헤더 인증 (이번 수정의 핵심)
{
  const result = validateApiKey(mockReq({ bearer: USER_KEY }), {});
  assert.strictEqual(result.valid, true, 'Authorization: Bearer should authenticate');
  assert.strictEqual(result.user.email, 'tester@example.com');
  console.log('✅ Test 2: Authorization Bearer header authenticates');
}

// Test 3: 자격증명 없음 → invalid
{
  const result = validateApiKey(mockReq({}), {});
  assert.strictEqual(result.valid, false, 'no credentials should fail');
  assert.ok(/X-API-Key header is required/.test(result.error), 'error message preserved');
  console.log('✅ Test 3: missing credentials are rejected');
}

console.log('\n✅ All MCP Bearer auth tests passed!');
