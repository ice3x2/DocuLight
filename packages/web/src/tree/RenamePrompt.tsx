import { useEffect, useRef, useState } from 'react';

import type { TreeNodeView } from './tree-contract.js';

/**
 * 이름을 바꿀 자리 (`FR-SHELL-015` AC-1).
 *
 * **경고를 세우지 않는다.** 새 버전 올리기와 달리 개명은 되돌릴 수 있고
 * 잃는 것이 없다 — 모든 조작에 경고를 붙이면 사용자가 그것을 읽지 않게
 * 되고, 정작 되돌릴 수 없는 자리에서도 지나친다.
 *
 * **이름 규칙을 여기서 판정하지 않는다.** 금지 문자와 길이 상한과 이름
 * 충돌은 전부 서버가 소유하며(`validateNodeName` · `resolveNameCollision`),
 * 화면이 그것을 다시 적으면 두 곳이 조용히 갈린다. 여기서 막는 것은
 * 「입력이 비어 있다」 하나이고 그것은 판정이 아니라 부재다.
 */
export function RenamePrompt({
  node,
  onRename,
  onCancel,
}: {
  node: TreeNodeView;
  onRename: (name: string) => void;
  onCancel: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(node.name);

  // 열리면 입력으로 초점을 옮기고 지금 이름을 골라 둔다 — 옮기지 않으면
  // 키보드 사용자는 방금 열린 것이 무엇인지 모른 채 트리에 초점을 둔
  // 상태가 되고, 고르지 않으면 바꾸려는 사람이 먼저 지워야 한다.
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  // Escape 로 닫힌다. 닫는 방법이 버튼 하나뿐이면 그것을 못 찾은
  // 사용자에게는 화면이 멈춘 것으로 보인다.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div role="dialog" aria-modal="true" aria-label={`${node.name} 이름 바꾸기`}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const 다듬은 = name.trim();
          if (다듬은 !== '') onRename(다듬은);
        }}
      >
        <input
          ref={input}
          type="text"
          aria-label={`${node.name} 새 이름`}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit">이름 바꾸기</button>
        <button type="button" onClick={onCancel}>
          그만두기
        </button>
      </form>
    </div>
  );
}
