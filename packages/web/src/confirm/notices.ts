/**
 * 확인·부여 표면이 쓰는 고지 문구들.
 *
 * **한 곳에 모아 두는 것이 요구다** — 화면마다 문장을 쓰면 같은 사실이
 * 화면마다 다르게 말해지고, 그때 한쪽만 고쳐진다. 특히 아래 문구들은
 * **조건 없이 붙어야** 하는 것들이라, 조건을 붙일 수 있는 자리에 두면
 * 그 조건이 곧 존재 신호가 된다.
 */

/** 상속 고지의 목적어 (`FR-CONFIRM-013`). 컨테이너 두 종류뿐이다. */
export type ContainerKind = 'directory' | 'workspace';

const OBJECT: Record<ContainerKind, string> = {
  directory: '디렉토리',
  workspace: '워크스페이스',
};

/**
 * 컨테이너 부여의 상속 고지 (`FR-CONFIRM-013`).
 *
 * **템플릿 하나에 목적어만 갈아 끼운다.** 노드 유형마다 문장을 따로 쓰면
 * 한쪽만 고쳐지고, 그때 두 화면이 같은 규칙을 다르게 설명한다.
 */
export const inheritanceNotice = (kind: ContainerKind): string =>
  `이 ${OBJECT[kind]}에 부여한 권한은 하위 전체에 상속됩니다.`;

/**
 * 상속 끊김 고지 (`SEC-CONFIRM-004`).
 *
 * **끊긴 하위의 유무와 무관하게 언제나 붙는다.** 있을 때만 띄우면 문구의
 * 등장 여부가 곧 끊긴 노드의 존재를 알린다 — 그래서 이 값은 함수가 아니라
 * 상수다. 인자를 받는 순간 그 인자로 가르는 구현이 생긴다.
 */
export const BROKEN_INHERITANCE_NOTICE = '상속이 끊긴 하위에는 적용되지 않습니다.';

/**
 * 컨테이너 회수의 첨부 고지 (`SEC-CONFIRM-006`).
 *
 * 개수를 싣지 않는다 — 하위 첨부의 수는 요청자가 못 보는 문서의 것까지
 * 세게 되고, 그 수가 곧 존재 오라클이다. 같은 이유로 이 값도 상수다.
 */
export const ATTACHMENT_REVOKE_NOTICE = '이 폴더 안 문서의 첨부도 함께 접근할 수 없게 됩니다.';

/**
 * 넓히기 되돌리기의 표기 (`FR-CONFIRM-014`).
 *
 * **`실행취소` 가 아니라 `회수` 다.** 부여는 되돌릴 수 없는 조작이고
 * (`SEC-CONFIRM-002`), `실행취소` 는 원래 상태로 돌아간다는 뜻이라 거짓
 * 약속이 된다. 되돌려도 이미 열람된 내용은 회수되지 않는다.
 */
export const WIDENING_UNDO_LABEL = '회수';
export const WIDENING_UNDO_NOTICE = '되돌려도 이미 열람된 내용은 회수되지 않습니다.';
