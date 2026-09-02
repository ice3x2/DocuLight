import * as Dialog from '@radix-ui/react-dialog';
import { useId, useState } from 'react';

import { ConfirmGate } from '../confirm/ConfirmGate.js';
import {
  DEFAULT_TOKEN_EXPIRY_DAYS,
  DEFAULT_TOKEN_SCOPE,
  SCOPE_LABELS,
  TOKEN_EXPIRY_CHOICES,
  type TokenIssueInput,
  type TokenRowView,
  type TokenScope,
} from './token-contract.js';

/**
 * 개인 › 액세스 토큰 (`SEC-AUTH-006` · `SEC-AUTH-007` · `04` §2.3).
 *
 * **평문을 이 부품 밖으로 내보내지 않는다.** 발급 응답에 실려 온 값은 여기
 * 지역 상태에만 있다가 닫히는 순간 사라진다 — 위로 올리면 그 값이 앱의
 * 수명을 갖게 되고, 그때 「1회 노출」(`SEC-AUTH-006` AC-2)이 화면 문구로만
 * 남는다.
 *
 * 폐기는 **기존 확인 등급 장치**를 그대로 쓴다 (`FR-CONFIRM-001`). 자기
 * 확인을 만들면 같은 등급 이름에 다른 절차가 붙는다.
 */
export function TokenPanel({
  rows,
  onIssue,
  onRevoke,
}: {
  rows: readonly TokenRowView[];
  /**
   * 발급한다. **평문을 돌려준다** — 그 값이 화면에 서는 유일한 경로다.
   *
   * 실패하면 `undefined` 를 돌려준다. 그때 노출 화면이 서지 않는다.
   */
  onIssue?: (input: TokenIssueInput) => Promise<{ token: string } | undefined>;
  onRevoke?: (id: string) => void;
}) {
  const prefix = useId();
  /**
   * 발급 흐름의 단계 (`04` §2.3 의 2단계 · EC12).
   *
   * 한 다이얼로그로 세 단계를 돈다 — 폼 · 평문 노출 · 닫기 재확인. 단계마다
   * 다이얼로그를 따로 두면 앞의 것이 닫히고 뒤의 것이 열리는 사이가 생기고,
   * 그 틈이 곧 EC12 가 막으려는 「실수로 닫힘」이다.
   */
  const [stage, setStage] = useState<'closed' | 'form' | 'revealed' | 'confirming'>('closed');
  const [평문, set평문] = useState<string | null>(null);
  /** 닫은 뒤 목록 위에 1회 서는 안내 (EC12). */
  const [잃었다, set잃었다] = useState(false);
  /** 클립보드가 거절했는가. 참이면 노출 화면이 닫히지 않고 그 사실을 알린다. */
  const [복사실패, set복사실패] = useState(false);
  const [폐기대상, set폐기대상] = useState<TokenRowView | null>(null);

  const [이름, set이름] = useState('');
  /**
   * 스코프의 기본값은 **좁은 쪽**이다 (`04` §2.3 — 설계자 판단, fail-closed).
   *
   * `SEC-AUTH-008` 이 스코프를 「상한만 낮추는 것」으로 규정하므로, 고르지
   * 않은 사람에게 돌아가야 하는 것은 가장 낮은 상한이다. 넓은 쪽이 기본이면
   * 아무 생각 없이 발급한 토큰이 쓰기 상한을 갖는다.
   */
  const [scope, setScope] = useState<TokenScope>(DEFAULT_TOKEN_SCOPE);
  const [기간, set기간] = useState(DEFAULT_TOKEN_EXPIRY_DAYS);

  const 폼을연다 = () => {
    set이름('');
    setScope(DEFAULT_TOKEN_SCOPE);
    set기간(DEFAULT_TOKEN_EXPIRY_DAYS);
    set잃었다(false);
    setStage('form');
  };

  const 발급한다 = async () => {
    // 이름 없는 토큰은 목록에서 서로 구별되지 않아 폐기 판단이 서지 않는다.
    if (이름.trim() === '') return;

    const issued = await onIssue?.({ name: 이름.trim(), scope, expiresInDays: 기간 });
    if (issued === undefined) {
      setStage('closed');
      return;
    }
    set평문(issued.token);
    setStage('revealed');
  };

  /** 평문을 지우고 닫는다. `잃음` 이면 재발급 안내를 목록 위에 세운다. */
  const 닫는다 = (잃음: boolean) => {
    set평문(null);
    set잃었다(잃음);
    set복사실패(false);
    setStage('closed');
  };

  /**
   * 복사가 실패했음을 알리고 **닫지 않는다.**
   *
   * 클립보드는 없거나 거절할 수 있다(비보안 오리진 · 권한 거부). 그때 그대로
   * 닫으면 사용자는 복사된 줄 알고 평문을 잃는다 — EC12 가 막으려는 바로 그
   * 상황의 다른 입구이며, 여기서는 사용자가 잘못 누른 것도 아니다.
   *
   * 갇히지도 않는다 — `[닫기]` 가 그 자리에 그대로 있고, 그쪽은 재확인을
   * 거쳐 닫는다.
   */
  const 복사하고닫는다 = () => {
    const 쓴다 = navigator.clipboard?.writeText(평문 ?? '');
    if (쓴다 === undefined) {
      set복사실패(true);
      return;
    }
    void 쓴다.then(
      () => 닫는다(false),
      () => set복사실패(true),
    );
  };

  return (
    <>
      {잃었다 ? (
        <p data-testid="token-lost-notice">
          평문은 다시 볼 수 없습니다. 필요하면 재발급하는 수밖에 없습니다.
        </p>
      ) : null}

      {/* 화면 머리의 두 줄 (`04` §2.3 목업). 뒤의 줄은 장식이 아니다 —
          사용자가 `읽기+쓰기` 를 골라도 그 토큰이 자기 유효 권한을 넘지
          못한다는 사실이 여기 말고는 서는 자리가 없다 (`R58-c`). */}
      <p data-testid="token-scope-notice">
        MCP 클라이언트와 API 는 이 토큰으로 인증합니다. 토큰의 실제 권한은 스코프와 현재 유효
        권한의 교집합입니다.
      </p>

      <button type="button" onClick={폼을연다}>
        새 액세스 토큰
      </button>

      <table>
        <thead>
          <tr>
            <th scope="col">이름</th>
            <th scope="col">스코프</th>
            <th scope="col">만료일</th>
            <th scope="col">마지막 사용</th>
            <th scope="col">조작</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            // 만료분은 배지와 함께 **행 자체를 흐리게** 그린다 (`04` §2.3).
            // 지우지 않고 남기므로, 흐려지지 않으면 산 토큰과 같은 무게로
            // 목록을 채워 폐기 판단이 그만큼 느려진다.
            <tr key={row.id} style={{ opacity: 만료됨(row.expiresAt) ? 0.55 : 1 }}>
              <td>{row.name}</td>
              <td>{SCOPE_LABELS[row.scope]}</td>
              <td>
                {날짜(row.expiresAt)}
                {/* 만료분을 자동으로 지우지 않는다 (`04` §2.3) — 지우면
                    사용자가 「내가 폐기했나」와 「만료됐나」를 구별할 수 없다. */}
                {만료됨(row.expiresAt) ? ' (만료됨)' : ''}
              </td>
              <td>{row.lastUsedAt === null ? '사용 안 함' : 날짜(row.lastUsedAt)}</td>
              <td>
                {row.revokedAt === null ? (
                  <button type="button" onClick={() => set폐기대상(row)}>
                    {row.name} 폐기
                  </button>
                ) : (
                  '폐기됨'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* `R58-d` — 계정이 `active` 가 아니면 이 계정의 토큰이 전부 즉시
          무효가 된다. 이 화면에서 조작할 수 있는 것이 아니므로 버튼을 두지
          않고 하단에 고지만 한다 (`04` §2.3). */}
      <p data-testid="token-account-notice">
        계정이 활성 상태가 아니게 되면 이 계정의 토큰은 전부 즉시 무효가 됩니다. 이 화면에서는
        조작할 수 없습니다.
      </p>

      {/* 폐기는 비가역이고 재발급뿐이다 — `L2` 다 (`04` §2.3 · 원장 `R115-b`). */}
      <ConfirmGate
        open={폐기대상 !== null}
        grade="L2"
        title={`${폐기대상?.name ?? ''} 를 폐기합니다`}
        onConfirm={() => {
          if (폐기대상 !== null) onRevoke?.(폐기대상.id);
          set폐기대상(null);
        }}
        onCancel={() => set폐기대상(null)}
      >
        <p>이 토큰을 쓰던 클라이언트는 즉시 인증되지 않습니다. 되돌릴 수 없고 재발급뿐입니다.</p>
      </ConfirmGate>

      <Dialog.Root open={stage !== 'closed'}>
        <Dialog.Portal>
          <Dialog.Overlay />
          <Dialog.Content
            aria-describedby={undefined}
            // **노출 단계에서는 닫히지 않는다** (EC12). 폼 단계는 잃을 것이
            // 없으므로 평소대로 닫힌다 — 여기서 단계를 가르지 않으면 취소가
            // 불가능한 폼이 된다.
            onEscapeKeyDown={(event) => {
              if (stage === 'form') setStage('closed');
              else event.preventDefault();
            }}
            onInteractOutside={(event) => {
              if (stage === 'form') setStage('closed');
              else event.preventDefault();
            }}
          >
            {stage === 'form' ? (
              <>
                <Dialog.Title>새 액세스 토큰</Dialog.Title>

                <p>
                  <label htmlFor={`${prefix}-name`}>이름</label>
                  <input
                    id={`${prefix}-name`}
                    value={이름}
                    onChange={(event) => set이름(event.target.value)}
                  />
                </p>

                <fieldset>
                  <legend>스코프</legend>
                  {/* 스코프는 상한만 낮춘다 (`SEC-AUTH-008`) — 둘뿐인 것이
                      요구이므로 목록을 계약에서 읽는다. */}
                  {(Object.keys(SCOPE_LABELS) as TokenScope[]).map((value) => (
                    <span key={value}>
                      <input
                        type="radio"
                        id={`${prefix}-${value}`}
                        name={`${prefix}-scope`}
                        checked={scope === value}
                        onChange={() => setScope(value)}
                      />
                      <label htmlFor={`${prefix}-${value}`}>{SCOPE_LABELS[value]}</label>
                    </span>
                  ))}
                </fieldset>

                <p>
                  <label htmlFor={`${prefix}-days`}>만료 기간</label>
                  <select
                    id={`${prefix}-days`}
                    value={기간}
                    onChange={(event) => set기간(Number(event.target.value))}
                  >
                    {TOKEN_EXPIRY_CHOICES.map((days) => (
                      <option key={days} value={days}>
                        {days}일
                      </option>
                    ))}
                  </select>
                </p>

                <button type="button" onClick={() => setStage('closed')}>
                  취소
                </button>
                <button type="button" onClick={() => void 발급한다()}>
                  발급
                </button>
              </>
            ) : (
              <>
                <Dialog.Title>토큰이 발급되었다</Dialog.Title>

                {/* 재확인 중에도 평문을 계속 보인다 — 여기가 되돌릴 자리라,
                    감추면 「취소」를 눌러도 이미 늦었다고 읽힌다. */}
                <p data-testid="token-plaintext">{평문}</p>
                <p>
                  이 값은 지금 한 번만 보입니다. 닫으면 다시 볼 수 없고, 잃으면 새로 발급하는
                  수밖에 없습니다.
                </p>

                {stage === 'confirming' ? (
                  <>
                    <p data-testid="token-close-reconfirm">
                      아직 복사하지 않았다면 지금이 마지막입니다. 닫으면 다시 볼 수 없습니다.
                    </p>
                    <button type="button" onClick={() => setStage('revealed')}>
                      취소
                    </button>
                    <button type="button" onClick={() => 닫는다(true)}>
                      그래도 닫기
                    </button>
                  </>
                ) : (
                  <>
                    {복사실패 ? (
                      <p data-testid="token-copy-failed">
                        복사하지 못했습니다. 위의 값을 직접 골라 복사한 뒤 닫으십시오.
                      </p>
                    ) : null}
                    <button type="button" onClick={복사하고닫는다}>
                      복사하고 닫기
                    </button>
                    <button type="button" onClick={() => setStage('confirming')}>
                      닫기
                    </button>
                  </>
                )}
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

/** ISO 시각에서 날짜만. 시·분은 폐기 판단에 아무것도 더하지 않는다. */
const 날짜 = (iso: string) => iso.slice(0, 10);

const 만료됨 = (iso: string) => new Date(iso).getTime() <= Date.now();
