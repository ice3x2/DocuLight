/**
 * 즐겨찾기 뷰 (`FR-SHELL-001` AC-3 ~ AC-6).
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

export function FavoritesView({
  favorites,
  onOpen,
  onUnfavorite,
}: {
  favorites: readonly Favorite[];
  /** 문서 행을 골랐다 (`FR-SHELL-001` AC-6). 디렉토리 행은 이것을 부르지 않는다. */
  onOpen?: (nodeId: string) => void;
  /** 이 행을 즐겨찾기에서 뺀다 (`FR-SHELL-001` AC-5). */
  onUnfavorite?: (nodeId: string) => void;
}) {
  return (
    // 비어 있어도 목록 자체는 선다 — 사라지면 탭이 고장으로 읽힌다.
    <ul aria-label="즐겨찾기">
      {favorites.map((favorite) => (
        <li key={favorite.nodeId} data-kind={favorite.kind}>
          {/* 문서만 여는 자리를 갖는다(AC-6). 디렉토리에 여는 버튼을 두면
              눌러도 아무 일이 없거나 엉뚱한 것이 열려, 사용자는 둘 중
              어느 쪽인지 알 방법이 없다. */}
          {favorite.kind === 'file' ? (
            <button type="button" onClick={() => onOpen?.(favorite.nodeId)}>
              {favorite.name}
            </button>
          ) : (
            <span>{favorite.name}</span>
          )}
          <span>{favorite.workspaceName}</span>
          {/* 이름을 접근 가능한 이름에 담는다 — 「즐겨찾기 해제」만으로는
              화면 낭독기가 세 줄의 버튼을 구별해 읽지 못한다. */}
          <button
            type="button"
            aria-label={`${favorite.name} 즐겨찾기 해제`}
            onClick={() => onUnfavorite?.(favorite.nodeId)}
          >
            즐겨찾기 해제
          </button>
        </li>
      ))}
    </ul>
  );
}
