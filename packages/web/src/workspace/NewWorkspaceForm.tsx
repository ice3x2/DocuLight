import { useId, useRef, useState } from 'react';

import { ApiError, type PrincipalRow, type WorkspaceCreateBody } from '../api/client.js';
import { GrantWarningList, type GrantWarning } from '../acl/GrantConfirm.js';
import { ConfirmGate } from '../confirm/ConfirmGate.js';
import { PrincipalPicker } from '../principal/PrincipalPicker.js';

export type DefaultGroupLevel = 'none' | 'view' | 'edit';

export const 레벨문구: Record<DefaultGroupLevel, string> = {
  none: '없음',
  view: '보기',
  edit: '편집',
};

export interface WorkspaceCreateInput {
  name: string;
  administratorId: string;
  defaultGroupLevel: DefaultGroupLevel;
}
export type WorkspaceCreateOutcome = WorkspaceCreateBody | { blocked: 'authentication' };

type FrozenCreation = WorkspaceCreateInput & {
  administrator: PrincipalRow;
  warnings: readonly GrantWarning[];
};

const sameWarnings = (left: readonly GrantWarning[], right: readonly GrantWarning[]) =>
  left.length === right.length && left.every((warning, index) => warning === right[index]);

export function validateWorkspaceDisplayName(raw: string): { name?: string; error?: string } {
  const name = raw.normalize('NFC').trim();
  if ([...name].length === 0) return { error: '이름을 입력하세요.' };
  if ([...name].length > 120) return { error: '이름은 120자 이하여야 합니다.' };
  if (/[\u0000-\u001f\u007f]/u.test(name)) return { error: '이름에는 제어 문자를 사용할 수 없습니다.' };
  return { name };
}

// @req IR-WORKSPACE-001
export function NewWorkspaceForm({ onCreate, onLoadWarnings, onCancel }: {
  onCreate: (input: WorkspaceCreateInput) => Promise<WorkspaceCreateOutcome>;
  onLoadWarnings: (input: Pick<WorkspaceCreateInput, 'administratorId' | 'defaultGroupLevel'>) => Promise<readonly GrantWarning[]>;
  onCancel?: () => void;
}) {
  const formId = useId();
  const nameHelpId = `${formId}-name-help`;
  const administratorHelpId = `${formId}-administrator-help`;
  const levelHelpId = `${formId}-level-help`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const nameSelection = useRef<[number, number] | null>(null);
  const pendingRef = useRef(false);
  const warningPendingRef = useRef(false);
  const composing = useRef(false);
  const warningGeneration = useRef(0);
  const [name, setName] = useState('');
  const [administrator, setAdministrator] = useState<PrincipalRow | null>(null);
  const [level, setLevel] = useState<DefaultGroupLevel>('none');
  const [frozen, setFrozen] = useState<FrozenCreation | null>(null);
  const [error, setError] = useState(undefined as string | undefined);
  const [warningRetry, setWarningRetry] = useState<WorkspaceCreateInput>();
  const [warningChanged, setWarningChanged] = useState(false);
  const [pending, setPending] = useState(false);
  const [warningPending, setWarningPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);

  const captureNameSelection = () => {
    const input = nameRef.current;
    if (input === null || input.selectionStart === null || input.selectionEnd === null) return;
    nameSelection.current = [input.selectionStart, input.selectionEnd];
  };

  const restoreNameSelection = () => {
    const selection = nameSelection.current;
    if (selection === null) return;
    queueMicrotask(() => { nameRef.current?.setSelectionRange(selection[0], selection[1]); });
  };

  const invalidateConfirmation = () => {
    warningGeneration.current += 1;
    setFrozen(null);
    setWarningRetry(undefined);
    setWarningChanged(false);
    warningPendingRef.current = false;
    setWarningPending(false);
  };

  const loadWarnings = async (input: WorkspaceCreateInput, chosen: PrincipalRow) => {
    const generation = warningGeneration.current;
    warningPendingRef.current = true;
    setWarningPending(true);
    try {
      const warnings = await onLoadWarnings(input);
      if (warningGeneration.current !== generation) return;
      setFrozen({ ...input, administrator: chosen, warnings });
      setWarningRetry(undefined);
      setError(undefined);
    } catch {
      if (warningGeneration.current !== generation) return;
      setFrozen(null);
      setWarningRetry(input);
      setError('확인 정보를 불러오지 못했습니다. 생성 요청은 보내지 않았습니다.');
    } finally {
      if (warningGeneration.current === generation) {
        warningPendingRef.current = false;
        setWarningPending(false);
      }
    }
  };

  const prepare = async () => {
    if (administrator === null || composing.current || pendingRef.current || warningPendingRef.current) return;
    captureNameSelection();
    const valid = validateWorkspaceDisplayName(name);
    setError(valid.error);
    if (valid.name === undefined) return;
    const input = { name: valid.name, administratorId: administrator.id, defaultGroupLevel: level };
    setWarningChanged(false);
    await loadWarnings(input, administrator);
  };

  const create = async () => {
    if (frozen === null || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    try {
      let warnings: readonly GrantWarning[];
      try {
        warnings = await onLoadWarnings(frozen);
      } catch {
        setFrozen(null);
        setWarningRetry(frozen);
        setError('확인 정보를 불러오지 못했습니다. 생성 요청은 보내지 않았습니다.');
        return;
      }
      if (!sameWarnings(warnings, frozen.warnings)) {
        setFrozen({ ...frozen, warnings });
        setWarningChanged(true);
        return;
      }
      setWarningChanged(false);
      const outcome = await onCreate({ name: frozen.name, administratorId: frozen.administratorId, defaultGroupLevel: frozen.defaultGroupLevel });
      if ('blocked' in outcome) {
        setFrozen(null);
        setUncertain(true);
        setError('로그인 상태가 변경되어 워크스페이스를 만들지 않았습니다.');
        return;
      }
      setFrozen(null);
      setName('');
      setAdministrator(null);
      setLevel('none');
      setUncertain(false);
    } catch (caught) {
      setFrozen(null);
      if (caught instanceof ApiError && caught.detail?.rule === 'unknown-administrator') {
        setAdministrator(null);
        warningGeneration.current += 1;
        setWarningRetry(undefined);
        setUncertain(false);
        setError('선택한 관리자를 확인할 수 없습니다. 관리자를 다시 선택하세요.');
        return;
      }
      const knownFailure = caught instanceof ApiError && (caught.status === 400 || caught.status === 403 || caught.status === 404);
      setUncertain(!knownFailure);
      setError(knownFailure
          ? '입력 또는 권한이 변경되어 만들지 못했습니다. 내용을 확인한 뒤 다시 시도하세요.'
          : '생성 완료 여부를 확인하지 못했습니다. 다시 만들기 전에 전체 워크스페이스 목록을 확인하세요.');
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  return <section data-workspace-create="">
    <header data-workspace-create-header="">
      <button type="button" disabled={pending} onClick={onCancel}>전체 워크스페이스로 돌아가기</button>
      <h3>새 워크스페이스</h3>
    </header>
    <form aria-label="새 워크스페이스" onKeyDown={(event) => {
      if (event.key === 'Enter' && (composing.current || event.nativeEvent.isComposing)) event.preventDefault();
    }} onSubmit={(event) => { event.preventDefault(); void prepare(); }}>
      <div data-workspace-create-field="">
        <label htmlFor={`${formId}-name`}>이름 (필수)</label>
        <input ref={nameRef} id={`${formId}-name`} value={name} disabled={pending} required aria-invalid={error?.startsWith('이름') ? true : undefined}
          aria-describedby={[nameHelpId, error?.startsWith('이름') ? `${formId}-error` : undefined].filter(Boolean).join(' ')}
          onInvalid={(event) => { event.preventDefault(); setError('이름을 입력하세요.'); }}
          onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
          onChange={(event) => { setName(event.target.value); setError(undefined); invalidateConfirmation(); setUncertain(false); }} />
        <p id={nameHelpId}>120자 이하의 워크스페이스 표시 이름을 입력하세요.</p>
      </div>

      <div data-workspace-create-field="">
        <span>워크스페이스 관리자 (필수)</span>
        <PrincipalPicker label="워크스페이스 관리자 (필수)" ariaRequired ariaDescribedBy={administratorHelpId} scope="group:system-superuser" onPick={(row) => { setAdministrator(row); invalidateConfirmation(); setUncertain(false); }} onSelectionInvalidated={() => { setAdministrator(null); invalidateConfirmation(); setUncertain(false); }} />
        {administrator === null ? <p id={administratorHelpId}>관리할 사용자 또는 그룹을 검색해 선택하세요.</p> : <p id={administratorHelpId} data-selected-principal="">
          <span>{administrator.name} · {administrator.kind === 'user' ? '사용자' : '그룹'} · {administrator.status === 'active' ? '활성' : administrator.status === 'pending' ? '대기' : '비활성'}</span>
          <button type="button" disabled={pending} onClick={() => { setAdministrator(null); invalidateConfirmation(); setUncertain(false); }}>선택 해제</button>
        </p>}
      </div>

      <div data-workspace-create-field="">
        <label htmlFor={`${formId}-level`}>기본 그룹 초기 권한</label>
        <select id={`${formId}-level`} aria-describedby={levelHelpId} value={level} disabled={pending} onChange={(event) => { setLevel(event.target.value as DefaultGroupLevel); invalidateConfirmation(); setUncertain(false); }}>
          {(['none', 'view', 'edit'] as const).map((one) => <option key={one} value={one}>{레벨문구[one]}</option>)}
        </select>
        <p id={levelHelpId}>없음을 선택하면 기본 그룹 ACL을 만들지 않습니다. 지정 관리자와 슈퍼유저는 계속 접근할 수 있습니다.</p>
      </div>

      {error === undefined ? null : <p id={`${formId}-error`} role="alert">{error}</p>}
      {warningPending ? <p role="status">권한 부여 내용을 확인하는 중입니다</p> : null}
      {warningRetry === undefined || administrator === null ? null : <button type="button" onClick={() => { captureNameSelection(); void loadWarnings(warningRetry, administrator); }}>확인 정보 다시 불러오기</button>}
      <footer data-workspace-create-actions="">
        <button type="button" disabled={pending} onClick={onCancel}>취소</button>
        <button ref={triggerRef} type="submit" disabled={administrator === null || pending || warningPending || uncertain}>만들기</button>
      </footer>
    </form>

    <ConfirmGate open={frozen !== null} grade="L2" title={`${frozen?.name ?? '새 워크스페이스'}를 만들고 권한을 부여합니다`}
      description="워크스페이스와 초기 권한을 함께 적용합니다." restoreFocusRef={triggerRef}
      pendingLabel="만드는 중" onConfirm={create} onCancel={() => { if (!pending) { setFrozen(null); restoreNameSelection(); } }}>
      <p data-testid="grant-summary" aria-readonly="true" aria-label="확정된 워크스페이스 생성 내용">이름 {frozen?.name ?? '-'} · 관리자 {frozen?.administrator.name ?? '-'} · 관리 · 기본 그룹 초기 권한 {frozen === null ? '-' : 레벨문구[frozen.defaultGroupLevel]}</p>
      <GrantWarningList warnings={frozen?.warnings ?? []} />
      {warningChanged ? <p role="alert">확인 정보가 바뀌었습니다. 바뀐 내용을 확인하고 다시 실행하세요.</p> : null}
      <p data-testid="delayed-notice">워크스페이스와 초기 권한은 지금 만들어집니다. 앞으로 만드는 문서는 이 접근 설정을 물려받으며, 이미 읽은 내용은 되돌릴 수 없습니다.</p>
    </ConfirmGate>
  </section>;
}
