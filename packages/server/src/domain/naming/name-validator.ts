import { foldCase } from './case-folding.js';
import { isHiddenName } from './hidden-name-rule.js';
import {
  FORBIDDEN_CHARACTERS,
  MAX_NAME_BYTES,
  MAX_RELATIVE_PATH_BYTES,
  PATH_SEPARATOR,
  RESERVED_DEVICE_NAMES,
} from './naming-policy.js';
import { invalid, valid, type NameValidation, type NameViolation } from './validation-result.js';

// 이름 비교의 정규화는 저장소에 한 함수뿐이다. 여기서 따로 소문자화하면
// 충돌 판정과 예약어 판정이 서로 다른 규칙을 쓰게 된다.
const RESERVED_FOLDED = new Set(RESERVED_DEVICE_NAMES.map(foldCase));

const bytes = (text: string) => Buffer.byteLength(text, 'utf8');

/**
 * 장치 이름 판정에 쓰는 부분 — **첫 마침표 앞**이다.
 *
 * Windows 는 `CON.txt` 도 `CON.txt.md` 도 장치로 해석하므로 확장자를 붙였다고
 * 통과시키면 검증이 무의미해진다. `.gitignore` 처럼 선두가 마침표면 빈
 * 문자열이 되어 어느 장치와도 일치하지 않는다.
 */
function deviceCandidate(name: string): string {
  return name.split('.')[0] ?? '';
}

/**
 * 노드 이름과 그 결과 경로를 검사한다 (`FR-WORKSPACE-004`).
 *
 * 생성·개명·업로드 세 진입점이 **이 함수 하나**를 경유한다. 셋 중 하나라도
 * 다른 검사를 쓰면 그 경로로 들어온 이름이 검증되지 않은 채 디스크에 남는다.
 *
 * @param parentPath 워크스페이스 루트 기준 부모의 상대 경로. 루트 바로 아래면 `''`.
 * @returns 어긴 규칙 **전부**. 하나씩 알려 주면 사용자가 규칙 수만큼 왕복한다.
 */
export function validateNodeName(name: string, parentPath: string): NameValidation {
  const violations: NameViolation[] = [];

  if (name.length === 0) {
    violations.push({ rule: 'empty-name', message: '이름이 비어 있습니다.' });
    // 빈 이름에 나머지 규칙을 물리면 같은 사실을 여러 줄로 알리게 된다.
    return invalid(violations);
  }

  if (isHiddenName(name)) {
    violations.push({
      rule: 'reserved-namespace',
      message: '이름을 점으로 시작할 수 없습니다. 그 자리는 제품이 예약해 씁니다.',
    });
  }

  const control = [...name].filter((ch) => ch.charCodeAt(0) <= 0x1f);
  if (control.length > 0) {
    violations.push({
      rule: 'control-character',
      message: '이름에 제어문자를 쓸 수 없습니다.',
    });
  }

  const forbidden = FORBIDDEN_CHARACTERS.filter((ch) => name.includes(ch));
  if (forbidden.length > 0) {
    violations.push({
      rule: 'forbidden-character',
      message: `이름에 ${forbidden.join(' ')} 문자를 쓸 수 없습니다.`,
    });
  }

  const last = name[name.length - 1]!;
  if (last === ' ' || last === '.') {
    violations.push({
      rule: 'trailing-space-or-dot',
      // Windows 가 조용히 잘라내면 저장한 이름과 읽는 이름이 갈린다.
      message: '이름은 공백이나 마침표로 끝날 수 없습니다.',
    });
  }

  if (RESERVED_FOLDED.has(foldCase(deviceCandidate(name)))) {
    violations.push({
      rule: 'reserved-device-name',
      message: `${deviceCandidate(name)} 은(는) 예약된 장치 이름이라 확장자를 붙여도 쓸 수 없습니다.`,
    });
  }

  const nameBytes = bytes(name);
  if (nameBytes > MAX_NAME_BYTES) {
    violations.push({
      rule: 'name-too-long',
      message: `이름이 ${nameBytes}바이트로 상한 ${MAX_NAME_BYTES}바이트를 넘습니다. 한글은 한 자가 3바이트입니다.`,
      limitBytes: MAX_NAME_BYTES,
      actualBytes: nameBytes,
    });
  }

  const pathBytes = bytes(parentPath === '' ? name : `${parentPath}${PATH_SEPARATOR}${name}`);
  if (pathBytes > MAX_RELATIVE_PATH_BYTES) {
    violations.push({
      rule: 'path-too-long',
      message: `결과 경로가 ${pathBytes}바이트로 상한 ${MAX_RELATIVE_PATH_BYTES}바이트를 넘습니다.`,
      limitBytes: MAX_RELATIVE_PATH_BYTES,
      actualBytes: pathBytes,
    });
  }

  return violations.length === 0 ? valid : invalid(violations);
}
