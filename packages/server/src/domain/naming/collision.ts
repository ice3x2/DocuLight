import { foldCase } from './case-folding.js';
import { MAX_NAME_BYTES } from './naming-policy.js';

/**
 * 이름 충돌을 **거부가 아니라 접미사로** 푼다 (`FR-WORKSPACE-005` · `R102`).
 *
 * 거부로 두면 「보이는 동명은 거부 / 안 보이는 동명은 접미사」라는 흐름
 * 차이가 생기고, 그 차이 자체가 요청자에게 보이지 않는 노드의 존재를
 * 알려주는 오라클이 된다(`R113`).
 *
 * **사용자 안내 문구는 여기서 만들지 않는다.** 그 정본은 `SEC-SHELL-002`
 * 가 소유한다 — 여기서 만들면 같은 사실이 두 곳에 적힌다(`CON-ARCH-008`).
 */

/** `.md` 같은 확장자를 뗀다. `.gitignore` 처럼 선두가 마침표면 확장자가 없다. */
function splitExtension(name: string): { base: string; extension: string } {
  const dot = name.lastIndexOf('.');
  return dot <= 0
    ? { base: name, extension: '' }
    : { base: name.slice(0, dot), extension: name.slice(dot) };
}

/** UTF-8 바이트 기준으로 자른다. 코드 포인트를 쪼개지 않는다. */
function truncateToBytes(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) {
    return text;
  }
  let kept = '';
  let used = 0;
  for (const ch of text) {
    const size = Buffer.byteLength(ch, 'utf8');
    if (used + size > maxBytes) {
      break;
    }
    kept += ch;
    used += size;
  }
  return kept;
}

function candidateAt(base: string, extension: string, ordinal: number): string {
  const suffix = ` (${ordinal})`;
  // 상한에 닿은 이름에 접미사를 그냥 붙이면 사용자가 치지도 않은 이름이
  // 길이 규칙을 어긴 채 디스크에 남는다. 줄이는 쪽은 base 다 —
  // 확장자를 줄이면 md 가 md 로 읽히지 않는다.
  const room = MAX_NAME_BYTES - Buffer.byteLength(suffix + extension, 'utf8');
  if (room >= 1) {
    return `${truncateToBytes(base, room)}${suffix}${extension}`;
  }

  // 확장자가 이름 대부분을 차지하면 base 에 남는 자리가 없다. 확장자를
  // 지키려다 상한을 넘기면 사용자가 치지도 않은 이름이 규칙을 어긴 채
  // 남으므로, 그때는 확장자 쪽을 포기하고 이름 전체를 자른다.
  const whole = MAX_NAME_BYTES - Buffer.byteLength(suffix, 'utf8');
  return `${truncateToBytes(base + extension, whole)}${suffix}`;
}

/**
 * 형제 중 폴딩이 같은 이름이 있으면 접미사를 붙인 이름을, 없으면 원래
 * 이름을 그대로 돌려준다.
 *
 * @param siblings 같은 부모 아래 **이미 있는** 이름들. 자기 자신은 빼고 준다.
 */
export function resolveNameCollision(desired: string, siblings: readonly string[]): string {
  const taken = new Set(siblings.map(foldCase));
  if (!taken.has(foldCase(desired))) {
    return desired;
  }

  const { base, extension } = splitExtension(desired);
  // 2 부터 세는 것은 원래 이름이 첫 번째이기 때문이다.
  for (let ordinal = 2; ; ordinal += 1) {
    const candidate = candidateAt(base, extension, ordinal);
    if (!taken.has(foldCase(candidate))) {
      return candidate;
    }
  }
}
