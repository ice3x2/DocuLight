import * as Tabs from '@radix-ui/react-tabs';

import type {
  BrokenInheritanceBody,
  PrincipalRow,
  RevocationBody,
  SimulationBody,
} from '../api/client.js';
import { BulkRevokePanel } from './BulkRevokePanel.js';
import { InheritanceAuditPanel } from './InheritanceAuditPanel.js';
import { SimulationPanel } from './SimulationPanel.js';

/**
 * 설정 모달의 `권한 감사` 카테고리 (`IR-SHELL-002`).
 *
 * 셋을 한 구역에 모은 이유는 셋 다 **관리 레벨 전용**이고 셋 다 「지금 이
 * 권한이 왜 이런가」를 답하기 때문이다 — 흩어 두면 관리자가 세 곳을
 * 오가며 같은 물음을 세 번 묻게 된다.
 *
 * 넷째 탭은 만들지 않는다 (원장 `G15` 판정). 넓히기를 모아 보는 일은
 * `감사 로그` 카테고리가 이미 한다 — 조작 필터가 실제 기록 값에서
 * 파생하므로(`IR-AUDIT-001`) `acl.grant` 를 고르면 그 목록이 곧 선다.
 * 여기 넷째를 세우면 같은 자료에 진입점이 둘이 되고, 이 구역을 세 카드로
 * 못박은 `R24-a` 의 전량 목록도 함께 고쳐야 한다.
 */
export interface AclAuditProps {
  /**
   * 주체 검색의 부여 자격 근거 (`R162`). **없으면 검색칸을 두지 않는다** —
   * 스코프 없는 검색칸은 그 자체가 명부로 가는 경로다.
   */
  workspaceId?: string;
  revocation?: RevocationBody;
  /** 고른 주체들 — 다건이다 (`FR-CONFIRM-020`). */
  subjects?: readonly PrincipalRow[];
  simulation?: SimulationBody;
  audit?: BrokenInheritanceBody;
  onRevokePick?: (row: PrincipalRow) => void;
  onRevoke?: (principalIds: readonly string[]) => void;
  onSimulatePick?: (row: PrincipalRow) => void;
  onRestore?: (nodeId: string) => void;
}

export function AclAuditPanel({
  workspaceId,
  revocation,
  subjects,
  simulation,
  audit,
  onRevokePick,
  onRevoke,
  onSimulatePick,
  onRestore,
}: AclAuditProps) {
  return (
    <Tabs.Root defaultValue="revoke">
      <Tabs.List aria-label="권한 감사">
        <Tabs.Trigger value="revoke">권한 회수</Tabs.Trigger>
        <Tabs.Trigger value="simulate">유효 권한 시뮬레이션</Tabs.Trigger>
        <Tabs.Trigger value="inheritance">상속 끊김</Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="revoke">
        {workspaceId === undefined ? (
          <p data-testid="audit-no-workspace">관리 권한이 있는 워크스페이스가 없습니다.</p>
        ) : (
          <BulkRevokePanel
            workspaceId={workspaceId}
            {...(subjects === undefined ? {} : { subjects })}
            {...(revocation === undefined ? {} : { revocation })}
            {...(onRevokePick === undefined ? {} : { onPick: onRevokePick })}
            {...(onRevoke === undefined ? {} : { onRevoke })}
          />
        )}
      </Tabs.Content>

      <Tabs.Content value="simulate">
        {workspaceId === undefined ? (
          <p data-testid="audit-no-workspace">관리 권한이 있는 워크스페이스가 없습니다.</p>
        ) : (
          <SimulationPanel
            workspaceId={workspaceId}
            {...(simulation === undefined ? {} : { simulation })}
            {...(onSimulatePick === undefined ? {} : { onPick: onSimulatePick })}
          />
        )}
      </Tabs.Content>

      <Tabs.Content value="inheritance">
        {/* 이 탭만 주체를 고르지 않는다 — 목록이 이미 관리 범위로 잘려 온다. */}
        <InheritanceAuditPanel
          {...(audit === undefined ? {} : { audit })}
          {...(onRestore === undefined ? {} : { onRestore })}
        />
      </Tabs.Content>
    </Tabs.Root>
  );
}
