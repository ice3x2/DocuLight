import { useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';

import type { RosterUser, RosterUserStatus } from '../api/client.js';

/**
 * 가입 승인 (`SEC-AUTH-004` · `FR-AUTH-002` · 설계서 `04` §2.10).
 *
 * **사용자 관리와 다른 화면이다.** 설계가 별도 카테고리로 둔 이유는 조작이
 * 동질적(승인 또는 거절 둘뿐)이고 대상이 사용자 전체가 아니라 대기 건수로
 * 한정되기 때문이다 — 같은 자리에 두면 그 구분이 사라지고, 명부 테이블에
 * 상태마다 다른 버튼이 붙어 어느 계정에 무엇을 할 수 있는지 읽기 어려워진다.
 *
 * **거절됨 탭에서 바로 승인하지 않는다.** `R60-b` 가 정한 경로는
 * `rejected → pending → active` 이며, 건너뛰면 거절 이력이 아무 데도 남지 않는다.
 */
const 가입모드문구: Readonly<Record<string, string>> = {
  open: '현재 자유 가입 모드라 승인 대기가 발생하지 않습니다. 가입 모드는 인스턴스 설정에서 볼 수 있습니다.',
  approval: '아직 들어온 가입 신청이 없습니다.',
  'invite-only': '현재 슈퍼유저 직접 등록 모드라 가입 신청을 받지 않습니다. 가입 모드는 인스턴스 설정에서 볼 수 있습니다.',
};

/** 모드를 모를 때. **원인을 지어내지 않는다** — 틀린 원인은 없는 원인보다 나쁘다. */
const 모드를모를때 = '승인 대기 중인 계정이 없습니다.';

export function SignupApproval({
  users = [],
  signupMode,
  onApprove,
  onReopen,
  onStatus,
}: {
  users?: readonly RosterUser[];
  /** 지금 가입 모드 (`FR-AUTH-004`). 빈 대기열의 **원인**이 여기서 갈린다. */
  signupMode?: string;
  /** 가입 승인 (`SEC-AUTH-004` AC-1). */
  onApprove?: (userId: string) => void;
  /** 거절된 계정을 재심사 대상으로 (`FR-AUTH-002`). */
  onReopen?: (userId: string) => void;
  /** 상태를 직접 바꾼다. 이 화면에서는 거절이 이 자리를 쓴다 (`R60`). */
  onStatus?: (userId: string, status: RosterUserStatus) => void;
}) {
  const [탭, set탭] = useState('pending');
  const 대기 = users.filter((one) => one.status === 'pending');
  const 거절 = users.filter((one) => one.status === 'rejected');

  return (
    <Tabs.Root value={탭} onValueChange={set탭}>
      {/* 건수를 이름에 실어 둔다 (`R139-f`) — 열어 보지 않고도 할 일이
          있는지 알 수 있어야 한다. */}
      <Tabs.List>
        <Tabs.Trigger value="pending">대기 중 ({대기.length})</Tabs.Trigger>
        <Tabs.Trigger value="rejected">거절됨 ({거절.length})</Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="pending">
        {대기.length === 0 ? (
          <p role="note" aria-label="빈 상태 안내">
            {signupMode === undefined ? 모드를모를때 : (가입모드문구[signupMode] ?? 모드를모를때)}
          </p>
        ) : (
          <table>
            <caption>승인 대기</caption>
            <thead>
              <tr>
                <th scope="col">이름</th>
                <th scope="col">조작</th>
              </tr>
            </thead>
            <tbody>
              {대기.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>
                    {onApprove === undefined ? null : (
                      <button type="button" onClick={() => onApprove(user.id)}>
                        승인
                      </button>
                    )}
                    {onStatus === undefined ? null : (
                      <button type="button" onClick={() => onStatus(user.id, 'rejected')}>
                        거절
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Tabs.Content>

      <Tabs.Content value="rejected">
        {거절.length === 0 ? (
          <p role="note" aria-label="빈 상태 안내">
            거절된 계정이 없습니다.
          </p>
        ) : (
          <table>
            <caption>거절됨</caption>
            <thead>
              <tr>
                <th scope="col">이름</th>
                <th scope="col">조작</th>
              </tr>
            </thead>
            <tbody>
              {거절.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>
                    {onReopen === undefined ? null : (
                      <button type="button" onClick={() => onReopen(user.id)}>
                        재심사
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Tabs.Content>
    </Tabs.Root>
  );
}
