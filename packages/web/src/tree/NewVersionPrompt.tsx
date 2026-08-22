import { useEffect, useRef } from 'react';

import type { TreeNodeView } from './tree-contract.js';

/**
 * 새 버전 올리기의 확인과 파일 고르기 (`FR-SHELL-008` AC-2 · AC-5).
 *
 * 되돌릴 수 없는 파일에는 **경고를 먼저 세운다.** md 는 이전 본문이 버전으로
 * 남아 되찾을 수 있으므로 세우지 않는다 — 모든 덮어쓰기에 경고를 붙이면
 * 사용자가 그것을 읽지 않게 되고, 정작 되돌릴 수 없는 자리에서도 지나친다.
 *
 * 되돌릴 수 있는지는 **서버가 판정해 보낸 값**을 쓴다. 여기서 확장자를 다시
 * 보면 버전 보관 규칙이 바뀔 때 경고만 옛 규칙을 따른다.
 *
 * 어느 쪽이든 **그만둘 수 있다.** 파일을 고르는 것 말고 없앨 방법이 없으면
 * 잘못 연 사용자가 아무 파일이나 고르게 된다.
 */
export function NewVersionPrompt({
  node,
  onPick,
  onCancel,
}: {
  node: TreeNodeView;
  onPick: (file: File) => void;
  onCancel: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const warns = node.overwriteIrreversible === true;

  // 열리면 파일 고르기로 초점을 옮긴다 — 옮기지 않으면 키보드 사용자는
  // 방금 열린 것이 무엇인지 모른 채 문서 어딘가에 초점을 둔 상태가 된다.
  useEffect(() => {
    input.current?.focus();
  }, []);

  // Escape 로 닫힌다. 경고를 세워 놓고 닫는 방법이 버튼 하나뿐이면 그것을
  // 못 찾은 사용자에게는 화면이 멈춘 것으로 보인다.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const picker = (
    <input
      ref={input}
      type="file"
      aria-label={`${node.name} 새 버전 파일`}
      onChange={(event) => {
        const file = event.target.files?.[0];
        if (file !== undefined) onPick(file);
      }}
    />
  );

  const cancel = (
    <button type="button" onClick={onCancel}>
      그만두기
    </button>
  );

  if (!warns)
    return (
      <div>
        {picker}
        {cancel}
      </div>
    );

  return (
    // `alertdialog` 인 이유는 잃을 것이 있다는 사실을 먼저 알려야 하기
    // 때문이다 — 보통 대화상자는 읽지 않고 지나칠 수 있다. `aria-modal` 은
    // 뒤가 조작 대상이 아님을 알린다: 없으면 보조 기술 사용자가 경고를
    // 지나쳐 뒤의 트리를 계속 훑는다.
    <div role="alertdialog" aria-modal="true" aria-label="새 버전 올리기">
      <p>
        {node.name} 은(는) 버전으로 보관되지 않습니다. 새 버전을 올리면 지금 내용을 되돌릴 수
        없습니다.
      </p>
      {picker}
      {cancel}
    </div>
  );
}
