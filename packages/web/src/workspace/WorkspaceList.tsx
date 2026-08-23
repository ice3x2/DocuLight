/**
 * 워크스페이스 한 줄이 아는 것.
 *
 * `adminless` 를 **서버가 판정해 보낸다** — 화면이 접근자를 세면 슈퍼유저의
 * 상방 게이트가 「관리자 있음」으로 잘못 세어지고, 그러면 배지가 영영 뜨지
 * 않는다 (`FR-PRINCIPAL-006`).
 */
export interface WorkspaceRowView {
  id: string;
  name: string;
  adminless: boolean;
}

/**
 * `관리자 없음` 배지 (`FR-PRINCIPAL-006`).
 *
 * **상시 표시이며 닫을 수 없다** (AC-4). 닫을 수 있으면 닫은 사람만 그
 * 사실을 잊고, 그 워크스페이스는 관리자가 없는 채로 남는다. 그래서 이
 * 부품에는 닫기 핸들러도 상태도 없다.
 *
 * 좌측 트리에는 이 배지가 서지 않는다 (AC-3) — 트리는 문서를 찾는 자리고
 * 관리 상태는 거기서 할 수 있는 일이 없다. 배지가 뜨는 자리는 그것을
 * 고칠 수 있는 화면뿐이다.
 */
export function AdminlessBadge({ adminless }: { adminless: boolean }) {
  if (!adminless) return null;

  return <span data-testid="adminless-badge">관리자 없음</span>;
}

/** 설정 모달과 스코프 선택기가 함께 쓰는 목록 (AC-1 · AC-2). */
export function WorkspaceList({
  workspaces = [],
  label,
  onPick,
}: {
  workspaces?: readonly WorkspaceRowView[];
  label: string;
  onPick?: (workspaceId: string) => void;
}) {
  return (
    <ul aria-label={label}>
      {workspaces.map((workspace) => (
        <li key={workspace.id}>
          <button type="button" onClick={() => onPick?.(workspace.id)}>
            {workspace.name}
          </button>
          <AdminlessBadge adminless={workspace.adminless} />
        </li>
      ))}
    </ul>
  );
}
