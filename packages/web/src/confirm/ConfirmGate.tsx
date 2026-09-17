import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  Button,
  Field,
  Input,
} from '../components/ui/index.js';

/** Confirmation grade (`FR-CONFIRM-001`). */
export type Grade = 'L1' | 'L2' | 'L3';

export interface ConfirmCounts {
  readonly reached?: number;
  readonly affected?: number;
}

export interface ConfirmGateProps {
  open: boolean;
  grade: Grade;
  title: string;
  description?: ReactNode;
  token?: string | null;
  counts?: ConfirmCounts;
  delayedEffect?: boolean;
  onRecount?: () => void;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  confirmLabel?: string;
  pendingLabel?: string;
  children?: ReactNode;
}

// @req FR-CONFIRM-001
export function ConfirmGate({
  open,
  grade,
  title,
  description = '영향을 확인한 뒤 실행하세요.',
  token,
  counts,
  delayedEffect = false,
  onRecount,
  onConfirm,
  onCancel,
  restoreFocusRef,
  confirmLabel = '실행',
  pendingLabel,
  children,
}: ConfirmGateProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(open);
  const l1Confirmed = useRef(false);
  const [typed, setTyped] = useState('');
  const [seen, setSeen] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const currentCounts = JSON.stringify(counts ?? {});

  useEffect(() => {
    if (wasOpenRef.current && !open) restoreFocusRef?.current?.focus();
    wasOpenRef.current = open;
  }, [open, restoreFocusRef]);

  useEffect(() => {
    if (!open) {
      l1Confirmed.current = false;
      setSeen(null);
      setTyped('');
      setSubmitting(false);
      return;
    }

    if (grade === 'L1') {
      if (!l1Confirmed.current) {
        l1Confirmed.current = true;
        void onConfirm();
      }
      return;
    }

    onRecount?.();
    setSeen((previous) => previous ?? currentCounts);
  }, [currentCounts, grade, onConfirm, onRecount, open]);

  if (!open) return null;

  if (grade === 'L1') {
    return delayedEffect ? (
      <p role="status" data-testid="delayed-notice">
        지금은 아무 일도 일어나지 않습니다. 다음 정리 시점에 한꺼번에 적용합니다.
      </p>
    ) : null;
  }

  const locked = seen !== null && seen !== currentCounts;
  const requiredToken = token ?? null;
  const tokenMatches = grade !== 'L3' || typed === requiredToken;

  // @req FR-CONFIRM-001
  const handleConfirm = async () => {
    if (submitting || locked || !tokenMatches) return;
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AlertDialog open onOpenChange={(nextOpen) => { if (!nextOpen && !submitting) onCancel(); }}>
      <AlertDialogContent
        data-grade={grade}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          if (restoreFocusRef?.current) {
            event.preventDefault();
            restoreFocusRef.current.focus();
          }
        }}
      >
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>

        {counts?.reached === undefined ? null : (
          <p data-testid="reached-count">적용 범위 노드 {counts.reached}개</p>
        )}
        {counts?.affected === undefined ? null : (
          <p data-testid="affected-count">영향 {counts.affected}건</p>
        )}

        {children}

        {delayedEffect ? (
          <p data-testid="delayed-notice">
            지금은 아무 일도 일어나지 않습니다. 다음 정리 시점에 한꺼번에 적용합니다.
          </p>
        ) : null}

        {locked ? (
          <p data-testid="confirm-locked">수치가 바뀌었습니다. 갱신한 값을 확인하세요.</p>
        ) : null}

        {grade === 'L3' && requiredToken !== null ? (
          <Field label={`${requiredToken} 를 입력하세요`}>
            <Input value={typed} onChange={(event) => setTyped(event.target.value)} />
          </Field>
        ) : null}

        <div data-slot="alert-dialog-actions">
          <AlertDialogCancel ref={cancelRef} type="button" disabled={submitting}>취소</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            loading={submitting}
            disabled={locked || !tokenMatches}
            onClick={() => { void handleConfirm(); }}
          >
            {submitting && pendingLabel !== undefined ? pendingLabel : confirmLabel}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
