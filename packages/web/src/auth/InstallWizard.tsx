import { useEffect, useId, useRef, useState } from 'react';

import { GrantWarningList, type GrantWarning } from '../acl/GrantConfirm.js';
import { ApiError } from '../api/client.js';
import { Button, Field, Input, Select } from '../components/ui/index.js';
import { ConfirmGate } from '../confirm/ConfirmGate.js';
import { 레벨문구, type DefaultGroupLevel } from '../workspace/NewWorkspaceForm.js';

export type SignupMode = 'open' | 'approval' | 'invite-only';
export interface InstallInput { installSession: string; superuserName: string; password: string; workspaceName: string; defaultGroupLevel: DefaultGroupLevel; signupMode: SignupMode }
export const DEFAULT_GROUP_LEVEL: DefaultGroupLevel = 'edit';
const WORKSPACE_NAME = 'workspace';
const 모드문구: Record<SignupMode, string> = { open: '자유 가입', approval: '승인 후 가입', 'invite-only': '슈퍼유저 직접 등록' };
const 사유문구: Record<string, string> = {
  'empty-password': '비밀번호를 입력하십시오.',
  'unknown-choice': '가입 모드나 초기 권한 값이 올바르지 않습니다.',
  'bad-field': '이름 · 비밀번호 · 워크스페이스 이름은 글자로 넣어 주십시오.',
  'already-installed': '이미 설치가 끝난 인스턴스입니다.',
  'commit-in-flight': '설치가 이미 진행 중입니다. 잠시 뒤 다시 확인하십시오.',
  'workspace-failed': '기본 워크스페이스를 만들지 못했습니다. 서버 로그를 확인하십시오.',
};
const 일반사유 = '설치를 마치지 못했습니다. 입력을 확인하고 다시 시도하십시오.';
type Step = 1 | 2 | 3 | 4 | 5;

// @req IR-SHELL-009
export function InstallWizard({ onVerifyToken, onCommit, onStart = () => window.location.assign('/') }: {
  onVerifyToken: (token: string) => Promise<string>;
  onCommit: (input: InstallInput) => Promise<void>;
  onStart?: () => void;
}) {
  const formId = useId();
  const [step, setStep] = useState<Step>(1);
  const [token, setToken] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [level, setLevel] = useState<DefaultGroupLevel>(DEFAULT_GROUP_LEVEL);
  const [signupMode, setSignupMode] = useState<SignupMode>('approval');
  const [session, setSession] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<InstallInput | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<'token' | 'password' | 'passwordConfirm' | null>(null);
  const [verifying, setVerifying] = useState(false);
  const verifyGuard = useRef(false);
  const verifySequence = useRef(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const tokenRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const passwordConfirmRef = useRef<HTMLInputElement>(null);
  const completeButtonRef = useRef<HTMLButtonElement>(null);
  const warnings: GrantWarning[] = level === 'edit' && signupMode === 'open' ? ['open-signup-edit'] : [];

  useEffect(() => { headingRef.current?.focus(); }, [step]);
  useEffect(() => {
    if (invalidField === 'token') tokenRef.current?.focus();
    if (invalidField === 'password') passwordRef.current?.focus();
    if (invalidField === 'passwordConfirm') passwordConfirmRef.current?.focus();
  }, [invalidField, step]);
  const resetError = () => { setReason(null); setInvalidField(null); };

  // @req SEC-AUTH-015
  const verifyToken = async () => {
    if (verifyGuard.current) return;
    verifyGuard.current = true;
    setVerifying(true);
    resetError();
    const sequence = ++verifySequence.current;
    try {
      const issued = await onVerifyToken(token);
      if (sequence !== verifySequence.current) return;
      setSession(issued);
      setStep(2);
    } catch (error) {
      if (sequence !== verifySequence.current) return;
      if (error instanceof ApiError && error.status === 429) setReason('요청이 많습니다. 잠시 후 다시 시도하십시오.');
      else if (!(error instanceof ApiError) || error.status >= 500) setReason('설치 토큰을 확인하지 못했습니다. 잠시 후 다시 시도하십시오.');
      else { setReason('설치 토큰이 올바르지 않습니다. 서버 콘솔의 값을 다시 확인하십시오.'); setInvalidField('token'); }
      setSession(null);
    } finally {
      if (sequence === verifySequence.current) { verifyGuard.current = false; setVerifying(false); }
    }
  };

  const advanceAccount = () => {
    resetError();
    if (password !== passwordConfirm) { setReason('비밀번호가 일치하지 않습니다.'); setInvalidField('passwordConfirm'); return; }
    setStep(3);
  };

  const openReview = () => {
    if (session === null) { setReason('설치 세션을 다시 확인해야 합니다.'); setStep(1); return; }
    resetError();
    setReviewed({ installSession: session, superuserName: name, password, workspaceName: WORKSPACE_NAME, defaultGroupLevel: level, signupMode });
  };

  // @req FR-CONFIRM-019
  const commit = async () => {
    if (reviewed === null) return;
    try {
      await onCommit(reviewed);
      setReviewed(null); setSession(null); setToken(''); setPassword(''); setPasswordConfirm(''); setReason(null); setStep(5);
    } catch (error) {
      setReviewed(null);
      if (error instanceof ApiError && error.status === 401) { setSession(null); setReason('설치 세션을 다시 확인해야 합니다. 설치 토큰을 다시 검증하십시오.'); setStep(1); return; }
      const rule = error instanceof ApiError ? error.detail?.rule : undefined;
      setReason((rule === undefined ? undefined : 사유문구[rule]) ?? 일반사유);
      if (rule === 'empty-password') { setInvalidField('password'); setStep(2); }
    }
  };

  const goBack = () => { resetError(); setReviewed(null); setStep((current) => Math.max(1, current - 1) as Step); };

  if (step === 5) return (
    <section data-install-wizard data-install-step="complete" aria-labelledby={`${formId}-complete-title`}>
      <h2 id={`${formId}-complete-title`} ref={headingRef} tabIndex={-1}>완료</h2>
      <p>설치가 끝났습니다. 설치 토큰은 사용되어 더 이상 유효하지 않습니다.</p>
      <div data-install-actions><Button size="auth" onClick={onStart}>시작하기</Button></div>
    </section>
  );

  return (
    <form aria-label="설치 마법사" data-install-wizard data-install-step={step} onSubmit={(event) => {
      event.preventDefault();
      if (step === 1) void verifyToken(); else if (step === 2) advanceAccount(); else if (step === 3) setStep(4); else openReview();
    }}>
      <div data-install-progress aria-label={`설치 진행 ${step}/4`}>{step}/4</div>
      {step === 1 ? <section aria-labelledby={`${formId}-token-title`}>
        <h2 id={`${formId}-token-title`} ref={headingRef} tabIndex={-1}>설치 토큰</h2>
        <Field label="설치 토큰" description="서버 콘솔에 출력된 설치 토큰을 입력하세요. 토큰은 출력 후 30분 동안 유효하며, 정확한 만료 시각은 콘솔에서 확인할 수 있습니다. 분실하거나 만료된 경우 서버를 다시 시작해 새 토큰을 확인하세요." error={invalidField === 'token' ? reason ?? undefined : undefined}>
          <Input ref={tokenRef} name="installToken" type="password" value={token} autoComplete="off" autoCapitalize="none" spellCheck={false} onChange={(event) => { setToken(event.target.value); setSession(null); setInvalidField(null); setReason(null); verifySequence.current += 1; verifyGuard.current = false; setVerifying(false); }} />
        </Field>
      </section> : null}
      {step === 2 ? <section aria-labelledby={`${formId}-account-title`}>
        <h2 id={`${formId}-account-title`} ref={headingRef} tabIndex={-1}>최초 슈퍼유저 계정</h2>
        <Field label="슈퍼유저 이름"><Input name="superuserName" autoComplete="username" value={name} onChange={(event) => setName(event.target.value)} /></Field>
        <Field label="비밀번호" error={invalidField === 'password' ? reason ?? undefined : undefined}><Input ref={passwordRef} name="password" type="password" autoComplete="new-password" value={password} onChange={(event) => { setPassword(event.target.value); setInvalidField(null); setReason(null); }} /></Field>
        <Field label="비밀번호 확인" error={invalidField === 'passwordConfirm' ? reason ?? undefined : undefined}><Input ref={passwordConfirmRef} name="passwordConfirm" type="password" autoComplete="new-password" value={passwordConfirm} onChange={(event) => { setPasswordConfirm(event.target.value); setInvalidField(null); setReason(null); }} /></Field>
      </section> : null}
      {step === 3 ? <section aria-labelledby={`${formId}-policy-title`}>
        <h2 id={`${formId}-policy-title`} ref={headingRef} tabIndex={-1}>초기 정책</h2>
        <p data-install-workspace><span>기본 워크스페이스</span><strong>{WORKSPACE_NAME}</strong></p>
        <Field label="가입 모드"><Select name="signupMode" value={signupMode} onChange={(event) => setSignupMode(event.target.value as SignupMode)}>{(Object.keys(모드문구) as SignupMode[]).map((value) => <option key={value} value={value}>{모드문구[value]}</option>)}</Select></Field>
        <Field label="기본 그룹 초기 권한"><Select name="defaultGroupLevel" value={level} onChange={(event) => setLevel(event.target.value as DefaultGroupLevel)}>{(Object.keys(레벨문구) as DefaultGroupLevel[]).map((value) => <option key={value} value={value}>{레벨문구[value]}</option>)}</Select></Field>
        <GrantWarningList warnings={warnings} />
      </section> : null}
      {step === 4 ? <section aria-labelledby={`${formId}-review-title`}>
        <h2 id={`${formId}-review-title`} ref={headingRef} tabIndex={-1}>검토</h2>
        <dl data-install-summary><div><dt>슈퍼유저</dt><dd>{name || '-'}</dd></div><div><dt>가입 방식</dt><dd>{모드문구[signupMode]}</dd></div><div><dt>기본 워크스페이스</dt><dd>{WORKSPACE_NAME}</dd></div><div><dt>default 그룹 권한</dt><dd>{레벨문구[level]}</dd></div></dl>
        <p>설치를 완료하면 로그인·API·MCP 경로가 열립니다.</p><GrantWarningList warnings={warnings} />
      </section> : null}
      {reason === null || invalidField !== null ? null : <p role="alert" data-testid="install-error">{reason}</p>}
      <div data-install-actions>
        {step > 1 ? <Button type="button" size="auth" variant="secondary" onClick={goBack}>이전</Button> : null}
        <Button ref={step === 4 ? completeButtonRef : undefined} type="submit" size="auth" loading={step === 1 && verifying}>{step === 1 && verifying ? '토큰 확인 중…' : step === 4 ? '설치 완료' : '다음'}</Button>
      </div>
      <ConfirmGate open={reviewed !== null} grade="L2" title={`${WORKSPACE_NAME} 를 만들고 권한을 부여합니다`} confirmLabel="설치하고 부여" pendingLabel="설치 중…" restoreFocusRef={completeButtonRef} onConfirm={commit} onCancel={() => setReviewed(null)}>
        <p data-testid="install-immediate">확인하면 설치가 즉시 실행되며 되돌릴 수 없습니다.</p>
        <p data-testid="install-delayed">기본 그룹의 초기 권한 설정은 설치 시 저장되며, 이후 기본 그룹 사용자가 이 워크스페이스의 문서에 접근할 때 적용됩니다.</p>
        <p data-testid="install-summary">관리자 {(reviewed?.superuserName ?? name) || '-'} · default 그룹 초기 권한 {레벨문구[reviewed?.defaultGroupLevel ?? level]}</p>
        <GrantWarningList warnings={warnings} />
      </ConfirmGate>
    </form>
  );
}
