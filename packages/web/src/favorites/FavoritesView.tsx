/**
 * 즐겨찾기 뷰 (`FR-SHELL-001` AC-3 · AC-4).
 *
 * **문서와 디렉토리를 같은 목록에 담는다.** 문서만 담으면 디렉토리를
 * 즐겨찾기한 사용자는 그것을 다시 찾지 못하고, 그 사실이 조작한 순간에는
 * 드러나지 않는다.
 */
export interface Favorite {
  nodeId: string;
  name: string;
  kind: 'file' | 'directory';
  /** 어느 워크스페이스의 것인지 — 목록이 전 워크스페이스를 가로지른다. */
  workspaceName: string;
}

export function FavoritesView({ favorites }: { favorites: readonly Favorite[] }) {
  return (
    // 비어 있어도 목록 자체는 선다 — 사라지면 탭이 고장으로 읽힌다.
    <ul aria-label="즐겨찾기">
      {favorites.map((favorite) => (
        <li key={favorite.nodeId} data-kind={favorite.kind}>
          <span>{favorite.name}</span>
          <span>{favorite.workspaceName}</span>
        </li>
      ))}
    </ul>
  );
}
