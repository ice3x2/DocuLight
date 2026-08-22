import * as Dialog from '@radix-ui/react-dialog';
import { useId } from 'react';

/**
 * 문서별 공유 (`CON-SHELL-001` AC-3 · `FR-SHELL-002` AC-2).
 *
 * **설정 모달의 카테고리가 아니다.** 설정 모달은 사용자·워크스페이스·
 * 인스턴스에 매인 것을 담는 자리라, 문서 하나를 고르는 조작이 섞이면 그
 * 화면의 대상이 무엇인지 갈린다 — 수명도 다르다.
 *
 * 진입점은 문서 헤더의 `⋯` 메뉴다(`FR-SHELL-002` AC-1) — 문서 단위로
 * 작용하는 기능은 전부 그 자리에 온다.
 */
export function ShareModal({
  name,
  open,
  onOpenChange,
}: {
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const titleId = useId();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content aria-labelledby={titleId}>
          <Dialog.Title id={titleId}>{name} 공유</Dialog.Title>
          {/* 권한을 실제로 부여하는 자리는 ACL 축이 서는 wave 가 채운다.
              여기서는 그 자리가 **문서 옆에** 있다는 것만 세운다 — 자리를
              안 세워 두면 나중에 설정 모달로 흘러 들어간다. */}
          <p>이 문서에 접근할 수 있는 사람을 정합니다.</p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
