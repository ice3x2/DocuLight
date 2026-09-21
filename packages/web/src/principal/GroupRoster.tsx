import { useEffect, useRef, useState } from 'react';

import type { GroupDeletePreview, RosterGroup } from '../api/client.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from '../components/ui/alert-dialog.js';
import { PrincipalPicker } from './PrincipalPicker.js';
import {
  principalActionResultIsCurrent,
  principalRequestOwnerKey,
  type GroupRosterRead,
  type PrincipalAction,
  type PrincipalActionResult,
  type PrincipalRequestContext,
} from './request-contract.js';
import './GroupRoster.css';

const hasAuthoritativeMembershipProjection = (group: RosterGroup): boolean => {
  if (group.effectiveMembersComplete !== true) return false;
  if (!Array.isArray(group.effectiveMembers)) return false;
  if (group.systemType === 'default') return group.system === true && group.mode === 'automatic' && group.canAdd === false;
  if (group.systemType === 'superuser') return group.system === true && group.mode === 'managed' && group.canAdd === true;
  return group.system === false && group.systemType === null && group.mode === 'managed' && group.canAdd === true;
};

/**
 * 그룹 관리 (`FR-PRINCIPAL-001` AC-2).
 *
 * 시스템 그룹도 **감추지 않는다** — 감추면 슈퍼유저가 그 그룹의 멤버를 볼
 * 수 없고, 지우기 버튼만 빼면 왜 없는지 알 수 없다. 그렇다고 표시하고
 * 버튼을 두지 않는다 (`CON-PRINCIPAL-002`).
 *
 * 멤버 추가는 `PrincipalPicker` 를 쓴다 (`CON-PRINCIPAL-006` AC-1). 여기에
 * 자체 검색칸을 두면 열거 상한이 이 화면에서만 빠진다. 검색칸이 그룹마다
 * 서는 이유는 **어느 그룹에 넣는지**를 화면이 표현해야 하기 때문이다 —
 * 하나만 두면 대상 그룹이 어딘가 다른 상태에 숨는다.
 */
export function GroupRoster({
  groups = [],
  roster,
  requestContext,
  onRemove,
  onLoadDeletePreview,
  onAddMember,
}: {
  groups?: readonly RosterGroup[];
  roster?: GroupRosterRead;
  requestContext?: PrincipalRequestContext;
  onRemove?: PrincipalAction<[groupId: string]>;
  onLoadDeletePreview?: (groupId: string) => Promise<GroupDeletePreview>;
  onAddMember?: PrincipalAction<[groupId: string, userId: string]> | ((groupId: string, userId: string) => void);
}) {
  const [invalidGroup, setInvalidGroup] = useState<string | null>(null);
  const [scrollable, setScrollable] = useState(false);
  const [busyGroups, setBusyGroups] = useState<ReadonlySet<string>>(() => new Set());
  const [outcomes, setOutcomes] = useState<Readonly<Record<string, { kind: 'success' | 'failure' | 'uncertain'; refreshFailed?: boolean }>>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const resultRefs = useRef(new Map<string, HTMLDivElement>());
  const pendingFocus = useRef<string | null>(null);
  const synchronousGuards = useRef(new Set<string>());
  const actionGenerations = useRef(new Map<string, number>());
  const selectionGenerations = useRef(new Map<string, number>());
  const uncertainSnapshots = useRef(new Map<string, { revision?: number; groups?: readonly RosterGroup[] }>());
  const [deleteDialog, setDeleteDialog] = useState<{
    group: RosterGroup;
    state: 'loading' | 'ready' | 'error' | 'changed' | 'pending';
    preview?: GroupDeletePreview;
    token: string;
    attempted: boolean;
    ownerKey: string;
    restoreIds: readonly string[];
    ownedFocus: boolean;
  } | null>(null);
  const [deleteNotice, setDeleteNotice] = useState<{ kind: 'success' | 'failure' | 'uncertain'; refreshFailed?: boolean } | null>(null);
  const deleteGuard = useRef(false);
  const deleteFocusOwnership = useRef(false);
  const deleteTriggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const tableHeadingRef = useRef<HTMLTableCaptionElement>(null);
  const context = requestContext ?? { principalId: 'legacy', authGeneration: 0, categoryGeneration: 0, queryGeneration: 0 };
  const currentContext = useRef(context);
  currentContext.current = context;
  const ownerKey = principalRequestOwnerKey(context);
  const read = roster ?? { state: 'ready' as const, groups };
  const currentGroups = read.state === 'ready' ? read.groups : [];

  useEffect(() => {
    actionGenerations.current.clear();
    synchronousGuards.current.clear();
    uncertainSnapshots.current.clear();
    setBusyGroups(new Set());
    setOutcomes({});
    setDeleteDialog(null);
    deleteGuard.current = false;
    deleteFocusOwnership.current = false;
  }, [ownerKey]);

  useEffect(() => {
    if (deleteDialog === null) return;
    const trackFocus = (event: FocusEvent) => {
      const target = event.target;
      const dialog = document.querySelector('[data-group-delete-dialog]');
      if (target instanceof HTMLElement && dialog instanceof HTMLElement && !dialog.contains(target)) {
        deleteFocusOwnership.current = false;
      }
    };
    document.addEventListener('focusin', trackFocus, true);
    return () => document.removeEventListener('focusin', trackFocus, true);
  }, [deleteDialog !== null]);

  const samePreview = (left: GroupDeletePreview, right: GroupDeletePreview) =>
    left.id === right.id && left.name === right.name && left.system === right.system
      && left.memberCount === right.memberCount && left.aclEntryCount === right.aclEntryCount;

  const openDelete = (group: RosterGroup) => {
    if (group.system || onRemove === undefined || onLoadDeletePreview === undefined) return;
    const capturedOwner = ownerKey;
    const restoreIds = currentGroups.map((item) => item.id);
    const ownedFocus = document.activeElement === deleteTriggerRefs.current.get(group.id);
    deleteFocusOwnership.current = ownedFocus;
    setDeleteNotice(null);
    setDeleteDialog({ group, state: 'loading', token: '', attempted: false, ownerKey: capturedOwner, restoreIds, ownedFocus });
    void onLoadDeletePreview(group.id).then((fresh) => {
      setDeleteDialog((current) => {
        if (current === null || current.ownerKey !== capturedOwner || current.group.id !== group.id) return current;
        if (fresh.system !== false || fresh.id !== group.id || fresh.name !== group.name
          || !Number.isInteger(fresh.memberCount) || fresh.memberCount < 0
          || !Number.isInteger(fresh.aclEntryCount) || fresh.aclEntryCount < 0) {
          return { ...current, state: 'changed', token: '' };
        }
        return { ...current, state: 'ready', preview: fresh };
      });
    }).catch(() => {
      setDeleteDialog((current) => current?.ownerKey === capturedOwner && current.group.id === group.id
        ? { ...current, state: 'error', token: '' }
        : current);
    });
  };

  const closeDelete = () => {
    if (deleteDialog === null || deleteDialog.state === 'pending') return;
    const target = deleteDialog.ownedFocus ? deleteTriggerRefs.current.get(deleteDialog.group.id) : undefined;
    setDeleteDialog(null);
    requestAnimationFrame(() => target?.focus());
  };

  const acceptDelete = async () => {
    const captured = deleteDialog;
    if (captured === null || captured.state !== 'ready' || captured.preview === undefined
      || captured.token !== captured.preview.name || deleteGuard.current || captured.ownerKey !== ownerKey
      || onRemove === undefined || onLoadDeletePreview === undefined) {
      setDeleteDialog((current) => current === null ? current : { ...current, attempted: true });
      return;
    }
    deleteGuard.current = true;
    setBusyGroups((was) => new Set(was).add(captured.group.id));
    setDeleteDialog({ ...captured, state: 'pending' });
    let finalPreview: GroupDeletePreview;
    try {
      finalPreview = await onLoadDeletePreview(captured.group.id);
    } catch {
      deleteGuard.current = false;
      setBusyGroups((was) => { const next = new Set(was); next.delete(captured.group.id); return next; });
      setDeleteDialog((current) => current?.group.id === captured.group.id ? { ...current, state: 'error', token: '' } : current);
      return;
    }
    if (captured.ownerKey !== principalRequestOwnerKey(currentContext.current) || !samePreview(captured.preview, finalPreview)) {
      deleteGuard.current = false;
      setBusyGroups((was) => { const next = new Set(was); next.delete(captured.group.id); return next; });
      setDeleteDialog((current) => current?.group.id === captured.group.id ? { ...current, state: 'changed', preview: finalPreview, token: '' } : current);
      return;
    }
    let result: PrincipalActionResult;
    try {
      result = await onRemove(captured.group.id);
    } catch {
      result = { ok: false, kind: 'uncertain' };
    }
    deleteGuard.current = false;
    if (captured.ownerKey !== principalRequestOwnerKey(currentContext.current)) return;
    const confirmationStillOwnedFocus = captured.ownedFocus && deleteFocusOwnership.current;
    setDeleteDialog(null);
    if (!result.ok) {
      setBusyGroups((was) => { const next = new Set(was); next.delete(captured.group.id); return next; });
      setDeleteNotice({ kind: result.kind === 'uncertain' ? 'uncertain' : 'failure' });
      return;
    }
    setDeleteNotice({ kind: 'success', refreshFailed: result.refreshFailed });
    if (!confirmationStillOwnedFocus) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (captured.ownerKey !== principalRequestOwnerKey(currentContext.current)) return;
      const index = captured.restoreIds.indexOf(captured.group.id);
      const nextId = captured.restoreIds[index + 1];
      const previousId = captured.restoreIds[index - 1];
      const next = nextId === undefined ? undefined : deleteTriggerRefs.current.get(nextId);
      const previous = previousId === undefined ? undefined : deleteTriggerRefs.current.get(previousId);
      (next ?? previous ?? tableHeadingRef.current)?.focus();
    }));
  };

  useEffect(() => {
    if (read.state !== 'ready' || uncertainSnapshots.current.size === 0) return;
    const reconciled: string[] = [];
    for (const [groupId, captured] of uncertainSnapshots.current) {
      const newerRevision = read.revision !== undefined && captured.revision !== undefined && read.revision > captured.revision;
      const changedLegacySnapshot = read.revision === undefined && captured.revision === undefined && read.groups !== captured.groups;
      if (newerRevision || changedLegacySnapshot) reconciled.push(groupId);
    }
    if (reconciled.length === 0) return;
    setBusyGroups((was) => {
      const next = new Set(was);
      for (const id of reconciled) next.delete(id);
      return next;
    });
    for (const id of reconciled) uncertainSnapshots.current.delete(id);
  }, [read]);

  useEffect(() => {
    const groupId = pendingFocus.current;
    if (groupId === null || outcomes[groupId] === undefined) return;
    pendingFocus.current = null;
    resultRefs.current.get(groupId)?.closest('[data-group-picker]')?.querySelector<HTMLElement>('[role="combobox"]')?.focus();
  }, [outcomes]);

  const addMember = async (group: RosterGroup, userId: string) => {
    if (onAddMember === undefined || group.members.some((member) => member.id === userId)) return;
    if (!group.canAdd || synchronousGuards.current.has(group.id)) return;
    const selectedGeneration = selectionGenerations.current.get(group.id) ?? 0;
    const capturedContext = context;
    const capturedAction = (actionGenerations.current.get(group.id) ?? 0) + 1;
    actionGenerations.current.set(group.id, capturedAction);
    const active = document.activeElement;
    const shouldFocus = active instanceof HTMLElement && active.closest('[data-group-id]')?.getAttribute('data-group-id') === group.id;
    synchronousGuards.current.add(group.id);
    setBusyGroups((was) => new Set(was).add(group.id));
    setOutcomes((was) => { const next = { ...was }; delete next[group.id]; return next; });
    let response: PrincipalActionResult;
    try {
      const returned = await onAddMember(group.id, userId);
      if (returned === undefined) {
        setBusyGroups((was) => { const next = new Set(was); next.delete(group.id); return next; });
        return;
      }
      response = returned;
    } catch {
      response = { ok: false, kind: 'uncertain' };
    }
    synchronousGuards.current.delete(group.id);
    if (capturedAction !== actionGenerations.current.get(group.id)) return;
    if ((selectionGenerations.current.get(group.id) ?? 0) !== selectedGeneration) return;
    if (!principalActionResultIsCurrent(capturedContext, currentContext.current, response)) {
      setBusyGroups((was) => { const next = new Set(was); next.delete(group.id); return next; });
      return;
    }
    if (!response.ok && response.kind === 'stale') {
      setBusyGroups((was) => { const next = new Set(was); next.delete(group.id); return next; });
      return;
    }
    if (response.ok) {
      setBusyGroups((was) => { const next = new Set(was); next.delete(group.id); return next; });
      if (shouldFocus) pendingFocus.current = group.id;
      setOutcomes((was) => ({ ...was, [group.id]: { kind: 'success', refreshFailed: response.refreshFailed } }));
      return;
    }
    if (response.kind === 'uncertain') {
      uncertainSnapshots.current.set(group.id, {
        ...(read.revision === undefined ? {} : { revision: read.revision }),
        ...(read.state === 'ready' ? { groups: read.groups } : {}),
      });
      setOutcomes((was) => ({ ...was, [group.id]: { kind: 'uncertain' } }));
      return;
    }
    setBusyGroups((was) => { const next = new Set(was); next.delete(group.id); return next; });
    if (shouldFocus) pendingFocus.current = group.id;
    setOutcomes((was) => ({ ...was, [group.id]: { kind: 'failure' } }));
  };

  const renderOutcome = (groupId: string) => {
    const outcome = outcomes[groupId];
    if (outcome === undefined) return null;
    return <div
      ref={(element) => { if (element === null) resultRefs.current.delete(groupId); else resultRefs.current.set(groupId, element); }}
      tabIndex={-1}
      aria-live="polite"
      data-group-result
      data-group-result-for={groupId}
    >
      {outcome.kind === 'success' ? <p role="status">멤버 추가 요청이 수락되었습니다.</p> : null}
      {outcome.kind === 'success' && outcome.refreshFailed ? <p role="alert">그룹 목록을 새로 불러오지 못했습니다. 화면 정보 다시 불러오기를 사용하십시오.</p> : null}
      {outcome.kind === 'failure' ? <p role="alert">멤버를 추가하지 못했습니다. 현재 그룹 목록을 확인하고 다시 시도하십시오.</p> : null}
      {outcome.kind === 'uncertain' ? <p role="alert">처리 결과를 확인하지 못했습니다. 그룹 목록을 새로 불러온 뒤 다시 시도하십시오.</p> : null}
      {outcome.kind === 'uncertain' && read.state === 'ready' && read.onRetry !== undefined ? <Button type="button" variant="secondary" onClick={read.onRetry}>그룹 목록 새로 불러오기</Button> : null}
    </div>;
  };

  useEffect(() => {
    const element = scrollRef.current;
    if (element === null) return;
    const update = () => {
      const overflows = element.scrollWidth > element.clientWidth;
      setScrollable(overflows);
      const active = document.activeElement;
      if (overflows && active instanceof HTMLElement && element.contains(active)) {
        active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const activeRect = active.getBoundingClientRect();
        const scrollRect = element.getBoundingClientRect();
        if (activeRect.right > scrollRect.right - 4) element.scrollLeft += activeRect.right - scrollRect.right + 4;
        if (activeRect.left < scrollRect.left + 4) element.scrollLeft -= scrollRect.left - activeRect.left + 4;
      }
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [currentGroups, onAddMember]);

  return (
    <section data-group-roster>
      {deleteNotice?.kind === 'success' ? <p role="status">그룹을 삭제했습니다.</p> : null}
      {deleteNotice?.kind === 'success' && deleteNotice.refreshFailed ? <p role="alert">그룹 목록을 새로 불러오지 못했습니다. 화면 정보 다시 불러오기를 사용하십시오.</p> : null}
      {deleteNotice?.kind === 'failure' ? <p role="alert">그룹을 삭제하지 못했습니다. 목록을 새로 불러온 뒤 다시 확인하십시오.</p> : null}
      {deleteNotice?.kind === 'uncertain' ? <p role="alert">처리 결과를 확인하지 못했습니다. 목록을 새로 불러오십시오.</p> : null}
      {read.state === 'loading' ? <p role="status">그룹 목록을 불러오는 중입니다.</p> : null}
      {read.state === 'error' ? <div role="alert">그룹 목록을 불러오지 못했습니다. <Button variant="secondary" onClick={read.onRetry}>그룹 목록 다시 불러오기</Button></div> : null}
      {read.state === 'ready' ? null : Object.keys(outcomes).map((groupId) => <div key={groupId}>{renderOutcome(groupId)}</div>)}
      {read.state === 'ready' ? <div
        ref={scrollRef}
        data-group-table-scroll
        {...(scrollable ? { 'aria-label': '그룹 표 가로 스크롤', tabIndex: 0 } : {})}
      >
        <table>
          <caption ref={tableHeadingRef} tabIndex={-1}>그룹 관리</caption>
          <thead>
            <tr>
              <th scope="col">이름</th>
              <th scope="col">멤버</th>
              <th scope="col">멤버 추가</th>
              <th scope="col">삭제</th>
            </tr>
          </thead>
          <tbody>
            {currentGroups.length === 0 ? (
              <tr><td colSpan={4} data-group-empty>표시할 그룹 항목이 없습니다.</td></tr>
            ) : currentGroups.map((group) => (
              <tr key={group.id} data-group-id={group.id}>
                <td data-group-name>
                  <span>{group.name}</span>
                  {group.system ? <span data-testid="system-group" data-system-group>시스템 그룹</span> : null}
                </td>
                <td>
                  {!hasAuthoritativeMembershipProjection(group) ? (
                    <p data-group-help>활성 멤버 정보를 확인할 수 없습니다.</p>
                  ) : (group.systemType === 'default' ? group.effectiveMembers : group.members).length === 0 ? (
                    <p data-group-help>{group.systemType === 'default' ? '현재 활성 멤버가 없습니다.' : '멤버가 없습니다.'}</p>
                  ) : (
                    <ul data-group-members>
                      {(group.systemType === 'default' ? group.effectiveMembers : group.members).map((member) => <li key={member.id}>{member.name}</li>)}
                    </ul>
                  )}
                  {group.system ? <p data-group-help>시스템 그룹의 멤버십은 해당 관리 규칙을 따릅니다.</p> : null}
                </td>
                <td>
                  {!hasAuthoritativeMembershipProjection(group) ? (
                    <p data-group-help>멤버 정보를 확인할 수 없어 추가할 수 없습니다.</p>
                  ) : !group.canAdd ? (
                    <p data-group-help>활성 사용자는 자동으로 이 그룹에 속합니다.</p>
                  ) : onAddMember === undefined ? (
                    <p data-group-help>멤버 추가 기능을 사용할 수 없습니다.</p>
                  ) : (
                    <div role="region" aria-label={`${group.name}의 멤버 추가`} data-group-picker>
                      <PrincipalPicker
                        scope={`group:${group.id}`}
                        label={`${group.name} 멤버 검색`}
                        mode="user-only"
                        excludedIds={[...new Set([...group.members, ...group.effectiveMembers].map((member) => member.id))]}
                        disabled={busyGroups.has(group.id)}
                        onSelectionInvalidated={() => {
                          selectionGenerations.current.set(group.id, (selectionGenerations.current.get(group.id) ?? 0) + 1);
                          setInvalidGroup(null);
                        }}
                        onPick={(row) => {
                          if (row.kind !== 'user') {
                            setInvalidGroup(group.id);
                            return;
                          }
                          setInvalidGroup(null);
                          void addMember(group, row.id);
                        }}
                      />
                      {invalidGroup === group.id ? <p role="status" data-group-help>그룹은 멤버로 추가할 수 없습니다.</p> : null}
                      {busyGroups.has(group.id) && !uncertainSnapshots.current.has(group.id) ? <p role="status">멤버를 추가하는 중입니다.</p> : null}
                      {renderOutcome(group.id)}
                    </div>
                  )}
                </td>
                <td data-group-delete>
                  {group.system ? (
                    <p data-group-help>시스템 그룹은 삭제하거나 이름을 바꿀 수 없습니다.</p>
                  ) : (
                    <>
                      <button
                        ref={(element) => { if (element === null) deleteTriggerRefs.current.delete(group.id); else deleteTriggerRefs.current.set(group.id, element); }}
                        type="button"
                        aria-label={`${group.name} 삭제`}
                        disabled={onRemove === undefined || onLoadDeletePreview === undefined || busyGroups.has(group.id)}
                        onClick={() => openDelete(group)}
                      >삭제</button>
                      {onRemove === undefined || onLoadDeletePreview === undefined ? <p data-group-help>삭제 확인 기능이 연결되지 않아 여기서 삭제할 수 없습니다.</p> : null}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div> : null}
      <AlertDialog open={deleteDialog !== null} onOpenChange={(open) => { if (!open) closeDelete(); }}>
        {deleteDialog === null ? null : <AlertDialogContent
          data-grade="L3"
          data-group-delete-dialog
          onOpenAutoFocus={(event) => { event.preventDefault(); document.querySelector<HTMLElement>('[data-group-delete-cancel]')?.focus(); }}
          onCloseAutoFocus={(event) => { event.preventDefault(); }}
          onEscapeKeyDown={(event) => { if (deleteDialog.state === 'pending') event.preventDefault(); }}
          onBlurCapture={(event) => {
            const next = event.relatedTarget;
            if (next instanceof HTMLElement && !event.currentTarget.contains(next)) deleteFocusOwnership.current = false;
          }}
        >
          <AlertDialogTitle>{deleteDialog.group.name} 그룹 삭제</AlertDialogTitle>
          <AlertDialogDescription>현재 삭제 영향을 확인하고 정확한 그룹 이름을 입력하십시오.</AlertDialogDescription>
          {deleteDialog.state === 'loading' ? <p role="status">삭제 영향을 불러오는 중입니다.</p> : null}
          {deleteDialog.state === 'error' ? <p role="alert">삭제 영향을 불러오지 못했습니다.</p> : null}
          {deleteDialog.state === 'changed' ? <p role="alert">삭제 영향이 바뀌었습니다. 취소하고 다시 확인하십시오.</p> : null}
          {deleteDialog.preview !== undefined ? <div data-group-delete-impact>
            <p>멤버 {deleteDialog.preview.memberCount}명</p>
            <p>멤버의 계정은 삭제되지 않습니다.</p>
            <p>이 그룹에 부여된 권한 항목 {deleteDialog.preview.aclEntryCount}건이 함께 제거됩니다. 되돌릴 수 없습니다.</p>
          </div> : null}
          {deleteDialog.state === 'ready' || deleteDialog.state === 'pending' ? <label>
            정확한 그룹 이름 {deleteDialog.preview?.name} 입력
            <Input
              style={{ border: '1px solid var(--border-strong)' }}
              value={deleteDialog.token}
              aria-invalid={deleteDialog.attempted && deleteDialog.token !== deleteDialog.preview?.name ? true : undefined}
              disabled={deleteDialog.state === 'pending'}
              onChange={(event) => setDeleteDialog((current) => current === null ? current : { ...current, token: event.target.value, attempted: false })}
              onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault(); }}
            />
          </label> : null}
          <div data-group-delete-actions>
            <AlertDialogCancel data-group-delete-cancel type="button" disabled={deleteDialog.state === 'pending'} onClick={closeDelete}>취소</AlertDialogCancel>
            {deleteDialog.state === 'error' ? <Button type="button" variant="secondary" onClick={() => openDelete(deleteDialog.group)}>다시 불러오기</Button> : null}
            <Button
              type="button"
              variant="destructive"
              disabled={deleteDialog.state !== 'ready' || deleteDialog.token !== deleteDialog.preview?.name}
              onClick={() => { void acceptDelete(); }}
            >그룹 삭제</Button>
          </div>
        </AlertDialogContent>}
      </AlertDialog>
    </section>
  );
}
