import { useEffect, useRef, useState } from 'react';

import { Button } from '../components/ui/button.js';
import { Field } from '../components/ui/field.js';
import { Input } from '../components/ui/input.js';
import { InlineNotice } from '../components/ui/states.js';

const REQUEST_FAILURE = '요청을 처리하지 못했습니다. 잠시 후 다시 시도하십시오.';
const REQUEST_UNAVAILABLE = '지금은 요청을 보낼 수 없습니다.';

export function CredentialForm({
  formId,
  pendingLabel,
  submitLabel,
  passwordHint,
  successNotice,
  onSubmit,
}: {
  formId: 'login' | 'signup';
  pendingLabel: string;
  submitLabel: string;
  passwordHint: 'current-password' | 'new-password';
  successNotice?: string;
  onSubmit?: (input: { name: string; password: string }) => Promise<string | undefined | void>;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const revisionRef = useRef(0);
  const mountedRef = useRef(true);
  const composingRef = useRef(false);
  const suppressNextEnterRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const noticeId = `${formId}-notice`;

  return (
    <form
      data-pre-auth-form={formId}
      aria-busy={submitting || undefined}
      aria-describedby={reason !== null || submitted || onSubmit === undefined ? noticeId : undefined}
      onInput={() => {
        revisionRef.current += 1;
        setReason(null);
        setSubmitted(false);
      }}
      onSubmit={(event) => {
        event.preventDefault();
        if (onSubmit === undefined || submittingRef.current) return;

        submittingRef.current = true;
        setSubmitting(true);
        setReason(null);
        setSubmitted(false);
        const submittedRevision = revisionRef.current;
        const values = new FormData(event.currentTarget);
        const snapshot = {
          name: String(values.get('name') ?? ''),
          password: String(values.get('password') ?? ''),
        };

        let request: Promise<string | undefined | void>;
        try {
          request = onSubmit(snapshot);
        } catch {
          if (mountedRef.current && revisionRef.current === submittedRevision) setReason(REQUEST_FAILURE);
          submittingRef.current = false;
          if (mountedRef.current) setSubmitting(false);
          return;
        }

        void Promise.resolve(request)
          .then((rejection) => {
            if (!mountedRef.current || revisionRef.current !== submittedRevision) return;
            if (typeof rejection === 'string') setReason(rejection);
            else if (successNotice !== undefined) setSubmitted(true);
          })
          .catch(() => {
            if (!mountedRef.current || revisionRef.current !== submittedRevision) return;
            setReason(REQUEST_FAILURE);
          })
          .finally(() => {
            submittingRef.current = false;
            if (mountedRef.current) setSubmitting(false);
          });
      }}
    >
      <div data-slot="field-stack">
        <Field label="이름">
          <Input
            id={`${formId}-name`}
            name="name"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={() => {
              composingRef.current = false;
              suppressNextEnterRef.current = true;
              queueMicrotask(() => {
                suppressNextEnterRef.current = false;
              });
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              if (composingRef.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
                event.preventDefault();
                return;
              }
              if (suppressNextEnterRef.current) {
                suppressNextEnterRef.current = false;
                event.preventDefault();
              }
            }}
            onKeyUp={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                suppressNextEnterRef.current = false;
              }
            }}
          />
        </Field>
        <Field label="비밀번호">
          <Input
            id={`${formId}-password`}
            name="password"
            type="password"
            autoComplete={passwordHint}
          />
        </Field>
      </div>

      {reason === null ? null : (
        <InlineNotice
          id={noticeId}
          role="presentation"
          variant="error"
          title={<span role="alert" data-slot="inline-notice">{reason}</span>}
        />
      )}
      {submitted && successNotice !== undefined ? (
        <InlineNotice id={noticeId} variant="success" title={successNotice} />
      ) : null}
      {onSubmit === undefined ? (
        <InlineNotice id={noticeId} title={REQUEST_UNAVAILABLE} />
      ) : null}

      <Button
        type="submit"
        size="auth"
        loading={submitting}
        disabled={onSubmit === undefined}
        data-pre-auth-submit
      >
        {submitting ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}
