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
  [
    'http/guards/dot-path-guard.ts',
    'SEC-STORAGE-004 · R64 의 점 경로 거부 가드. documents.ts 에 한 겹 더 두어 봤으나 그 호출을 무력화해도 죽는 항이 없었다(2026-09-01 탐침) — isServable 이 같은 것을 이미 막는다. 이 모듈이 값을 하는 것은 EXEMPT_ENDPOINTS 가 채워질 때이며, 첨부 다운로드와 휴지통·버전 API 가 각자 자기를 등록하면서 함께 도달한다',
  ],
  [
    'app/migration/migrate-accounts.ts',
    'MIG-AUTH-002 의 일회성 이행 도구다. 제품 조립에 상시로 걸지 않는 것이 결정이며(MIG-AUTH-001 AC-3 이 「일회성」을 명시한다), 그 자리는 src/migrate.ts 다 — 그 진입점에서 실제로 도달하는지는 아래 별도 항이 잰다',
  ],
  [
    'app/migration/migrate-content.ts',
    'MIG-AUTH-001 AC-3 의 일회성 콘텐츠 이행. 위와 같은 진입점을 공유하며 같은 항이 그 도달을 잰다',
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
 * ④ `import type` 과 값 import 를 구별하지 않는다. 타입으로만 참조되는
 *    파일이 「조립됐다」로 판정되므로, 그 한 줄로 이 방벽을 만족시킬 수
 *    있다. 지금은 그렇게 도달하는 파일이 0건이라 실제 오판은 없다.
 *
 * 넷 다 호출 그래프가 있어야 좁힐 수 있고 그것은 이 시험의 범위를 넘는다.
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

  it('허용목록의 사유가 **검증 가능한 참조**를 담는다 — 길이만 재면 틀린 사유가 통과한다', () => {
    // 실제로 한 사유가 「documents.ts 와 함께 선다」고 적었는데 그 파일은
    // 그것을 부르지 않았다. 길이 잣대는 그 거짓을 여유롭게 통과시켰고,
    // 틀린 사유는 없는 사유보다 나쁘다.
    //
    // **파일명은 참조로 치지 않는다.** 파일명을 허용하면 바로 그 거짓
    // 문장(「documents.ts 와 함께 선다」)이 그대로 다시 통과한다 — 실측으로
    // 확인했다. 파일명은 저장소 안에서만 뜻이 통하고 옮기면 조용히
    // 무의미해지는 반면, 요구 ID 와 원장 조항은 그 자리에 무엇이 서야
    // 하는지를 **밖에서 확인할 수 있게** 가리킨다.
    const 검증가능한참조 = /[A-Z]+-[A-Z]+-\d+|\bR\d+/;
    for (const [모듈, 사유] of 아직_배선되지_않음) {
      expect([모듈, 검증가능한참조.test(사유)]).toEqual([모듈, true]);
    }
  });

  it('허용목록의 모듈이 전부 실존한다 — 사라진 파일이 면제로 남으면 그 줄이 영구 통과한다', () => {
    for (const 모듈 of 아직_배선되지_않음.keys()) {
      expect([모듈, existsSync(join(SRC, 모듈))]).toEqual([모듈, true]);
    }
  });

  /**
   * 이행 도구는 `main.ts` 에서 닿지 않는 것이 **맞다** — 그래서 허용목록에
   * 있다. 그러나 허용목록은 「닿지 않아도 된다」만 말하고 「어디선가는
   * 닿는다」를 말하지 않는다. 그 자리를 못박지 않으면 위 두 줄이 죽은 코드의
   * 영구 면제가 된다.
   */
  it('이행 도구가 이행 진입점에서 전부 도달한다 — 상시 배선하지 않는 대신 그 자리를 못박는다', () => {
    // 목록을 여기 적는다. 허용목록에서 접두로 걸러 오면 새 면제가 그 접두를
    // 쓰는 순간 이 항의 분모에 조용히 들어오고, 그 파일이 실제로 이행
    // 진입점에서 닿는지 아무도 정하지 않은 채 요구된다.
    const 이행진입점에서_닿아야_하는_것 = [
      'app/migration/migrate-accounts.ts',
      'app/migration/migrate-content.ts',
      'app/search/index-node.ts',
    ];

    const 이행진입점 = join(SRC, 'migrate.ts');
    expect([이행진입점, existsSync(이행진입점)]).toEqual([이행진입점, true]);

    const 닿는것 = 도달가능(이행진입점);
    for (const 모듈 of 이행진입점에서_닿아야_하는_것) {
      expect([모듈, 닿는것.has(join(SRC, 모듈))]).toEqual([모듈, true]);
    }
  });

  it('진입점이 실제로 무언가에 닿는다 — 파서가 조용히 0개를 내면 위 시험이 공짜로 참이 된다', () => {
    expect(도달가능(ENTRY).size).toBeGreaterThan(30);
  });
});
