import { useEffect, useRef } from 'react';

import { Button } from '../components/ui/button.js';
import { EmptyState } from '../components/ui/states.js';

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
  onEmptyFocus,
}: {
  favorites: readonly Favorite[];
  /** 문서 행을 골랐다 (`FR-SHELL-001` AC-6). 디렉토리 행은 이것을 부르지 않는다. */
  onOpen?: (nodeId: string) => void;
  /** 이 행을 즐겨찾기에서 뺀다 (`FR-SHELL-001` AC-5). */
  onUnfavorite?: (nodeId: string) => void;
  /** 마지막 행을 지운 뒤 즐겨찾기 탭으로 초점을 돌린다. */
  onEmptyFocus?: () => void;
}) {
  const removeButtons = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<{ nodeId: string; index: number } | null>(null);
  const emptyFocus = useRef(onEmptyFocus);
  emptyFocus.current = onEmptyFocus;

  useEffect(() => {
    const pending = pendingFocus.current;
    if (pending === null || favorites.some((favorite) => favorite.nodeId === pending.nodeId)) return;
    if (favorites.length === 0) emptyFocus.current?.();
    else removeButtons.current.get(favorites[Math.min(pending.index, favorites.length - 1)]!.nodeId)?.focus();
    pendingFocus.current = null;
  }, [favorites]);

  if (favorites.length === 0) {
    return (
      <>
        <ul aria-label="즐겨찾기" />
        <EmptyState
          title="즐겨찾기한 항목이 없습니다."
          description="트리의 메뉴에서 문서나 디렉토리를 추가할 수 있습니다."
        />
      </>
    );
  }

  return (
    // 비어 있어도 목록 자체는 선다 — 사라지면 탭이 고장으로 읽힌다.
    <ul aria-label="즐겨찾기">
      {favorites.map((favorite) => (
        <li key={favorite.nodeId} data-kind={favorite.kind} data-favorite-row="">
          {/* 문서만 여는 자리를 갖는다(AC-6). 디렉토리에 여는 버튼을 두면
              눌러도 아무 일이 없거나 엉뚱한 것이 열려, 사용자는 둘 중
              어느 쪽인지 알 방법이 없다. */}
          {favorite.kind === 'file' ? (
            <button type="button" data-favorite-name="" onClick={() => onOpen?.(favorite.nodeId)}>
              <span data-favorite-icon="file" aria-hidden="true" />{favorite.name}
            </button>
          ) : (
            <span data-favorite-name=""><span data-favorite-icon="directory" aria-hidden="true" />{favorite.name}</span>
          )}
          <span data-favorite-workspace="">{favorite.workspaceName}</span>
          {/* 이름을 접근 가능한 이름에 담는다 — 「즐겨찾기 해제」만으로는
              화면 낭독기가 세 줄의 버튼을 구별해 읽지 못한다. */}
          <Button
            ref={(element) => { if (element === null) removeButtons.current.delete(favorite.nodeId); else removeButtons.current.set(favorite.nodeId, element); }}
            variant="ghost"
            size="icon"
            aria-label={`${favorite.name} 즐겨찾기 해제`}
            onClick={(event) => {
              event.stopPropagation();
              pendingFocus.current = {
                nodeId: favorite.nodeId,
                index: favorites.findIndex((row) => row.nodeId === favorite.nodeId),
              };
              onUnfavorite?.(favorite.nodeId);
            }}
          >
            <span data-favorite-remove-icon="" aria-hidden="true" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
