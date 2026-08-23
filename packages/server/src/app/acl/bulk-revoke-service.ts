import type { AclEntry } from '../../domain/acl/acl-entry.js';
import type { PermissionLevel } from '../../domain/acl/level.js';
import type { PrincipalId } from '../../domain/principal/principal.js';
import { pathIndex } from '../node/node-paths.js';
import { managedWorkspacesOf } from './admin-scope.js';
import { revokePermission } from './grant-service.js';
import type { AclStores, Actor } from './permission-service.js';

/**
 * 이 회수가 닿는 범위 (`FR-PRINCIPAL-004`).
 *
 * 문자열 문구가 아니라 **값**으로 돌려주는 이유가 AC-3 이다 — 문구를
 * 서버가 만들면 슈퍼유저에게 「내가 관리하는 워크스페이스에만」이 그대로
 * 나가는 경로가 열린다. 두 값이 갈려 있으면 화면이 같은 문장을 쓰는 것이
 * 구조적으로 불가능하다.
 */
export type RevocationScope = 'instance' | 'managed-workspaces';

/** 영향 범위 표의 한 줄 (`FR-ACL-003` AC-4). */
export interface RevocationRow {
  readonly entryId: string;
  readonly workspaceId: string;
  readonly workspaceName: string;
  /**
   * 워크스페이스 루트 기준 경로. 워크스페이스 자체에 걸린 항목은 `null`.
   *
   * 워크스페이스 이름을 경로로 적지 않는다 — 같은 이름의 최상위 디렉토리와
   * 구별되지 않고, 그 둘은 상속에서 서로 다르게 행동한다.
   */
  readonly path: string | null;
  readonly level: PermissionLevel;
  readonly grantedBy: PrincipalId | null;
  readonly grantedAt: string;
}

export interface Revocation {
  readonly scope: RevocationScope;
  readonly rows: readonly RevocationRow[];
}

/**
 * 걷힐 것들. 이 화면을 열 자격이 없으면 `null`.
 *
 * 미리보기와 실행이 **같은 선별**을 지난다 — 갈리면 사용자가 확인한 것과
 * 실행된 것이 달라지고, 회수는 되돌리려면 재부여가 필요한 조작이라 그
 * 차이를 사후에 알아차리기 어렵다.
 */
export function previewRevocation(
  stores: AclStores,
  actor: Actor,
  principalId: PrincipalId,
): Revocation | null {
  return plan(stores, actor, principalId);
}

/**
 * 실제로 걷는다. 돌려주는 것은 **걷힌 것**이다 (`FR-ACL-003` AC-1).
 *
 * ACL 항목만 만진다 (AC-2) — 그룹 멤버십과 계정 상태는 다른 조작이고,
 * 한 버튼 뒤에 묶으면 「권한만 걷고 계정은 둔다」를 표현할 수 없게 된다.
 * 오프보딩이 단계를 나눈 이유가 그것이다.
 */
export function revokeAllFor(
  stores: AclStores,
  actor: Actor,
  principalId: PrincipalId,
): Revocation | null {
  const planned = plan(stores, actor, principalId);
  if (planned === null) return null;

  // 항목마다 `revokePermission` 을 지난다. 저장소를 직접 지우면 감사 행이
  // 빠지고(한 번의 조작이 여러 항목을 걷어도 기록은 항목마다 하나다),
  // 회수 판정도 이 화면에서만 다른 규칙을 갖게 된다.
  // 한 번의 조작이므로 행들이 한 상관 키를 나눠 갖는다 (`IR-AUDIT-003`
  // AC-9). 없으면 128 건을 걷은 일이 뷰어에서 128 줄로 갈리고, 그 화면이
  // 곧 `OBS-AUDIT-008` AC-5 가 타이핑 토큰으로 세던 바로 그 수다.
  const correlationId = stores.audit.newCorrelation();
  const removed = planned.rows.filter(
    (row) => revokePermission(stores, actor, row.entryId, { correlationId }).ok,
  );

  return { scope: planned.scope, rows: removed };
}

/**
 * 선별 — 이 요청자가 이 주체에게서 걷을 수 있는 항목들.
 *
 * **관리 전용 화면이다.** 편집 보유자가 자기가 준 항목을 낱개로 걷는 길은
 * `revokePermission` 이 이미 갖고 있고, 주체 축으로 훑는 이 화면은 그것과
 * 다른 조작이다.
 *
 * 선별에서는 노드마다 되묻지 않고 **워크스페이스 단위로 한 번씩** 잰다.
 * 노드 계층에는 관리를 부여할 수 없으므로(`SEC-WORKSPACE-002`) 어떤 노드에서
 * 관리를 갖는다는 것은 곧 그 워크스페이스에서 관리를 갖는다는 뜻이고, 둘은
 * 같은 판정이다. 항목마다 되물으면 질의가 항목 수만큼 붙는다.
 *
 * **실행 경로는 다르다.** `revokeAllFor` 는 항목마다 회수 경로를 지나고 그
 * 안에서 권한이 한 번 더 재어진다. 감사 행을 남기고 회수 판정을 한 곳에
 * 두기 위해 치르는 값이며, 그래서 회수 실행의 질의는 항목 수에 비례한다.
 */
function plan(stores: AclStores, actor: Actor, principalId: PrincipalId): Revocation | null {
  const workspaces = managedWorkspacesOf(stores, actor);
  if (workspaces.length === 0) return null;

  const managed = new Set(workspaces.map((workspace) => workspace.id));
  const entries = stores.acl.entriesOfPrincipal(principalId);
  const chain = stores.nodes.chainsOf(entries.map((entry) => entry.nodeId));
  const byId = new Map(chain.map((node) => [node.id, node]));
  const pathOf = pathIndex(chain);
  const workspaceNames = new Map(workspaces.map((workspace) => [workspace.id, workspace.name]));

  const rows: RevocationRow[] = [];
  for (const entry of entries) {
    const placed = locate(entry, byId, workspaceNames, pathOf);
    // 어느 워크스페이스에도 속하지 않는 항목 — 노드가 이미 사라진 자리다.
    // 걷을 근거를 세울 수 없으므로 표에도 올리지 않는다.
    if (placed === null || !managed.has(placed.workspaceId)) continue;
    rows.push({ ...placed, entryId: entry.id, level: entry.level, grantedBy: entry.grantedBy, grantedAt: entry.grantedAt });
  }

  return {
    scope: actor.requester.superuser ? 'instance' : 'managed-workspaces',
    rows: rows.sort(byPlace),
  };
}

/**
 * 표의 줄 순서 — **결정적이어야 한다.**
 *
 * 저장소가 주는 순서는 `granted_at` 이 초 단위라 같은 초에 들어온 항목들이
 * 불투명 ID 로 갈린다. 사람이 읽는 표에서 그것은 무작위이며, 같은 자료를
 * 두 번 열면 줄 순서가 달라진다.
 *
 * 워크스페이스 → 넓은 자리 → 경로 순이다. 워크스페이스 자체에 걸린 항목이
 * 먼저 오는 이유는 그것이 가장 넓은 부여여서다 — 회수 범위를 가늠하는
 * 사람이 제일 먼저 봐야 하는 줄이다.
 *
 * 제품 전반의 목록 정렬 규칙은 이 자리가 정하지 않는다. 여기서 필요한
 * 것은 「같은 자료면 같은 순서」뿐이다.
 */
const byPlace = (a: RevocationRow, b: RevocationRow): number => {
  if (a.workspaceName !== b.workspaceName) return a.workspaceName < b.workspaceName ? -1 : 1;
  if (a.path === b.path) return a.entryId < b.entryId ? -1 : 1;
  if (a.path === null) return -1;
  if (b.path === null) return 1;
  return a.path < b.path ? -1 : 1;
};

interface Placement {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly path: string | null;
}

/** 항목이 걸린 자리 — 워크스페이스 자체이거나 그 안의 노드다. */
function locate(
  entry: AclEntry,
  byId: Map<string, { id: string; workspaceId: string }>,
  workspaceNames: Map<string, string>,
  pathOf: (id: string) => string | null,
): Placement | null {
  const node = byId.get(entry.nodeId);
  if (node === undefined) {
    // 노드가 아니면 워크스페이스 자체다 — 그 계층에도 항목이 걸린다.
    const name = workspaceNames.get(entry.nodeId);
    return name === undefined
      ? null
      : { workspaceId: entry.nodeId, workspaceName: name, path: null };
  }

  const path = pathOf(node.id);
  return path === null
    ? null
    : {
        workspaceId: node.workspaceId,
        workspaceName: workspaceNames.get(node.workspaceId) ?? '',
        path,
      };
}
