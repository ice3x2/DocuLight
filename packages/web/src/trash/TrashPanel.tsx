// v9 는 기본 진입점에서 API 를 새로 냈고, 옛 형태는 `legacy` 로 옮겼다.
// 여기서 옛 형태를 쓰는 이유는 그것이 이 화면이 필요로 하는 전부이고,
// 새 형태로 옮기는 일이 이 요구가 말하는 것과 무관하기 때문이다.
import { flexRender } from '@tanstack/react-table';
import {
  getCoreRowModel,
  useLegacyTable,
  type LegacyColumnDef,
} from '@tanstack/react-table/legacy';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef } from 'react';

/**
 * 휴지통 (`FR-SHELL-007` · `SEC-SHELL-001`).
 *
 * **전 워크스페이스의 통합 목록**이라 `워크스페이스` 열을 갖는다. 영구
 * 삭제 버튼은 그 행의 권한을 따라 그리거나 안 그린다 — 판정이 목록
 * 전체가 아니라 행마다이므로 한 목록 안에 열린 행과 닫힌 행이 함께 선다.
 *
 * 서버가 이미 걸러 준 행만 온다. 여기서 다시 거르지 않는다.
 */
export interface TrashRowView {
  nodeId: string;
  workspaceId: string;
  workspaceName: string;
  originalPath: string;
  deletedAt: string;
  deletedBy: string;
  /** 이 행의 영구 삭제 버튼을 그릴 것인가 — 서버의 판정을 그대로 받는다. */
  canPurge: boolean;
}

const ROW_HEIGHT = 40;
const PANEL_HEIGHT = 480;

/** 목록을 어떻게 좁혀 볼 것인가 (`FR-SHELL-007` AC-4 · AC-5). */
export interface TrashLens {
  /** 비면 전 워크스페이스. */
  workspaceId?: string;
  /** `all` 은 **요청**이지 권한이 아니다 — 넓혀 달라 해도 서버가 행마다 좁힌다. */
  scope: 'mine' | 'all';
}

export function TrashPanel({
  rows,
  workspaces = [],
  lens = { scope: 'mine' },
  canWidenScope = false,
  onLens,
  onPurge,
  onRestore,
}: {
  rows: readonly TrashRowView[];
  /** 필터에 세울 워크스페이스들. 접근 가능한 것만 온다. */
  workspaces?: readonly { id: string; name: string }[];
  lens?: TrashLens;
  /**
   * 범위 토글을 세울 것인가 (`FR-SHELL-007` AC-5).
   *
   * 관리 권한이 어디에도 없으면 세우지 않는다 — 눌러도 결과가 그대로인
   * 조작을 보여 주면 사용자는 목록이 고장 났다고 읽는다.
   */
  canWidenScope?: boolean;
  onLens?: (lens: TrashLens) => void;
  onPurge?: (nodeId: string) => void;
  onRestore?: (nodeId: string) => void;
}) {
  const columns = useMemo<LegacyColumnDef<TrashRowView>[]>(
    () => [
      { accessorKey: 'originalPath', header: '경로' },
      { accessorKey: 'workspaceName', header: '워크스페이스' },
      { accessorKey: 'deletedAt', header: '삭제 시각' },
      {
        id: 'actions',
        header: '조작',
        cell: ({ row }) => (
          <>
            <button type="button" onClick={() => onRestore?.(row.original.nodeId)}>
              {row.original.originalPath} 복구
            </button>
            {/* 권한이 없으면 **그리지 않는다** (`SEC-SHELL-001` AC-1) —
                비활성으로 두면 그 조작이 언젠가 열릴 것처럼 읽히는데,
                영구 삭제는 워크스페이스 관리 권한이 있어야 열린다. */}
            {row.original.canPurge && (
              <button type="button" onClick={() => onPurge?.(row.original.nodeId)}>
                {row.original.originalPath} 영구 삭제
              </button>
            )}
          </>
        ),
      },
    ],
    [onPurge, onRestore],
  );

  const table = useLegacyTable({
    data: rows as TrashRowView[],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const scroller = useRef<HTMLDivElement>(null);
  const model = table.getRowModel().rows;
  // 휴지통은 워크스페이스 전부를 합친 목록이라 길어질 수 있다 — 전부
  // 그리면 스크롤이 그 길이에 비례해 느려진다.
  const virtual = useVirtualizer({
    count: model.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    // 창 높이를 못 재는 환경(측정 없는 렌더·시험)에서는 전부 그린다 —
    // 0 으로 접히면 목록이 통째로 사라지고, 그것은 「행이 없다」와
    // 구별되지 않는다.
    overscan: model.length,
  });

  return (
    <div data-panel="trash">
      <label>
        워크스페이스 필터
        <select
          aria-label="워크스페이스 필터"
          value={lens.workspaceId ?? ''}
          onChange={(event) =>
            onLens?.(
              event.target.value === ''
                ? { scope: lens.scope }
                : { scope: lens.scope, workspaceId: event.target.value },
            )
          }
        >
          <option value="">전 워크스페이스</option>
          {workspaces.map((one) => (
            <option key={one.id} value={one.id}>
              {one.name}
            </option>
          ))}
        </select>
      </label>

      {canWidenScope && (
        <button
          type="button"
          onClick={() =>
            onLens?.({
              ...(lens.workspaceId === undefined ? {} : { workspaceId: lens.workspaceId }),
              scope: lens.scope === 'all' ? 'mine' : 'all',
            })
          }
        >
          {lens.scope === 'all' ? '본인분만 보기' : '전체 보기'}
        </button>
      )}

      {/* 스크롤 컨테이너에 높이를 준다 — 없으면 가상화가 잴 창이 없어
          아무 행도 그리지 않는다. 필터를 이 안에 넣지 않는 이유는 목록이
          길어져 스크롤할 때 필터가 함께 밀려 올라가면 안 되기 때문이다. */}
      <div ref={scroller} style={{ height: PANEL_HEIGHT, overflow: 'auto' }}>
      <table>
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => (
                <th key={header.id}>
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {virtual.getVirtualItems().map((item) => {
            const row = model[item.index]!;
            return (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
