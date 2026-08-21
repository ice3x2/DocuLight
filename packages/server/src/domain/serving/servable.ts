import { isHiddenName } from '../naming/hidden-name-rule.js';
import type { NodeRecord } from '../ports/node-repository.js';
import { ARCHIVE_DIRECTORY } from '../workspace/archive.js';

/**
 * 권한 **이전**의 관문 셋 — 이 세 규칙의 **단 하나의 정의 자리**다.
 *
 * 「이 노드를 내보내도 되는가」는 두 질문의 곱이다: 관문을 통과하는가(여기)와
 * 요청자에게 권한이 있는가(`effectivePermission`). 둘을 각각 다른 함수가
 * 답하면 한쪽만 부르는 호출자가 생기고, 그 호출자는 자기가 무엇을
 * 빠뜨렸는지 모른다 — 실제로 그렇게 갈렸었다.
 *
 * 관문 셋:
 * 1. **tombstone** — 레코드는 남았지만 대응 파일이 없다. 열면 사라진 파일을
 *    읽으려다 터진다 (`REL-STORAGE-001` AC-2). 잎만 본다: 조상까지 보면
 *    잠시 사라진 디렉토리 하나가 그 아래 전부를 닫는다.
 * 2. **점으로 시작하는 자리** — 제품이 자기 것으로 쓰는 예약 네임스페이스다
 *    (`SEC-STORAGE-004`). **조상까지** 본다: 세그먼트 하나만 보면
 *    `.obsidian/workspace.json` 이 그대로 나간다.
 * 3. **아카이브** — 서빙 루트에서 빠진다 (`SEC-STORAGE-006` AC-4 · `R55-b`).
 *    조상까지 본다.
 *
 * 권한을 보지 않는다. 관리자에게도 같은 거부가 걸린다 — 이 셋은 권한 축이
 * 아니라 이름·상태 축이기 때문이다.
 *
 * @param chain 대상 자신부터 루트까지. 빈 배열이면 대상이 없다는 뜻이므로
 *   서빙 불가다 — 레코드 부재를 허용으로 읽는 분기를 두지 않는다
 *   (`SEC-STORAGE-006` AC-2).
 */
export function isServable(chain: readonly NodeRecord[]): boolean {
  const node = chain[0];
  if (node === undefined) return false;
  if (node.orphanedAt !== null) return false;

  return !chain.some((link) => isHiddenName(link.name) || link.name === ARCHIVE_DIRECTORY);
}
