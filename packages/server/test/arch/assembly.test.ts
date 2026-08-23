import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **부품이 제품 조립에 들어가 있는가** (`SEC-AUTH-010` AC-1 의 근본 원인 대책).
 *
 * 2026-08-24 실측: 인증 네 축의 서비스가 전부 서 있는데 어느 것도 라우트에
 * 닿지 않아, 새 인스턴스가 최초 슈퍼유저를 만들 수 없었다. 그 서비스들의
 * 단위 시험은 **전부 통과하고 있었다** — 부품의 옳음과 부품이 꽂혔는가는
 * 다른 질문이고, 후자를 재는 시험이 하나도 없었다.
 *
 * **판정은 「누가 가리키는가」가 아니라 「진입점에서 도달하는가」다.** 전자로
 * 재면 라우트 파일이 서비스를 부르기만 해도 통과하는데, 그 라우트를 아무도
 * 붙이지 않으면 둘 다 죽은 코드다 — 이 결함이 정확히 그 모양이었다.
 *
 * 목록이 **줄어드는 것**이 다음 wave 의 정의이며, 사유 없이 늘리면 그 순간
 * 이 방벽이 영구 면제 목록이 된다.
 */

const SRC = resolve(import.meta.dirname, '..', '..', 'src');
const ENTRY = join(SRC, 'main.ts');

/**
 * 아직 제품 조립에 들어가지 않은 서비스와 **그것을 받을 자리**.
 *
 * 사유를 함께 적는 이유는 빈 허용목록이 곧 「나중에」가 되기 때문이다 —
 * 어느 작업이 이 줄을 지우는지가 적혀 있어야 그 작업이 실제로 온다.
 */
const 아직_배선되지_않음: ReadonlyMap<string, string> = new Map([
  ['app/auth/signup-service.ts', '가입 신청·승인 라우트와 두 화면이 아직 없다'],
  ['app/auth/password-service.ts', '비밀번호 변경 라우트와 설정 모달의 계정 패널이 아직 없다'],
  ['app/auth/token-service.ts', 'PAT 라우트와 설정 모달의 액세스 토큰 패널이 아직 없다'],
  [
    'app/audit/audit-retention.ts',
    '감사 보존 일소를 도는 자리가 없다. 휴지통 일소도 같은 상태이며 그쪽은 모듈이 다른 export 로 도달해 이 방벽이 못 잡는다 — 두 축을 한 주기 작업으로 함께 세워야 한다',
  ],
  [
    'http/routes/documents.ts',
    '문서 원문 서빙 라우터가 apiRouter 에 붙지 않았다. 그 자리는 워크스페이스+경로 축이며 workspace-api 의 노드 ID 축과 다르다 — 붙이는 wave 가 SEC-STORAGE-006 서빙 가드와 함께 판정한다',
  ],
  [
    'http/guards/fail-closed.ts',
    'SEC-STORAGE-006 · R55-b 의 fail-closed 서빙 가드. documents.ts 만이 이것을 쓰므로 그 라우터가 붙는 순간 함께 도달한다 — 두 줄은 한 작업이다',
  ],
  [
    'http/guards/dot-path-guard.ts',
    'SEC-STORAGE-004 · R64 의 점 경로 거부 가드. 같은 사유로 documents.ts 와 함께 선다',
  ],
]);

/**
 * **이 방벽이 못 잡는 것.**
 *
 * 판정 단위가 **파일 도달**이라 둘을 못 잡는다.
 *
 * ① 한 모듈의 다른 export 가 도달하면 그 안의 죽은 함수는 보이지 않는다.
 *    `sweepExpiredTrash` 가 그 경우다 — `trash-service.ts` 는 `moveToTrash`
 *    로 도달하지만 그 일소를 부르는 제품 코드는 없다.
 * ② `import` 만 남고 `router.use(...)` 를 빠뜨리면 파일은 도달하므로 통과한다.
 *    실측한 결함은 import 자체가 없어 잡혔지만, 이 변형은 못 잡는다.
 * ③ `보는자리` 밖의 디렉터리는 아예 보지 않는다. `domain/` · `infra/` 에도
 *    도달하지 않는 파일이 있으며 이 방벽은 그것을 세지 않는다 — 그 둘은
 *    조립이 아니라 부품 계층이라 미사용이 곧 결함은 아니기 때문이지만,
 *    「전부 본다」로 읽히면 안 된다.
 *
 * 셋 다 호출 그래프가 있어야 좁힐 수 있고 그것은 이 시험의 범위를 넘는다.
 * 대신 한계를 여기 적어 두어, 이 방벽이 통과한다는 것이 「모든 부품이
 * 돈다」로 읽히지 않게 한다.
 */

/** `src` 아래 모든 `.ts`. 시험은 별도 트리에 살아 여기 들지 않는다. */
function 제품파일(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const at = join(dir, name);
    if (statSync(at).isDirectory()) return 제품파일(at);
    return name.endsWith('.ts') ? [at] : [];
  });
}

/** 이 파일이 상대 경로로 가리키는 파일들. ESM 이라 명세는 `.js` 로 적힌다. */
function 가리키는파일(path: string): string[] {
  const text = readFileSync(path, 'utf8');
  const 명세 = [...text.matchAll(/from\s+'(\.[^']+)'|import\('(\.[^']+)'\)/g)].map(
    (m) => m[1] ?? m[2] ?? '',
  );

  return 명세
    .map((one) => resolve(dirname(path), one.replace(/\.js$/, '.ts')))
    .filter((at) => existsSync(at));
}

/** 진입점에서 import 를 따라 실제로 닿는 파일 전부. */
function 도달가능(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const at = queue.pop()!;
    if (seen.has(at)) continue;
    seen.add(at);
    queue.push(...가리키는파일(at));
  }

  return seen;
}

/**
 * 방벽이 보는 자리.
 *
 * `http/` 를 통째로 보는 이유는 라우터가 붙지 않으면 그 뒤의 서비스가
 * 옳아도 아무도 닿지 못하기 때문이다 — 실제 결함이 정확히 그 모양이었고,
 * `app/` 만 보면 진입점이 서비스를 **직접** 부르는 경우에 그 구멍이 남는다.
 *
 * `routes/` 만 보다가 `guards/` 와 `middleware/` 를 빼 두었더니 미배선 보안
 * 가드 둘이 그 그늘에 숨어 있었다. 방벽이 자기 시야를 좁히면 그 좁힘 자체가
 * 다음 결함의 자리가 된다.
 */
const 보는자리 = ['app/', 'http/'];

describe('조립 방벽 — 진입점에서 닿지 않는 부품이 늘지 않는다', () => {
  it('app 과 http 가 전부 main.ts 에서 도달한다 — 허용목록에 적힌 것만 빼고', () => {
    const 닿는것 = 도달가능(ENTRY);

    const 고아 = 제품파일(SRC)
      .filter((path) => {
        const 상대 = relative(SRC, path).replace(/\\/g, '/');
        return 보는자리.some((one) => 상대.startsWith(one));
      })
      .filter((path) => !닿는것.has(path))
      .map((path) => relative(SRC, path).replace(/\\/g, '/'))
      .sort();

    // 집합을 **통째로** 단언한다. 「N개 이하」로 재면 하나가 배선되고
    // 다른 하나가 빠진 것이 상쇄되어 통과한다.
    expect(고아).toEqual([...아직_배선되지_않음.keys()].sort());
  });

  it('허용목록의 모든 항목에 사유가 적혀 있다 — 사유 없는 면제는 영구 면제가 된다', () => {
    for (const [모듈, 사유] of 아직_배선되지_않음) {
      expect([모듈, 사유.length > 10]).toEqual([모듈, true]);
    }
  });

  it('진입점이 실제로 무언가에 닿는다 — 파서가 조용히 0개를 내면 위 시험이 공짜로 참이 된다', () => {
    expect(도달가능(ENTRY).size).toBeGreaterThan(30);
  });
});
