import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { bootstrap, type ServerRuntime } from '../../../src/main.js';
import { forgetInstallTokenForTest } from '../../../src/app/install/install-service.js';

/**
 * **운영 조립이 일소의 실패를 실제로 낸다** (`REL-AUDIT-003` ·
 * `FR-STORAGE-007`).
 *
 * 옆의 단위 시험(`retention-loop.test.ts`)은 **루프가 남길 수 있는가**까지만
 * 잰다. 그 축만 재면 제품 조립이 그 자리에 빈 함수를 흘려도 전건이 통과한다 —
 * 실측했다(2026-09-02): `main.ts` 의 `{ announce: stores.announce }` 를
 * `{ announce: () => {} }` 로 바꿔도 스위트가 기준선과 한 항도 다르지 않았다.
 * 막으려는 상태가 바로 「코드는 남길 수 있는데 제품에서는 아무 데도 남지
 * 않는다」이므로, 그 상태를 재는 항이 없으면 그 자리는 닫히지 않는다.
 *
 * **이 항이 그 자리를 닫는다.** 같은 탐침을 이 파일이 선 뒤에 다시 걸어
 * 확인했다(2026-09-02): `{ announce: () => {} }` 로 바꾸면 `tsc --noEmit` 은
 * 여전히 exit=0 인데 이 항이 죽는다 (1397 통과 / 1 실패 → 1396 통과 / 2 실패).
 * 이 파일을 옮기거나 기다림을 손보는 사람은 그 탐침을 다시 걸어, 재고 있다는
 * 사실이 아직 사실인지 확인한다.
 *
 * **필수 인자화로는 이 축이 서지 않는다.** 인자를 빠뜨린 조립은 `tsc` 가
 * 막지만, 그 자리에 무해해 보이는 `() => {}` 가 들어가는 경로는 컴파일도
 * 시험도 통과한다. 같은 계열을 이미 한 번 겪었다 — `onRun` 이 실패를 실어
 * 보낼 수 있었는데 제품 조립이 그것을 넘기지 않아, 일소가 한 건도 지우지
 * 못하는 전면 장애가 배포 주기 내내 로그 한 줄 없이 가려졌다.
 *
 * 선례는 `test/app/auth/install-console.test.ts` 다 — 그쪽도 진짜 런타임을
 * 띄우고 콘솔을 가로채 **제품이 실제로 내는가**를 잰다. 조립 방벽
 * (`test/arch/assembly.test.ts`)으로는 이 축이 서지 않는다: 그 방벽의 판정
 * 단위는 **파일 도달**이라, 같은 모듈의 다른 export 가 도달하면 그 안에서
 * 무엇이 어떻게 배선됐는지를 보지 못한다.
 */
let dir: string;
let runtime: ServerRuntime | null;
let 콘솔: ReturnType<typeof vi.spyOn>;

const 출력 = () => 콘솔.mock.calls.map((one: unknown[]) => String(one[0])).join('\n');

/**
 * 그 줄이 설 때까지 기다린다.
 *
 * 회차가 **실제 타이머** 위에서 돈다 — 기동이 파일시스템과 SQLite 를 실제로
 * 만지므로 가짜 시계를 세우면 기동 자체가 멈춘다. 그래서 시각을 앞당기는
 * 대신 결과를 기다린다.
 */
const 기다린다 = async (술어: () => boolean, 한계 = 5000): Promise<void> => {
  const 끝 = Date.now() + 한계;
  while (!술어() && Date.now() < 끝) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-retention-assembly-'));
  forgetInstallTokenForTest();
  runtime = null;
  콘솔 = vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (runtime !== null) await runtime.close();
  forgetInstallTokenForTest();
  await rm(dir, { recursive: true, force: true });
});

describe('REL-AUDIT-003 · FR-STORAGE-007 — 운영 조립이 일소의 실패를 운영자에게 낸다', () => {
  it('제품이 만든 런타임에서 감사 일소가 터지면 그 사유가 서버 콘솔에 나온다', async () => {
    const 사유 = '만료 행을 참조가 붙들고 있다';

    runtime = await bootstrap({
      docsRoot: join(dir, 'docs'),
      databaseFile: join(dir, 'db', 'doculight.db'),
    });

    // **여기서 터뜨린다.** 루프의 첫 회차는 `setTimeout(…, 0)` 이라 이
    // 줄보다 **뒤에** 돈다 — 타이머는 매크로태스크고 `await bootstrap` 의
    // 재개는 마이크로태스크이므로 순서가 뒤집히지 않는다. 그 순서가 언젠가
    // 깨지면 이 항은 조용히 통과하는 것이 아니라 **기다리다 죽는다**:
    // 다음 회차는 한 시간 뒤라 그 사이에 아무 줄도 서지 않는다.
    //
    // 저장소를 갈아 끼우는 이유는, 일소를 **밖에서 부르는 경로가 제품에
    // 없기** 때문이다. 부르는 자리는 루프의 타이머 하나이고 그 손잡이는
    // `stop()` 뿐이라, 실패를 만들려면 회차가 읽는 값을 바꾸는 수밖에 없다.
    vi.spyOn(runtime.stores.auditRetention, 'purgeBefore').mockImplementation(() => {
      throw new Error(사유);
    });

    await 기다린다(() => 출력().includes(사유));

    // 사유가 콘솔에 닿는 길은 `stores.announce` 하나다 — 이 단언이
    // 서려면 조립이 그 함수를 실제로 넘겨야 한다.
    expect(출력()).toContain(사유);
    // 어느 쪽이 죽었는지도 함께 있어야 운영자가 다음에 무엇을 볼지 안다.
    expect(출력()).toMatch(/감사.*일소.*실패/);
  });
});
