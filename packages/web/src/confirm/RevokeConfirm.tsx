import { useEffect } from 'react';

import { ConfirmGate } from './ConfirmGate.js';
import { ATTACHMENT_REVOKE_NOTICE } from './notices.js';

/** 회수 대상의 유형. 등급이 여기서 갈린다 (`FR-CONFIRM-018`). */
export type RevokeTarget = 'file' | 'directory' | 'workspace';

/**
 * 권한 항목 회수의 확인 (`FR-CONFIRM-018` · `SEC-CONFIRM-006`).
 *
 * 컨테이너 회수는 서브트리 전체에서 접근이 사라지므로 `L2` 이고, 문서
 * 회수는 `L1` 이라 확인 없이 지나간다 — `L1` 은 「확인 다이얼로그를 안
 * 띄운다」가 아니라 「즉시 실행하고 되돌리기 토스트를 띄운다」이므로,
 * 여기서는 곧바로 실행으로 넘긴다.
 *
 * 첨부 고지에 **개수가 없다** (`SEC-CONFIRM-006`). 하위 첨부의 수는
 * 요청자가 못 보는 문서의 것까지 세게 되고, 그 수가 곧 존재 오라클이다.
 */
export function RevokeConfirm({
  open,
  targetKind,
  subjectName,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  targetKind: RevokeTarget;
  subjectName: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}) {
  const 확인필요 = targetKind !== 'file';

  useEffect(() => {
    if (open && !확인필요) onConfirm?.();
  }, [open, 확인필요, onConfirm]);

  if (!open || !확인필요) return null;

  return (
    <ConfirmGate
      open
      grade="L2"
      title={`${subjectName} 의 권한을 회수합니다`}
      onConfirm={() => onConfirm?.()}
      onCancel={() => onCancel?.()}
    >
      <p data-testid="attachment-notice">{ATTACHMENT_REVOKE_NOTICE}</p>
    </ConfirmGate>
  );
}
