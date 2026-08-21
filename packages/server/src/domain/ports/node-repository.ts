import type { NodeId } from '../node/node-id.js';

/** 노드는 문서이거나 디렉토리다. 스키마의 `CHECK` 와 같은 두 값이다. */
export type NodeKind = 'directory' | 'file';

/** 아직 ID 가 없는 노드. ID 는 저장소가 발급한다 — 호출자가 짓지 않는다. */
export interface NewNode {
  workspaceId: string;
  /** 루트면 `null`. */
  parentId: NodeId | null;
  kind: NodeKind;
  name: string;
}

export interface NodeRecord extends NewNode {
  id: NodeId;
  /**
   * 대응 파일이 사라진 시각 (`REL-STORAGE-001` AC-2). 비어 있으면 살아 있다.
   *
   * 별도의 상태 칸을 두지 않는 이유는 두 값이 갈릴 자리를 만들지 않기
   * 위해서다 — 재조정 대기열이 미해소를 판정하는 방식과 같다(`R139`).
   */
  orphanedAt: string | null;

  /**
   * 조상의 ACL 항목을 받는가. 기본값은 참이다 (`SEC-ACL-003` AC-1).
   *
   * 항목이 아니라 **노드**가 이 값을 갖는 것이 이 제품의 상속 모델이다 —
   * 항목마다 범위를 달 수 있으면 「이 폴더에만 적용」이 표현 가능해지고,
   * 그것은 하위에 대한 거부라 `CON-ACL-002` 가 금지한다.
   */
  inheritsAcl: boolean;
}

/**
 * 노드 저장소의 경계. 도메인이 소유한다.
 *
 * **경로로 조회하는 메서드를 두지 않는다.** 두면 경로가 두 번째 정본이 되어
 * `DR-STORAGE-003` 이 막으려는 사고 — 삭제 후 동명 재생성이 이전 노드의
 * 권한을 물려받는 것 — 이 되살아난다. 경로는 `pathOf` 로 **파생**될 뿐이다.
 */
export interface NodeRepository {
  /** 노드를 만들고 새로 발급한 ID 를 돌려준다. */
  create(node: NewNode): NodeId;

  /** 없으면 `undefined`. 예외를 분기로 쓰지 않는다. */
  findById(id: string): NodeRecord | undefined;

  /**
   * 같은 부모 아래의 노드들. 트리 목록과 이름 충돌 판정이 **이 하나**를
   * 함께 쓴다 — 같은 질의를 둘로 두면 한쪽만 조건이 바뀐다.
   *
   * 여기서는 숨김 규칙을 적용하지 않는다. 충돌 판정은 보이지 않는 항목과도
   * 겹치면 안 되므로(`R113`), 걸러진 목록을 받으면 숨은 이름과 겹치는
   * 요청이 통과한다. 거르는 것은 표시 계층의 몫이다.
   *
   * @param except 개명은 자기 자신과 겹치므로 뺀다 — 빼지 않으면 이름을
   *   그대로 두는 개명이 자기와 충돌해 접미사를 받는다.
   */
  children(where: { workspaceId: string; parentId: NodeId | null; except?: NodeId }): NodeRecord[];

  /** 한 워크스페이스의 노드 전부. 재조정이 파일시스템과 맞대는 쪽이다. */
  allIn(workspaceId: string): NodeRecord[];

  /**
   * tombstone 으로 표시한다. **지우지 않는다** (`REL-STORAGE-001` AC-2) —
   * 삭제는 되돌릴 수 없고, 파일이 잠시 없었을 뿐인 경우에도 그 노드 앞으로
   * 부여된 권한이 영구히 사라진다.
   */
  markOrphaned(id: NodeId, at: string): void;

  /**
   * tombstone 을 푼다 (`REL-STORAGE-001` AC-2).
   *
   * tombstone 의 정당화는 「파일이 잠시 없었을 뿐인 경우」다. 그 「잠시」가
   * 끝났을 때 돌아오는 길이 없으면 그 정당화가 성립하지 않는다. 새 노드를
   * 만들어 대신하지 않는 이유는 ID 가 바뀌면 그 노드 앞으로 부여된 권한과
   * 이력이 끊기기 때문이다.
   */
  clearOrphan(id: NodeId): void;

  /**
   * 상속 유지 여부를 바꾼다 (`SEC-ACL-003` AC-4).
   *
   * 부모의 항목을 이 노드로 **복사하지 않는다** (AC-5) — 복사는 `부모 권한
   * 가져오기` 라는 별개 조작의 일이고(AC-6), 여기에 끼워 넣으면 두 조작이
   * 한 버튼 뒤에 숨어 「좁혔다고 착각하는」 상황이 되살아난다.
   */
  setInheritance(id: NodeId, inherits: boolean): void;

  /**
   * 자기 자신부터 루트까지의 부모 사슬. 없는 노드면 빈 배열.
   *
   * 이름 대신 노드를 돌려주는 이유는 판정에 각 조상의 ID 와 상속 플래그가
   * 필요하기 때문이다 — 경로 문자열에서는 그것을 되찾을 수 없다.
   *
   * **질의 한 번으로 끝나야 한다** — 부모를 하나씩 따라가면 깊이만큼
   * 질의가 늘어나 판정 하나의 질의를 2회로 묶은 `CON-ACL-001` AC-4 가
   * 깨진다.
   */
  chainOf(id: NodeId): NodeRecord[];

  /**
   * 여러 노드의 사슬을 **한 번의 질의로** 모은다. 합집합이며 중복이 없다.
   *
   * 노드마다 `chainOf` 를 부르면 대상 수에 비례해 질의가 늘어
   * `CON-ACL-001` AC-4 가 깨진다 — 그 AC 가 허용하는 O(N) 은 질의가
   * 아니라 **메모리 순회**다. 각 행이 `parentId` 를 가지므로 호출자가
   * 사슬을 메모리에서 다시 엮는다.
   */
  chainsOf(ids: readonly NodeId[]): NodeRecord[];

  /**
   * 부모 사슬을 거슬러 경로를 만든다.
   *
   * 경로를 칸에 담지 않는 이유가 여기 있다 — 담으면 이동·개명 때 두 곳을
   * 함께 고쳐야 하고, 한쪽만 고쳐지면 아무도 눈치채지 못한다.
   */
  pathOf(id: NodeId): string;

  /**
   * 자리와 이름을 **한 번에** 옮긴다 (`DR-STORAGE-003` AC-3 · AC-4).
   *
   * 둘을 나누지 않는 이유가 AC-4 다 — 자리 갱신과 이름 갱신이 별개 쓰기면
   * 그 사이에서 실패했을 때 노드가 **새 부모 아래에 옛 이름으로** 남는다.
   * 한 문장이면 그 틈이 성립할 자리가 없다.
   *
   * 하위 노드의 행은 하나도 건드리지 않는다 — 경로가 부모 사슬에서
   * 파생되므로 이 한 번의 갱신으로 subtree 의 경로가 함께 바뀐다.
   *
   * 파일 감시는 이 경로에 개입하지 않는다 — 태우면 fail-closed 상관
   * 판정이 정상 이동을 신규 노드로 만들어 이력이 끊긴다.
   */
  relocate(id: NodeId, to: { parentId: NodeId | null; name: string }): void;

  /**
   * 노드와 그 하위를 지운다. **ID 는 되살아나지 않는다** (`AC-5`) —
   * 같은 자리에 같은 이름으로 다시 만들면 새 ID 를 받으므로 이전 노드의
   * 권한·이력이 승계되지 않는다.
   */
  remove(id: NodeId): void;
}
