import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

import { ApiError, loadSettings, previewRetentionImpact, saveSettings, type RetentionImpactPreview } from '../api/client.js';
import { INSTANCE_SETTING_FIELDS } from '../shell/shell-contract.js';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, Button } from '../components/ui/index.js';

type SettingKey = (typeof INSTANCE_SETTING_FIELDS)[number]['key'];
type SettingValues = Record<SettingKey, string>;
type FieldErrors = Partial<Record<SettingKey, string>>;
type SaveState = 'idle' | 'pending' | 'success' | 'blocked' | 'conflict' | 'rejected' | 'uncertain' | 'retry-ready' | 'accepted-refresh-error';
type RetentionReview = {
  state: 'pending' | 'error' | 'ready' | 'stale' | 'submitting';
  snapshot: SettingValues;
  patch: Partial<SettingValues>;
  impact?: RetentionImpactPreview;
};

export type SettingsLeaveGuardRegistration = {
  readonly ownerId: string;
  readonly dirtyCount: number;
  readonly onContinue: () => void;
  readonly onCancel: () => void;
};
export type SettingsLeaveGuardRegistrar = (registration: SettingsLeaveGuardRegistration) => () => void;

const FIELD_DETAILS = {
  'signup-mode': { kind: 'select', help: '새 계정이 만들어지는 방식을 선택합니다.' },
  'upload-size-limit-bytes': { kind: 'positive', help: '바이트 단위 · 제한을 넘는 업로드는 거부됩니다.' },
  'retained-version-count': { kind: 'positive', help: '개 단위 · 한도를 넘는 가장 오래된 버전부터 정리됩니다.' },
  'trash-retention-days': { kind: 'retention', help: '일 단위 · 0은 무제한' },
  'audit-retention-days': { kind: 'retention', help: '일 단위 · 0은 무제한' },
} as const satisfies Record<SettingKey, { kind: 'select' | 'positive' | 'retention'; help: string }>;
const SETTING_FIELDS = INSTANCE_SETTING_FIELDS.map((field) => ({ ...field, ...FIELD_DETAILS[field.key] }));
const SETTING_KEYS = INSTANCE_SETTING_FIELDS.map((field) => field.key);
const RETENTION_KEYS = ['trash-retention-days', 'audit-retention-days'] as const;
const SAVED_WITH_NEWER_DRAFT = '이전 저장을 확인했습니다. 새 변경은 아직 저장되지 않았습니다.';
const RETENTION_INVARIANT_ERROR = '감사 로그 보존 기간은 휴지통 보존 기간보다 짧을 수 없습니다. 0은 무제한입니다.';

// @req IR-SHELL-002
function pickKnownValues(source: Record<string, string>): SettingValues {
  return Object.fromEntries(SETTING_KEYS.map((key) => [key, source[key] ?? ''])) as SettingValues;
}

// @req FR-ATTACH-006
function finiteNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// @req REL-AUDIT-003
function validate(values: SettingValues): FieldErrors {
  const errors: FieldErrors = {};
  if (!['open', 'approval', 'invite-only'].includes(values['signup-mode'])) errors['signup-mode'] = '가입 모드를 선택하세요.';
  for (const key of ['upload-size-limit-bytes', 'retained-version-count'] as const) {
    const value = finiteNumber(values[key]);
    if (value === null || value <= 0) errors[key] = '0보다 큰 유한한 숫자를 입력하세요.';
  }
  for (const key of ['trash-retention-days', 'audit-retention-days'] as const) {
    const value = finiteNumber(values[key]);
    if (value === null || value < 0) errors[key] = '0 이상의 유한한 숫자를 입력하세요.';
  }
  const trash = finiteNumber(values['trash-retention-days']);
  const audit = finiteNumber(values['audit-retention-days']);
  if (trash !== null && trash >= 0 && audit !== null && audit >= 0) {
    const crossError = trash === 0 && audit !== 0 || trash > 0 && audit !== 0 && audit < trash
      ? RETENTION_INVARIANT_ERROR
      : undefined;
    if (crossError !== undefined) {
      errors['trash-retention-days'] = crossError;
      errors['audit-retention-days'] = crossError;
    }
  }
  return errors;
}

// @req FR-CONFIRM-007
function retentionRisk(before: SettingValues, after: SettingValues): 'safe' | 'reduction' | 'unknown' {
  let result: 'safe' | 'reduction' | 'unknown' = 'safe';
  for (const key of RETENTION_KEYS) {
    const previous = finiteNumber(before[key]);
    const next = finiteNumber(after[key]);
    if (before[key] === after[key] || previous === next) continue;
    if (previous === null || previous < 0 || next === null || next < 0) result = 'unknown';
    else if (next !== 0 && (previous === 0 || next < previous)) return 'reduction';
  }
  return result;
}

function isRoleLoss(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

// @req DR-SHELL-001
function changedKeys(before: SettingValues, after: SettingValues): SettingKey[] {
  return SETTING_KEYS.filter((key) => before[key] !== after[key]);
}

/**
 * 인스턴스 설정 (`IR-SHELL-002` AC-7 · `DR-SHELL-001` AC-3).
 * 서버가 제공하지 않는 보존 영향 건수나 revision을 추측하지 않는다.
 */
export function InstanceSettings({ registerLeaveGuard }: { registerLeaveGuard?: SettingsLeaveGuardRegistrar } = {}) {
  const leaveOwnerId = useId();
  const [baseline, setBaseline] = useState<SettingValues | null>(null);
  const [draft, setDraft] = useState<SettingValues | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'ready' | 'forbidden'>('loading');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [statusDetail, setStatusDetail] = useState('');
  const [retentionReview, setRetentionReview] = useState<RetentionReview | null>(null);
  const [retentionToken, setRetentionToken] = useState('');
  const generation = useRef(0);
  const alive = useRef(true);
  const composing = useRef(new Set<SettingKey>());
  const focusInvalid = useRef(false);
  const uncertain = useRef<{ snapshot: SettingValues; patch: Partial<SettingValues> } | null>(null);
  const acceptedRefresh = useRef<SettingValues | null>(null);
  const retentionSubmitLatch = useRef(false);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const dirtyKeys = useMemo(() => baseline === null || draft === null ? [] : changedKeys(baseline, draft), [baseline, draft]);
  const leaveCleanup = useRef<(() => void) | null>(null);

  // @req IR-SHELL-013
  const continueLeave = useCallback(() => {
    generation.current += 1;
  }, []);
  // @req IR-SHELL-013
  const cancelLeave = useCallback(() => undefined, []);

  useLayoutEffect(() => {
    if (registerLeaveGuard === undefined) return;
    leaveCleanup.current = registerLeaveGuard({
      ownerId: leaveOwnerId,
      dirtyCount: dirtyKeys.length,
      onContinue: continueLeave,
      onCancel: cancelLeave,
    });
  }, [cancelLeave, continueLeave, dirtyKeys.length, leaveOwnerId, registerLeaveGuard]);

  useLayoutEffect(() => () => {
    leaveCleanup.current?.();
    leaveCleanup.current = null;
  }, [registerLeaveGuard]);

  function revokeAccess() {
    uncertain.current = null;
    acceptedRefresh.current = null;
    setRetentionReview(null);
    setBaseline(null); setDraft(null); setErrors({}); setLoadState('forbidden');
  }

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; generation.current += 1; };
  }, []);

  // @req DR-SHELL-001
  async function refreshInitial() {
    const request = ++generation.current;
    setLoadState('loading');
    setStatusDetail('');
    try {
      const loaded = pickKnownValues(await loadSettings());
      if (!alive.current || request !== generation.current) return;
      setBaseline(loaded); setDraft(loaded); setErrors({}); setSaveState('idle'); setLoadState('ready');
    } catch {
      if (alive.current && request === generation.current) setLoadState('error');
    }
  }

  useEffect(() => { void refreshInitial(); }, []);
  useEffect(() => {
    if (!focusInvalid.current) return;
    focusInvalid.current = false;
    const key = SETTING_KEYS.find((candidate) => errors[candidate] !== undefined);
    if (key !== undefined) document.getElementById(`instance-setting-${key}`)?.focus();
  }, [errors]);

  // @req DR-SHELL-001
  function updateDraft(key: SettingKey, value: string) {
    setDraft((current) => current === null ? current : { ...current, [key]: value });
    setErrors((current) => RETENTION_KEYS.includes(key as typeof RETENTION_KEYS[number])
      ? { ...current, 'trash-retention-days': undefined, 'audit-retention-days': undefined }
      : { ...current, [key]: undefined });
    if (saveState !== 'accepted-refresh-error') { setSaveState('idle'); setStatusDetail(''); }
  }

  function closeRetentionReview() {
    if (retentionReview?.state === 'submitting') return;
    generation.current += 1;
    retentionSubmitLatch.current = false;
    setRetentionReview(null);
    setRetentionToken('');
    setSaveState('idle');
    requestAnimationFrame(() => saveButtonRef.current?.focus());
  }

  async function requestRetentionPreview(snapshot: SettingValues, patch: Partial<SettingValues>) {
    const request = ++generation.current;
    retentionSubmitLatch.current = false;
    setRetentionToken('');
    setRetentionReview({ state: 'pending', snapshot, patch });
    try {
      const impact = await previewRetentionImpact(patch);
      if (!alive.current || request !== generation.current) return;
      setRetentionReview({ state: 'ready', snapshot, patch, impact });
    } catch (error) {
      if (!alive.current || request !== generation.current) return;
      if (isRoleLoss(error)) { revokeAccess(); return; }
      setRetentionReview({ state: 'error', snapshot, patch });
    }
  }

  function validateOnBlur(key: SettingKey) {
    if (draft === null || composing.current.has(key)) return;
    setErrors(validate(draft));
  }

  // @req DR-SHELL-001
  function resetDraft() {
    if (baseline === null || uncertain.current !== null || acceptedRefresh.current !== null) return;
    setDraft(baseline); setErrors({}); setSaveState('idle'); setStatusDetail('');
  }

  // @req DR-SHELL-001
  async function readAcceptedValues() {
    const request = ++generation.current;
    const acceptedSnapshot = acceptedRefresh.current;
    setSaveState('pending');
    setStatusDetail('저장은 수락되었고 최신 값을 확인하는 중입니다.');
    try {
      const loaded = pickKnownValues(await loadSettings());
      if (!alive.current || request !== generation.current) return;
      const currentDraft = draft ?? acceptedSnapshot ?? loaded;
      const newerKeys = acceptedSnapshot === null ? [] : changedKeys(acceptedSnapshot, currentDraft);
      const reconciled = { ...loaded };
      for (const key of newerKeys) reconciled[key] = currentDraft[key];
      setBaseline(loaded); setDraft(reconciled); setSaveState('success'); setStatusDetail(newerKeys.length === 0 ? '설정을 저장했습니다.' : SAVED_WITH_NEWER_DRAFT); uncertain.current = null; acceptedRefresh.current = null;
      requestAnimationFrame(() => saveButtonRef.current?.focus());
    } catch (error) {
      if (!alive.current || request !== generation.current) return;
      if (isRoleLoss(error)) { revokeAccess(); return; }
      setSaveState('accepted-refresh-error'); setStatusDetail('저장 요청은 수락되었지만 최신 값을 다시 읽지 못했습니다.');
    }
  }

  // @req DR-SHELL-001
  async function checkUncertainSave() {
    const pending = uncertain.current;
    if (pending === null) return;
    const request = ++generation.current;
    setSaveState('pending');
    try {
      const loaded = pickKnownValues(await loadSettings());
      if (!alive.current || request !== generation.current) return;
      const accepted = Object.keys(pending.patch).every((key) => loaded[key as SettingKey] === pending.snapshot[key as SettingKey]);
      const currentDraft = draft ?? pending.snapshot;
      const newerKeys = changedKeys(pending.snapshot, currentDraft);
      const ownedKeys = accepted
        ? newerKeys
        : Array.from(new Set<SettingKey>([...Object.keys(pending.patch) as SettingKey[], ...newerKeys]));
      const reconciled = { ...loaded };
      for (const key of ownedKeys) reconciled[key] = currentDraft[key];
      setBaseline(loaded);
      if (accepted) {
        setDraft(reconciled); setSaveState('success'); setStatusDetail(newerKeys.length === 0 ? '설정을 저장했습니다.' : SAVED_WITH_NEWER_DRAFT); uncertain.current = null;
      } else {
        setDraft(reconciled); setSaveState('retry-ready'); setStatusDetail('저장 여부를 확인했습니다. 다시 저장할 수 있습니다.'); uncertain.current = null;
      }
    } catch (error) {
      if (!alive.current || request !== generation.current) return;
      if (isRoleLoss(error)) { revokeAccess(); return; }
      setSaveState('uncertain'); setStatusDetail('저장 결과를 아직 확인하지 못했습니다. 다시 확인하세요.');
    }
  }

  // @req DR-SHELL-001
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (baseline === null || draft === null || saveState === 'pending') return;
    const nextErrors = validate(draft);
    if (Object.keys(nextErrors).length > 0) { focusInvalid.current = true; setErrors(nextErrors); return; }
    if (dirtyKeys.length === 0) { setStatusDetail('저장할 변경이 없습니다.'); return; }
    if (uncertain.current !== null) { await checkUncertainSave(); return; }
    if (acceptedRefresh.current !== null) { await readAcceptedValues(); return; }
    const request = ++generation.current;
    const intended = new Set(dirtyKeys);
    const localSnapshot = { ...draft };
    setSaveState('pending'); setStatusDetail('저장 전 최신 값을 확인하는 중입니다.');
    try {
      const remote = pickKnownValues(await loadSettings());
      if (!alive.current || request !== generation.current) return;
      const snapshot = { ...remote };
      for (const key of dirtyKeys) snapshot[key] = localSnapshot[key];
      const remoteRisk = retentionRisk(remote, snapshot);
      const collided = dirtyKeys.some((key) => remote[key] !== baseline[key]
        && remote[key] !== localSnapshot[key]
        && (!RETENTION_KEYS.includes(key as typeof RETENTION_KEYS[number]) || remoteRisk !== 'reduction'));
      setBaseline(remote); setDraft(snapshot);
      if (collided) { setSaveState('conflict'); setStatusDetail('다른 변경을 발견했습니다. 최신 기준과 입력값을 검토한 뒤 다시 저장하세요.'); return; }
      const mergedErrors = validate(snapshot);
      if (Object.keys(mergedErrors).length > 0) { focusInvalid.current = true; setErrors(mergedErrors); setSaveState('idle'); setStatusDetail('최신 서버 값과 함께 다시 확인하세요.'); return; }
      const risk = remoteRisk;
      if (risk !== 'safe') {
        if (risk === 'unknown') {
          setSaveState('blocked');
          setStatusDetail('현재 보존 기간 기준값을 확인할 수 없어 저장하지 않았습니다.');
          return;
        }
        const patch: Partial<SettingValues> = {};
        for (const key of SETTING_KEYS) if (intended.has(key) && snapshot[key] !== remote[key]) patch[key] = snapshot[key];
        await requestRetentionPreview(snapshot, patch);
        return;
      }
      const patch: Partial<SettingValues> = {};
      for (const key of SETTING_KEYS) if (intended.has(key) && snapshot[key] !== remote[key]) patch[key] = snapshot[key];
      if (Object.keys(patch).length === 0) { setDraft(remote); setSaveState('success'); setStatusDetail('최신 값과 일치합니다.'); return; }
      setStatusDetail('설정을 저장하는 중입니다.');
      try {
        await saveSettings(patch);
      } catch (error) {
        if (!alive.current || request !== generation.current) return;
        if (isRoleLoss(error)) { revokeAccess(); return; }
        if (error instanceof ApiError) {
          setSaveState('rejected'); setStatusDetail('저장 요청을 완료하지 못했습니다. 입력은 유지됩니다. 현재 값을 확인한 후 다시 시도하세요.'); return;
        }
        uncertain.current = { snapshot, patch };
        setSaveState('uncertain'); setStatusDetail('저장 결과를 확인해야 합니다. 다시 저장하기 전에 서버 값을 확인하세요.'); return;
      }
      if (alive.current && request === generation.current) { acceptedRefresh.current = snapshot; await readAcceptedValues(); }
    } catch (error) {
      if (!alive.current || request !== generation.current) return;
      if (isRoleLoss(error)) { revokeAccess(); return; }
      setSaveState('retry-ready'); setStatusDetail('저장 전 최신 값을 읽지 못했습니다. 입력값은 유지됩니다.');
    }
  }

  // @req DR-SHELL-001
  async function confirmRetentionReview() {
    const review = retentionReview;
    if (review?.state !== 'ready' || review.impact?.receipt == null || retentionSubmitLatch.current) return;
    if (review.impact.grade === 'L3' && retentionToken !== review.impact.typingToken) return;
    retentionSubmitLatch.current = true;
    const request = ++generation.current;
    setRetentionReview({ ...review, state: 'submitting' });
    try {
      await saveSettings(review.patch, {
        receipt: review.impact.receipt,
        ...(review.impact.typingToken === null ? {} : { token: retentionToken }),
      });
    } catch (error) {
      if (!alive.current || request !== generation.current) return;
      retentionSubmitLatch.current = false;
      if (isRoleLoss(error)) { revokeAccess(); return; }
      if (error instanceof ApiError && error.status === 409 && error.detail?.rule === 'retention-confirmation-stale') {
        setRetentionToken('');
        setRetentionReview({ ...review, state: 'stale' });
        return;
      }
      if (error instanceof ApiError) {
        setRetentionReview(null); setSaveState('rejected'); setStatusDetail('저장 요청을 완료하지 못했습니다. 입력은 유지됩니다.');
        return;
      }
      uncertain.current = { snapshot: review.snapshot, patch: review.patch };
      setRetentionReview(null); setSaveState('uncertain'); setStatusDetail('저장 결과를 확인해야 합니다.');
      return;
    }
    if (!alive.current || request !== generation.current) return;
    acceptedRefresh.current = review.snapshot;
    setRetentionReview(null);
    await readAcceptedValues();
  }

  function handleComposingEnter(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault();
  }

  if (loadState === 'loading') return <p role="status">설정을 불러오는 중입니다.</p>;
  if (loadState === 'error') return <div data-instance-settings-state="error"><p role="alert">설정을 불러오지 못했습니다.</p><button type="button" onClick={() => void refreshInitial()}>다시 불러오기</button></div>;
  if (loadState === 'forbidden') return <p role="alert">설정 권한을 확인할 수 없어 편집을 중단했습니다.</p>;
  if (baseline === null || draft === null) return null;

  const pending = saveState === 'pending' || retentionReview !== null;
  const unresolvedRead = uncertain.current !== null || acceptedRefresh.current !== null;
  const alert = ['blocked', 'conflict', 'rejected', 'uncertain', 'accepted-refresh-error'].includes(saveState);
  const sharedRetentionError = errors['trash-retention-days'] !== undefined
    && errors['trash-retention-days'] === errors['audit-retention-days']
    ? errors['audit-retention-days']
    : undefined;
  return (
    <form aria-label="인스턴스 설정" data-instance-settings="" onKeyDown={handleComposingEnter} onSubmit={(event) => void submit(event)}>
      <header><h2>인스턴스 설정</h2><p>변경한 값은 저장 버튼을 눌러야 적용됩니다.</p></header>
      <div data-instance-settings-fields="">
        {SETTING_FIELDS.map((field) => {
          const helpId = `instance-setting-${field.key}-help`;
          const invalidSignup = field.key === 'signup-mode' && !['open', 'approval', 'invite-only'].includes(draft[field.key]);
          const fieldError = errors[field.key] ?? (invalidSignup ? '현재 저장된 가입 모드를 사용할 수 없습니다. 허용된 값을 선택하세요.' : undefined);
          const sharedError = sharedRetentionError !== undefined && RETENTION_KEYS.includes(field.key as typeof RETENTION_KEYS[number]);
          const errorId = sharedError ? 'instance-setting-retention-error' : `instance-setting-${field.key}-error`;
          const description = fieldError === undefined ? helpId : `${helpId} ${errorId}`;
          return (
            <div data-instance-setting-field="" key={field.key}>
              <label htmlFor={`instance-setting-${field.key}`}>{field.label}</label>
              {field.kind === 'select' ? (
                <select id={`instance-setting-${field.key}`} value={draft[field.key]} aria-describedby={description} aria-invalid={fieldError === undefined ? undefined : true} disabled={pending} onChange={(event) => updateDraft(field.key, event.target.value)}>
                  {invalidSignup ? <option value={draft[field.key]} disabled>현재 저장값을 사용할 수 없음</option> : null}
                  <option value="open">자유 가입</option><option value="approval">가입 요청 + 슈퍼유저 승인</option><option value="invite-only">슈퍼유저 직접 등록</option>
                </select>
              ) : (
                <input id={`instance-setting-${field.key}`} type="text" inputMode="decimal" value={draft[field.key]} aria-describedby={description} aria-invalid={fieldError === undefined ? undefined : true} disabled={pending} onBlur={() => validateOnBlur(field.key)} onCompositionStart={() => composing.current.add(field.key)} onCompositionEnd={() => composing.current.delete(field.key)} onChange={(event) => updateDraft(field.key, event.target.value)} />
              )}
              <span id={helpId} data-instance-setting-help="">{field.help}</span>
              {fieldError === undefined || (sharedError && field.key !== 'audit-retention-days') ? null : <span id={errorId} data-instance-setting-error="">{fieldError}</span>}
            </div>
          );
        })}
      </div>
      <p data-instance-retention-note="">보존 기간을 줄이면 다음 정리 시점에 삭제될 수 있습니다. 현재는 권위 있는 영향 건수를 조회할 수 없어 축소 저장을 막습니다.</p>
      <div data-instance-settings-action="">
        <span aria-live="polite">{dirtyKeys.length === 0 ? '변경 없음' : `변경 ${dirtyKeys.length}건`}</span>
        <button type="button" disabled={pending || unresolvedRead || dirtyKeys.length === 0} onClick={resetDraft}>되돌리기</button>
        <button ref={saveButtonRef} type="submit" disabled={pending || (dirtyKeys.length === 0 && saveState !== 'success')}>저장</button>
      </div>
      {statusDetail === '' ? null : <p role={alert ? 'alert' : 'status'}>{statusDetail}</p>}
      {saveState === 'uncertain' ? <button data-testid="retention-impact-check-result" type="button" onClick={() => void checkUncertainSave()}>저장 상태 확인</button> : null}
      {saveState === 'accepted-refresh-error' ? <button data-testid="retention-impact-readback-retry" type="button" onClick={() => void readAcceptedValues()}>최신 값 다시 읽기</button> : null}
      {retentionReview === null ? null : <AlertDialog open onOpenChange={(open) => { if (!open) closeRetentionReview(); }}>
        <AlertDialogContent data-retention-impact-dialog="" onOpenAutoFocus={(event) => {
          event.preventDefault();
          document.querySelector<HTMLElement>('[data-testid="retention-impact-cancel"]')?.focus();
        }}>
          <AlertDialogTitle>보존 기간 축소</AlertDialogTitle>
          <AlertDialogDescription>권위 있는 현재 영향 범위를 확인한 뒤 저장하세요.</AlertDialogDescription>
          {retentionReview.state === 'pending' ? <p data-testid="retention-impact-pending" aria-live="polite">영향을 계산하고 확인하는 중입니다.</p> : null}
          {retentionReview.state === 'error' ? <div role="alert" data-testid="retention-impact-error">
            <p>영향 건수를 새로 확인할 수 없어 보존 기간 축소를 저장하지 않았습니다.</p>
            <Button data-testid="retention-impact-retry" type="button" onClick={() => void requestRetentionPreview(retentionReview.snapshot, retentionReview.patch)}>다시 확인</Button>
            <Button data-testid="retention-impact-continue-edit" type="button" onClick={closeRetentionReview}>계속 편집</Button>
          </div> : null}
          {retentionReview.impact === undefined ? null : <>
            <p>휴지통 보존 일수 {retentionReview.impact.proposedRetention['trash-retention-days']}</p>
            <p>감사 로그 보존 일수 {retentionReview.impact.proposedRetention['audit-retention-days']}</p>
            <p data-testid="retention-impact-total">총 영향 {retentionReview.impact.impact.total}건</p>
            <p data-testid="retention-impact-breakdown">휴지통 {retentionReview.impact.impact.trashNodes} · 감사 로그 {retentionReview.impact.impact.auditRows} · 미해결 항목 {retentionReview.impact.impact.findings}</p>
            <p data-testid="delayed-notice">저장을 눌러도 기존 데이터는 즉시 삭제되지 않으며 다음 정리 시점에 제거됩니다.</p>
            {retentionReview.state === 'stale' ? <div role="alert" data-testid="retention-impact-stale">
              <p>영향이 변경되었거나 대상이 달라졌습니다. 새 내용을 확인하세요.</p>
              <Button data-testid="retention-impact-review" type="button" onClick={() => void requestRetentionPreview(retentionReview.snapshot, retentionReview.patch)}>새 내용 확인</Button>
            </div> : null}
            {retentionReview.impact.grade === 'L3' ? <label>정확한 영향 건수 {retentionReview.impact.typingToken} 입력
              <input data-testid="retention-impact-token" aria-label={`영향 건수 ${retentionReview.impact.typingToken} 입력`} aria-describedby="retention-impact-token-help" value={retentionToken}
                onCompositionStart={() => composing.current.add('trash-retention-days')}
                onCompositionEnd={() => composing.current.delete('trash-retention-days')}
                onKeyDown={(event) => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault(); }}
                onChange={(event) => setRetentionToken(event.target.value)} />
              <span id="retention-impact-token-help">공백이나 구분자 없이 정확히 입력하세요.</span>
            </label> : null}
          </>}
          <div data-slot="alert-dialog-actions">
            <AlertDialogCancel data-testid="retention-impact-cancel" type="button" disabled={retentionReview.state === 'submitting'} onClick={closeRetentionReview}>계속 편집</AlertDialogCancel>
            {retentionReview.state === 'ready' || retentionReview.state === 'submitting' || retentionReview.state === 'stale' ? <Button data-testid="retention-impact-confirm" type="button" variant="destructive"
              loading={retentionReview.state === 'submitting'} disabled={retentionReview.state !== 'ready' || (retentionReview.impact?.grade === 'L3' && retentionToken !== retentionReview.impact.typingToken)}
              onClick={() => void confirmRetentionReview()}>{retentionReview.state === 'submitting' ? '저장 중…' : '변경 저장'}</Button> : null}
          </div>
        </AlertDialogContent>
      </AlertDialog>}
    </form>
  );
}
