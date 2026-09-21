import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Button, Field, InlineNotice, Input } from '../components/ui/index.js';

export const PASSWORD_REASONS: Readonly<Record<string, string>> = { 'wrong-password': '현재 비밀번호가 올바르지 않습니다', 'empty-password': '새 비밀번호를 입력하세요', 'self-only': '자기 비밀번호만 바꿀 수 있습니다', 'unknown-account': '계정을 찾을 수 없습니다' };
const GENERIC_FAILURE = '비밀번호를 바꾸지 못했습니다. 잠시 후 다시 시도하십시오.';

export interface PasswordChangeLifecycle { dispatched: () => void }

export function PasswordChangeForm({ onSubmit }: { onSubmit?: (input: { current: string; next: string }, lifecycle: PasswordChangeLifecycle) => Promise<string | undefined | void> }) {
  const currentRef = useRef<HTMLInputElement>(null); const nextRef = useRef<HTMLInputElement>(null); const lock = useRef(false);
  const [feedback, setFeedback] = useState<string | null>(null); const [submitting, setSubmitting] = useState(false);
  const currentError = feedback === 'wrong-password' ? PASSWORD_REASONS[feedback] : undefined;
  const nextError = feedback === 'empty-password' ? PASSWORD_REASONS[feedback] : undefined;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (lock.current) return; lock.current = true; setSubmitting(true); setFeedback(null);
    try {
      if (onSubmit === undefined) throw new Error('unavailable');
      let dispatched = false;
      const result = await onSubmit(
        { current: currentRef.current?.value ?? '', next: nextRef.current?.value ?? '' },
        { dispatched: () => {
          if (dispatched) return;
          dispatched = true;
          if (currentRef.current !== null) currentRef.current.value = '';
          if (nextRef.current !== null) nextRef.current.value = '';
        } },
      );
      if (typeof result === 'string') { const known = Object.hasOwn(PASSWORD_REASONS, result); setFeedback(known ? result : 'generic'); if (result === 'wrong-password') currentRef.current?.focus(); if (result === 'empty-password') nextRef.current?.focus(); }
    } catch { setFeedback('generic'); } finally { lock.current = false; setSubmitting(false); }
  };
  const guardCompositionEnter = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault();
  };
  return <form data-password-change-form data-testid="password-change-form" aria-busy={submitting || undefined} onKeyDown={guardCompositionEnter} onSubmit={(event) => void submit(event)}>
    <InlineNotice title="비밀번호 변경의 영향" variant="warning">바꾸면 이 계정의 모든 세션과 모든 액세스 토큰이 끊깁니다. 다시 로그인해야 하고, 발급해 둔 액세스 토큰도 다시 발급해야 합니다.</InlineNotice>
    <div data-password-change-fields>
      <Field label="현재 비밀번호" error={currentError === undefined ? undefined : <span role="alert">{currentError}</span>}><Input ref={currentRef} name="current" type="password" autoComplete="current-password" onChange={() => { if (feedback === 'wrong-password') setFeedback(null); }} /></Field>
      <Field label="새 비밀번호" error={nextError === undefined ? undefined : <span role="alert">{nextError}</span>}><Input ref={nextRef} name="next" type="password" autoComplete="new-password" onChange={() => { if (feedback === 'empty-password') setFeedback(null); }} /></Field>
    </div>
    {feedback !== null && currentError === undefined && nextError === undefined ? <p role="alert" data-password-change-error>{feedback === 'generic' ? GENERIC_FAILURE : PASSWORD_REASONS[feedback]}</p> : null}
    <div data-password-change-actions><Button type="submit" loading={submitting}>{submitting ? '변경 중…' : '비밀번호 바꾸기'}</Button></div>
  </form>;
}
