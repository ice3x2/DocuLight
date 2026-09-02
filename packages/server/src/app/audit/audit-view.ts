import type { AuditRow } from '../../domain/ports/audit-sink.js';
import { isSuperuser } from '../../domain/principal/subject.js';
import { managedWorkspacesOf } from '../acl/admin-scope.js';
import type { AclStores, Actor } from '../acl/permission-service.js';

/**
 * 열람 워크스페이스 **밖**의 노드를 가리키는 고정 문구 (`SEC-AUDIT-002`
 * AC-3 · `SEC-AUDIT-003`).
 *
 * **상대 워크스페이스에 따라 달라지는 값을 어떤 형태로도 담지 않는다** —
 * 이름·해시·가명·연번 어느 것도 아니다. 그래서 이 값은 함수가 아니라
 * 상수다: 인자를 받는 순간 그 인자로 갈릴 수 있고, 서로 다른 두 목적지가
 * 다른 문구를 받으면 그 차이가 곧 목적지를 식별하는 축이 된다 (AC-7).
 */
export const EXTERNAL_NODE = '다른 워크스페이스의 노드';

/** 화면과 API 가 함께 쓰는 감사 한 줄. 원시 노드 ID 는 여기 오지 않는다. */
export interface AuditRowView {
  readonly id: string;
  readonly occurredAt: string;
  readonly operation: string;
  readonly actor: string;
  /** 대상. 열람 스코프 밖이면 고정 문구다. 노드 없는 사건이면 `null`. */
  readonly target: string | null;
  /**
   * 상대 노드. 마스킹은 대상과 **같은 규칙**을 지난다 (`SEC-AUDIT-008`) —
   * 나눠 적으면 한쪽에만 규칙이 걸리고, 그 한쪽이 곧 누출 경로가 된다.
   */
  readonly counterpart: string | null;
  readonly targetRole?: 'origin' | 'copy';
  /**
   * 이 사건이 **누구에게** 일어났는가 — 사람이 읽는 이름이다
   * (`IR-AUDIT-004` AC-3). 저장은 principal ID 이고(`DR-AUDIT-002` AC-8)
   * 푸는 자리가 여기다. 이름이 풀리지 않으면 식별자가 그대로 온다 (AC-5).
   */
  readonly subject?: string;
  /** 무엇을 줬는가. 저장된 값 그대로다 — 이름 붙이기는 화면의 일이다. */
  readonly level?: string;
  readonly beforeValue?: string;
  readonly afterValue?: string;
}

/**
 * 한 번의 조작에서 나온 행들 (`IR-AUDIT-003`).
 *
 * **묶음은 표시 산물이지 기록이 아니다.** 그래서 저장소에 묶음 키가 없고,
 * 이 타입에도 키를 싣지 않는다 (AC-5 · AC-6) — 키가 응답에 실리면 그것으로
 * 거르는 필터가 곧 생기고, 그 필터는 기록에 없는 축으로 감사를 가른다.
 */
export interface AuditGroup {
  readonly operation: string;
  readonly actor: string;
  readonly occurredAt: string;
  /**
   * 이 묶음의 낱행 수 — **열람자 스코프의 행만 센다** (`SEC-AUDIT-011`).
   *
   * 전역 총계를 세면 그 수와 펼친 낱행 수의 차이가 곧 스코프 밖 행의
   * 개수가 된다. 그래서 이 값은 `rows.length` 그 자체이며 따로 세지 않는다.
   */
  readonly rows: readonly AuditRowView[];
}

export interface AuditView {
  readonly groups: readonly AuditGroup[];
  /** 조작 필터의 선택지. 실제 기록 값에서 온다 (`IR-AUDIT-001`). */
  readonly operations: readonly string[];
}

/** 감사 뷰어가 쓰는 저장소. `AclStores` 가 이미 두 감사 경계를 든다. */
export type AuditViewStores = AclStores;

/**
 * 이 요청자가 읽을 수 있는 감사 로그 (`SEC-AUDIT-010` · `IR-AUDIT-001` ·
 * `IR-AUDIT-003`).
 *
 * 관리 워크스페이스가 하나도 없고 슈퍼유저도 아니면 `null` — 볼 것이 없는
 * 것과 볼 자격이 없는 것을 같은 값으로 접는다 (`SEC-ACL-006`).
 *
 * **인스턴스 스코프는 슈퍼유저만 본다** (`SEC-AUDIT-010` AC-4 · AC-5).
 * 어느 워크스페이스에도 귀속되지 않는 행이 거기 든다.
 */
export function auditView(
  stores: AuditViewStores,
  actor: Actor,
  /** 조작 필터 (`IR-AUDIT-001`). 없으면 스코프 안의 전부다. */
  filter: { operation?: string } = {},
): AuditView | null {
  const superuser = isSuperuser(stores.principals.groupsOf(actor.id));
  const managed = managedWorkspacesOf(stores, actor).map((workspace) => workspace.id);
  if (!superuser && managed.length === 0) return null;

  const options = {
    includeInstance: superuser,
    ...(filter.operation === undefined ? {} : { operation: filter.operation }),
  };
  const scope = new Set(managed);
  const rows = stores.auditLog.inScope(managed, options).map((row) => viewOf(stores, scope, row));

  return {
    groups: grouped(rows, stores.auditLog.inScope(managed, options)),
    // 필터의 선택지는 **낱행**에서 온다 (`IR-AUDIT-003` AC-4) — 묶음에서
    // 뽑으면 접힌 줄에 없는 조작이 필터에서 사라진다.
    //
    // **거른 결과에서 뽑지 않는다** — 하나를 고른 순간 나머지 선택지가
    // 사라져 되돌아갈 수 없다. 그래서 조작 조건을 뺀 스코프만 넘긴다.
    operations: stores.auditLog.operationsInScope(managed, { includeInstance: superuser }),
  };
}

/**
 * 노드 참조를 경로로 풀거나 고정 문구로 가린다 (`SEC-AUDIT-002`).
 *
 * **저장된 값은 온전히 남는다** (`SEC-AUDIT-008` AC-5) — 가리는 것은
 * 표시일 뿐이라, 열람자에게 나중에 그 워크스페이스의 권한이 생기면 같은
 * 행이 경로로 해석돼 보인다 (`SEC-AUDIT-002` AC-5).
 */
function resolve(stores: AuditViewStores, scope: ReadonlySet<string>, id?: string): string | null {
  if (id === undefined) return null;

  const node = stores.nodes.findById(id);
  // 노드가 사라졌으면 경로를 만들 수 없다. 그 사실을 고정 문구로 접는다 —
  // 「없어진 노드」라고 따로 적으면 그 구별이 곧 존재 신호가 된다.
  if (node === undefined || !scope.has(node.workspaceId)) return EXTERNAL_NODE;
  return stores.nodes.pathOf(id);
}

/**
 * 주체 참조를 사람이 읽는 이름으로 푼다 (`IR-AUDIT-004` AC-3 · AC-5).
 *
 * 노드를 푸는 `resolve` 와 **같은 자리에 둔다** — 한 응답을 만드는 책임이
 * 두 계층으로 갈리면 화면이 식별자를 이름으로 바꾸려고 낱행마다 명부를
 * 두드리게 되고, 그 창구 자체가 스코프 없는 명부 경로가 된다 (`R162`).
 *
 * 풀리지 않으면 **식별자를 그대로 돌려준다.** 그룹은 지워질 수 있고
 * (`removeGroup`) 그때 그 그룹을 가리키는 옛 감사 행이 남는다. 남은 사실이
 * 식별자뿐이므로 없는 이름을 지어내는 대신 있는 것을 보인다.
 *
 * 노드처럼 고정 문구로 가리지 않는 이유는 가릴 경계가 없기 때문이다 —
 * 주체는 워크스페이스에 귀속되지 않으며, 이 행을 볼 수 있는 열람자는 그
 * 주체를 공유 화면에서 이미 이름으로 본다.
 */
function subjectName(stores: AuditViewStores, id: string): string {
  return stores.principals.findById(id)?.name ?? id;
}

function viewOf(stores: AuditViewStores, scope: ReadonlySet<string>, row: AuditRow): AuditRowView {
  return {
    id: row.id,
    occurredAt: row.occurredAt,
    operation: row.operation,
    actor: row.actor,
    target: resolve(stores, scope, row.nodeId),
    counterpart: resolve(stores, scope, row.counterpartNodeId),
    ...(row.targetRole === undefined ? {} : { targetRole: row.targetRole }),
    ...(row.subjectId === undefined ? {} : { subject: subjectName(stores, row.subjectId) }),
    ...(row.level === undefined ? {} : { level: row.level }),
    ...(row.beforeValue === undefined ? {} : { beforeValue: row.beforeValue }),
    ...(row.afterValue === undefined ? {} : { afterValue: row.afterValue }),
  };
}

/**
 * **한 조작이 낸** 낱행을 한 줄로 접는다 (`IR-AUDIT-003` AC-8 · AC-9).
 *
 * 경계는 기록 시점에 정해진 상관 키다. 시각에서 파생하지 않는 이유는
 * `occurred_at` 이 초 단위라 같은 초의 서로 다른 두 조작이 한 줄로 접히기
 * 때문이다 — 반대로 초 경계를 넘는 한 조작은 두 줄로 갈렸다.
 *
 * 조작 값을 키에 함께 두는 것은 한 번의 호출이 서로 다른 조작을 남길 수
 * 있기 때문이다(복사가 생성 행과 복사 행을 함께 남긴다). 합치면 묶음의
 * `operation` 이 그 중 하나만 대표하게 되어 사실과 어긋난다.
 *
 * 상관 키가 없는 옛 행은 자기 id 로 접는다 — 낱행 하나짜리 묶음이 된다.
 * 틀리게 합치는 것보다 덜 접히는 쪽이 낫다.
 *
 * **키는 나가지 않는다** (AC-5 · AC-6). 두 워크스페이스의 행에 같은 값이
 * 실리므로 노출하면 행 간 상관으로 상대편을 복원할 수 있다.
 */
function grouped(views: readonly AuditRowView[], rows: readonly AuditRow[]): AuditGroup[] {
  const groups = new Map<string, AuditRowView[]>();
  for (const [index, view] of views.entries()) {
    const row = rows[index]!;
    const key = `${row.correlationId ?? row.id}\u0000${row.operation}`;
    groups.set(key, [...(groups.get(key) ?? []), view]);
  }

  return [...groups.values()].map((members) => ({
    operation: members[0]!.operation,
    actor: members[0]!.actor,
    occurredAt: members[0]!.occurredAt,
    rows: members,
  }));
}
