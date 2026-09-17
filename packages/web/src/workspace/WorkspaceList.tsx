import { useEffect, useId, useMemo, useRef, useState } from 'react';

import type { PrincipalRow, ShareRow } from '../api/client.js';
import { PrincipalPicker } from '../principal/PrincipalPicker.js';

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

export type WorkspaceQueryState =
  | { state: 'loading' }
  | { state: 'error'; onRetry: () => void }
  | { state: 'ready'; rows: readonly WorkspaceRowView[] };

export type WorkspaceAdministratorState =
  | { state: 'loading' }
  | { state: 'error'; onRetry: () => void }
  | { state: 'ready'; rows: readonly ShareRow[] };

export interface WorkspaceRenameResult {
  workspace: { id: string; name: string; createdAt: string };
  sidecarSync: 'synced' | 'pending';
}

// @req IR-WORKSPACE-001
export function validateWorkspaceDisplayName(raw: string): { name?: string; error?: string } {
  const name = raw.normalize('NFC').trim();
  if ([...name].length === 0) return { error: '표시 이름을 입력하세요.' };
  if ([...name].length > 120) return { error: '표시 이름은 120자 이하여야 합니다.' };
  if (/[\u0000-\u001f\u007f]/u.test(name)) return { error: '표시 이름에는 제어 문자를 사용할 수 없습니다.' };
  return { name };
}

function duplicateIdentityLabels(rows: readonly WorkspaceRowView[]): ReadonlyMap<string, string> {
  const labels = new Map<string, string>();
  for (const row of rows) {
    const peers = rows.filter((candidate) => candidate.name === row.name);
    if (peers.length < 2) continue;
    let length = Math.min(8, row.id.length);
    while (length < row.id.length && peers.some((peer) => peer.id !== row.id && peer.id.slice(0, length) === row.id.slice(0, length))) length += 1;
    labels.set(row.id, row.id.slice(0, length));
  }
  return labels;
}

// @req IR-WORKSPACE-001
export function WorkspaceManagementPanel({ mode, query, selectedId, onSelect, onRename, administrators, administratorSearchEnabled = true }: {
  mode: 'managed' | 'all';
  query: WorkspaceQueryState;
  selectedId?: string;
  onSelect?: (workspaceId: string) => void;
  onRename?: (workspaceId: string, name: string) => Promise<WorkspaceRenameResult>;
  administrators?: WorkspaceAdministratorState;
  administratorSearchEnabled?: boolean;
}) {
  const rows = query.state === 'ready' ? query.rows : [];
  const selected = rows.find((row) => row.id === selectedId);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [pending, setPending] = useState(false);
  const [adminCandidate, setAdminCandidate] = useState<PrincipalRow>();
  const [conflictingBaseline, setConflictingBaseline] = useState<string>();
  const composing = useRef(false);
  const operationGeneration = useRef(0);
  const mounted = useRef(true);
  const currentSelectedId = useRef<string | undefined>(undefined);
  const previousSelectedId = useRef<string | undefined>(undefined);
  const baselineName = useRef<string | undefined>(undefined);
  const unavailable = selectedId !== undefined && selected === undefined;
  const unavailableRef = useRef<HTMLParagraphElement>(null);
  const inputId = useId();
  const helpId = useId();
  const errorId = useId();
  const conflictId = useId();
  const duplicateLabels = useMemo(() => duplicateIdentityLabels(rows), [rows]);
  currentSelectedId.current = selected?.id;

  useEffect(() => {
    if (previousSelectedId.current !== selected?.id) {
      operationGeneration.current += 1;
      previousSelectedId.current = selected?.id;
      baselineName.current = selected?.name;
      setDraft(selected?.name ?? '');
      setError(undefined);
      setStatus(undefined);
      setPending(false);
      setConflictingBaseline(undefined);
      return;
    }
    if (selected !== undefined && baselineName.current !== selected.name) {
      const dirty = draft !== (baselineName.current ?? '');
      baselineName.current = selected.name;
      if (dirty) setConflictingBaseline(selected.name);
      else setDraft(selected.name);
    }
  }, [selected?.id, selected?.name]);

  useEffect(() => setAdminCandidate(undefined), [selected?.id]);
  useEffect(() => () => { mounted.current = false; operationGeneration.current += 1; }, []);
  useEffect(() => { if (unavailable) unavailableRef.current?.focus(); }, [unavailable]);

  if (query.state === 'loading') return <p role="status">{mode === 'managed' ? '관리 워크스페이스를 불러오는 중입니다.' : '전체 워크스페이스를 불러오는 중입니다.'}</p>;
  if (query.state === 'error') return <div role="alert"><p>워크스페이스를 불러오지 못했습니다.</p><button type="button" onClick={query.onRetry}>다시 불러오기</button></div>;

  return <section data-workspace-management={mode}>
    <h2>{mode === 'managed' ? '워크스페이스 관리' : '전체 워크스페이스'}</h2>
    {rows.length === 0 ? <p>{mode === 'managed' ? '관리 권한이 있는 워크스페이스가 없습니다.' : '등록된 워크스페이스가 없습니다.'}</p> : (
      <ul aria-label={mode === 'managed' ? '관리 워크스페이스' : '전체 워크스페이스'} data-workspace-list="">
        {rows.map((row) => <li key={row.id} data-selected={row.id === selectedId ? '' : undefined}>
          {rows.length === 1 && row.id === selectedId ? <div data-workspace-static="" aria-current="true">
            <span>{row.name}</span><AdminlessBadge adminless={row.adminless} />
          </div> : <button type="button" aria-current={row.id === selectedId ? 'true' : undefined} onClick={() => onSelect?.(row.id)}>
            <span>{row.name}</span>{duplicateLabels.has(row.id) ? <small>{duplicateLabels.get(row.id)}</small> : null}
            <AdminlessBadge adminless={row.adminless} />
          </button>}
        </li>)}
      </ul>
    )}
    {unavailable ? <p ref={unavailableRef} tabIndex={-1} role="status" data-workspace-unavailable="">선택한 워크스페이스를 더 이상 관리할 수 없습니다.</p> : null}
    {selected === undefined ? null : <><form aria-label={`${selected.name} 표시 이름 변경`} data-workspace-detail="" onKeyDown={(event) => {
      if (event.key === 'Enter' && (composing.current || event.nativeEvent.isComposing)) event.preventDefault();
    }} onSubmit={async (event) => {
      event.preventDefault();
      if (pending || composing.current || onRename === undefined) return;
      const valid = validateWorkspaceDisplayName(draft);
      setError(valid.error);
      if (valid.name === undefined || valid.name === selected.name) return;
      setPending(true); setStatus(undefined);
      const generation = operationGeneration.current;
      const capturedId = selected.id;
      try {
        const result = await onRename(capturedId, valid.name);
        if (!mounted.current || operationGeneration.current !== generation || currentSelectedId.current !== capturedId) return;
        baselineName.current = result.workspace.name;
        setDraft(result.workspace.name);
        setConflictingBaseline(undefined);
        setStatus(result.sidecarSync === 'pending' ? '표시 이름은 변경됐지만 재구성 사본 갱신이 대기 중입니다.' : '표시 이름을 변경했습니다.');
      } catch {
        if (!mounted.current || operationGeneration.current !== generation || currentSelectedId.current !== capturedId) return;
        setError('표시 이름을 변경하지 못했습니다. 다시 시도하세요.');
      } finally {
        if (mounted.current && operationGeneration.current === generation && currentSelectedId.current === capturedId) setPending(false);
      }
    }}>
      <h3>{selected.name}</h3>
      <label htmlFor={inputId}>표시 이름</label>
      <input id={inputId} value={draft} disabled={pending} aria-invalid={error === undefined ? undefined : true}
        aria-describedby={[helpId, error === undefined ? undefined : errorId, conflictingBaseline === undefined ? undefined : conflictId].filter(Boolean).join(' ')}
        onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
        onChange={(event) => { setDraft(event.target.value); setError(undefined); }}
        onBlur={() => setError(validateWorkspaceDisplayName(draft).error)} />
      <p id={helpId}>표시 이름을 바꿔도 워크스페이스 ID와 저장 위치는 바뀌지 않습니다.</p>
      {error === undefined ? null : <p id={errorId} role="alert">{error}</p>}
      {conflictingBaseline === undefined ? null : <div id={conflictId} role="alert">
        <p>서버의 표시 이름이 “{conflictingBaseline}”(으)로 변경되었습니다. 현재 초안을 검토하세요.</p>
        <button type="button" onClick={() => setConflictingBaseline(undefined)}>현재 초안 계속 사용</button>
        <button type="button" onClick={() => { setDraft(conflictingBaseline); setConflictingBaseline(undefined); }}>서버 이름 사용</button>
      </div>}
      <button type="submit" disabled={pending || onRename === undefined || conflictingBaseline !== undefined}>변경</button>
      {status === undefined ? null : <p role={status.includes('대기') ? 'alert' : 'status'}>{status}</p>}
    </form>
    <section aria-label="워크스페이스 관리자" data-workspace-administrators="">
      <h3>워크스페이스 관리자</h3>
      {administrators === undefined || administrators.state === 'loading' ? <p role="status">워크스페이스 관리자를 불러오는 중입니다.</p>
        : administrators.state === 'error' ? <div role="alert"><p>워크스페이스 관리자를 불러오지 못했습니다.</p><button type="button" onClick={administrators.onRetry}>다시 불러오기</button></div>
          : administrators.rows.length === 0 ? <p>직접 지정된 워크스페이스 관리자가 없습니다.</p>
            : <ul>{administrators.rows.map((row) => <li key={row.entryId ?? row.principalId}><span>{row.principalName}</span> <small>{row.principalKind === 'user' ? '사용자' : '그룹'}</small></li>)}</ul>}
      {administratorSearchEnabled ? <><h4>워크스페이스 관리자 추가</h4>
        <PrincipalPicker scope={`workspace:${selected.id}`} onPick={setAdminCandidate} onSelectionInvalidated={() => setAdminCandidate(undefined)} />
        {adminCandidate === undefined ? null : <p>{adminCandidate.name} · {adminCandidate.kind === 'user' ? '사용자' : '그룹'}</p>}</> : null}
      <p>관리자 추가·제거는 권위 있는 영향 범위 확인이 제공될 때 연결됩니다.</p>
    </section></>}
  </section>;
}
