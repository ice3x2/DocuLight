import * as Popover from '@radix-ui/react-popover';
import { Command } from 'cmdk';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import type { SearchDocumentBody } from '../api/client.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/states.js';
import { AXIS_LABELS, DEFAULT_AXES, SEARCH_AXES, type SearchAxis } from './search-axes.js';

export type SearchPanelState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'success' }
  | { state: 'error'; onRetry?: () => void };

/** 좌측 텍스트 검색 표면 (FR-SHELL-013 · IR-SHELL-009 AC-3). */
export function SearchPanel({
  documents = [],
  query = '',
  axes = DEFAULT_AXES,
  state,
  onQuery,
  onAxes,
  onOpen,
}: {
  documents?: readonly SearchDocumentBody[];
  query?: string;
  axes?: readonly SearchAxis[];
  state?: SearchPanelState;
  onQuery?: (query: string) => void;
  onAxes?: (axes: readonly SearchAxis[]) => void;
  onOpen?: (nodeId: string) => void;
}) {
  const on = new Set(axes);
  const composing = useRef(false);
  const [keyboardNavigating, setKeyboardNavigating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const labelRef = useRef<HTMLLabelElement>(null);
  useEffect(() => {
    if (inputRef.current !== null) labelRef.current?.setAttribute('for', inputRef.current.id);
  }, []);
  const toggle = (axis: SearchAxis) =>
    onAxes?.(SEARCH_AXES.filter((one) => (one === axis ? !on.has(one) : on.has(one))));
  const blockCompositionEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) setKeyboardNavigating(true);
    if (event.key !== 'Enter' || (!composing.current && !event.nativeEvent.isComposing)) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const results = (() => {
    if (state === undefined)
      return documents.length === 0 ? <Command.Empty>결과가 없습니다.</Command.Empty> : renderDocuments(documents, onOpen);
    if (query.trim() === '') return <EmptyState title="검색어를 입력하세요." />;
    if (axes.length === 0)
      return <EmptyState title="검색 대상을 선택하세요." description="필터에서 검색할 대상을 선택하세요." />;
    if (state.state === 'loading') return <LoadingState label="검색 중…" />;
    if (state.state === 'error')
      return (
        <ErrorState
          label="검색 오류"
          title="검색 결과를 불러오지 못했습니다."
          description="잠시 후 다시 시도하세요."
          {...(state.onRetry === undefined ? {} : { onRetry: state.onRetry })}
        />
      );
    if (documents.length === 0)
      return <EmptyState title="검색 결과가 없습니다." description="검색어 또는 검색 대상을 바꿔 보세요." />;
    return renderDocuments(documents, onOpen);
  })();

  return (
    <Command
      label="검색"
      shouldFilter={false}
      data-search="panel"
      data-keyboard-navigation={keyboardNavigating ? 'true' : undefined}
      onPointerMoveCapture={() => setKeyboardNavigating(false)}
    >
      <div data-search="fixed">
        <label ref={labelRef} data-search="label" htmlFor="search-query">검색</label>
        <div data-search="query-row">
          <Command.Input
            ref={inputRef}
            id="search-query"
            aria-label="검색"
            aria-describedby="search-query-help"
            value={query}
            onValueChange={(next) => onQuery?.(next)}
            onCompositionStart={() => { composing.current = true; }}
            onCompositionEnd={() => { composing.current = false; }}
            onKeyDownCapture={blockCompositionEnter}
            onBlur={() => setKeyboardNavigating(false)}
            placeholder="이름 · 본문 · 태그 · 첨부 이름"
          />
          <Popover.Root>
            <Popover.Trigger aria-label="검색 대상">필터</Popover.Trigger>
            <Popover.Portal>
              <Popover.Content data-search-filter-popover data-slot="popover-content" align="end" sideOffset={4}>
                <strong data-search-filter-title>검색 대상</strong>
                <div data-search-filter-options>
                  {SEARCH_AXES.map((axis) => (
                    <label key={axis} data-search-filter-option>
                      <Checkbox
                        aria-label={AXIS_LABELS[axis]}
                        aria-checked={on.has(axis)}
                        checked={on.has(axis)}
                        onChange={() => toggle(axis)}
                      />
                      <span>{AXIS_LABELS[axis]}</span>
                    </label>
                  ))}
                </div>
                <p data-search-filter-help>
                  공백은 AND, |는 OR입니다. |로 나눈 각 묶음에 2자 이상 낱말이 필요합니다. 괄호는 문자로 검색합니다.
                </p>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
        <p id="search-query-help" data-search="help">2자 이상 낱말을 포함해 입력하세요.</p>
      </div>

      <div
        role="region"
        aria-label="검색 결과"
        aria-busy={state?.state === 'loading' && query.trim() !== '' && axes.length > 0 ? true : undefined}
        data-scroll="y"
        data-search="results"
      >
        <Command.List>{results}</Command.List>
      </div>
    </Command>
  );
}

function renderDocuments(
  documents: readonly SearchDocumentBody[],
  onOpen: ((nodeId: string) => void) | undefined,
) {
  return documents.map((one) => (
    <Command.Item
      key={one.nodeId}
      value={one.nodeId}
      data-testid="search-document"
      data-search-result
      onSelect={() => onOpen?.(one.nodeId)}
    >
      <span data-search-result-title>{one.name}</span>
      <span data-search-result-workspace>{one.workspaceName}</span>
      <span data-search-result-excerpts>
        {one.excerpts.map((excerpt, at) => (
          <span key={excerpt.axis + '-' + at} data-testid="search-excerpt" data-search-result-excerpt>
            {excerpt.text}
          </span>
        ))}
      </span>
    </Command.Item>
  ));
}
