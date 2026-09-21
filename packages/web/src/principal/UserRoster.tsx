import { useEffect, useRef, useState, type FormEvent } from 'react';

import type { RosterUser, RosterUserStatus } from '../api/client.js';
import { Badge, type BadgeVariant } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Field } from '../components/ui/field.js';
import { Input } from '../components/ui/input.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table.js';
import { principalActionResultIsCurrent, principalRequestOwnerKey, type PrincipalAction, type PrincipalActionResult, type PrincipalRequestContext, type RosterRead } from './request-contract.js';

/**
 * 슈퍼유저 전용 사용자 관리 명부 (`FR-PRINCIPAL-001` AC-1 · `FR-PRINCIPAL-009`).
 *
 * **`PrincipalPicker` 를 쓰지 않는다** (`R163`). 그 부품은 부여하는 제3자
 * 에게 함의를 감추는 중립어 표기를 쓰고 `rejected` 를 아예 받지 않는데,
 * 이 화면은 슈퍼유저가 그 상태를 **직접 설정하는** 자리라 보호할 제3자가
 * 없고 거절 이력을 봐야 한다.
 *
 * 그래서 문구 매핑이 둘이다. **이 둘을 하나로 합치려는 리팩터링은 두 조항
 * 중 하나를 반드시 깨뜨린다** — 합치면 그쪽이 `거절` 을 얻거나 이쪽이
 * `비활성` 을 얻는다.
 */
const LABEL: Record<RosterUserStatus, string> = {
  active: '활성',
  pending: '대기',
  suspended: '정지',
  rejected: '거절',
};

const BADGE: Record<RosterUserStatus, BadgeVariant> = {
  active: 'success',
  pending: 'warning',
  suspended: 'neutral',
  rejected: 'danger',
};

export function UserRoster({
  users = [],
  roster,
  requestContext,
  onRegister,
  onOffboard,
}: {
  users?: readonly RosterUser[];
  roster?: RosterRead;
  requestContext?: PrincipalRequestContext;
  /**
   * 슈퍼유저 직접 등록 (`FR-AUTH-003`).
   *
   * **명부와 같은 부품이 담는다** — 자리를 가르면 그것이 곧 두 번째
   * 화면이고, `CON-SHELL-001` 이 진입점을 하나로 묶어 둔 이유가 무너진다.
   * 슈퍼유저 판정은 카테고리 관문이 이미 했으므로 여기서 다시 하지 않는다.
   */
  onRegister?: PrincipalAction<[input: { name: string; password: string }]>;
  onOffboard?: (userId: string) => void;
}) {
  const [이름, set이름] = useState('');
  const [비밀번호, set비밀번호] = useState('');
  const [등록중, set등록중] = useState(false);
  const [재조정필요, set재조정필요] = useState(false);
  const [결과, set결과] = useState<{ kind: 'success' | 'failure' | 'uncertain'; refreshFailed?: boolean } | null>(null);
  const 등록잠금 = useRef(false);
  const actionGeneration = useRef(0);
  const formGeneration = useRef(0);
  const ambiguousSnapshot = useRef<{ revision?: number; users?: readonly RosterUser[] } | null>(null);
  const context = requestContext ?? { principalId: 'legacy', authGeneration: 0, categoryGeneration: 0, queryGeneration: 0 };
  const ownerKey = principalRequestOwnerKey(context);
  const currentContext = useRef(context);
  currentContext.current = context;
  const 읽기 = roster ?? { state: 'ready' as const, users };
  const 현재명부 = 읽기.state === 'ready' ? 읽기.users : [];
  useEffect(() => {
    actionGeneration.current += 1;
    등록잠금.current = false;
    set등록중(false);
    set결과(null);
  }, [ownerKey]);
  useEffect(() => {
    const ambiguous = ambiguousSnapshot.current;
    if (!재조정필요 || 읽기.state !== 'ready' || ambiguous === null) return;
    const newerRevision = 읽기.revision !== undefined && ambiguous.revision !== undefined && 읽기.revision > ambiguous.revision;
    const newLegacySnapshot = 읽기.revision === undefined && ambiguous.revision === undefined && 읽기.users !== ambiguous.users;
    if (!newerRevision && !newLegacySnapshot) return;
    ambiguousSnapshot.current = null;
    set재조정필요(false);
  }, [재조정필요, 읽기]);
  const 보낼수있다 = onRegister !== undefined && 이름 !== '' && 비밀번호 !== '' && !등록중 && !재조정필요;

  const 등록한다 = async (event: FormEvent) => {
    event.preventDefault();
    if (!보낼수있다 || 등록잠금.current || onRegister === undefined) return;
    등록잠금.current = true;
    set등록중(true);
    set결과(null);
    const captured = { name: 이름, password: 비밀번호 };
    const capturedContext = context;
    const capturedAction = ++actionGeneration.current;
    const capturedForm = formGeneration.current;
    let response: PrincipalActionResult;
    try {
      response = await onRegister(captured);
    } catch {
      response = { ok: false, kind: 'uncertain' };
    }
    if (actionGeneration.current !== capturedAction || formGeneration.current !== capturedForm) return;
    if (!principalActionResultIsCurrent(capturedContext, currentContext.current, response)) {
      등록잠금.current = false;
      set등록중(false);
      return;
    }
    if (!response.ok && response.kind === 'stale') {
      등록잠금.current = false;
      set등록중(false);
      return;
    }
    if (response?.ok === true && typeof response.id === 'string' && response.id !== '') {
      set이름('');
      set비밀번호('');
      set결과({ kind: 'success', refreshFailed: response.refreshFailed });
    } else if (response?.ok === false && response.kind === 'uncertain') {
      ambiguousSnapshot.current = {
        ...(읽기.revision === undefined ? {} : { revision: 읽기.revision }),
        ...(읽기.state === 'ready' ? { users: 읽기.users } : {}),
      };
      set재조정필요(true);
      set결과({ kind: 'uncertain' });
    } else {
      set결과({ kind: 'failure' });
    }
    등록잠금.current = false;
    set등록중(false);
  };

  return (
    <section data-principal-panel="roster" aria-label="사용자 관리">
      <h2 data-principal-title>사용자 관리</h2>
      {읽기.state === 'loading' ? <p role="status">사용자 목록을 불러오는 중입니다.</p> : null}
      {읽기.state === 'error' ? (
        <div role="alert">사용자 목록을 불러오지 못했습니다. <Button variant="secondary" onClick={읽기.onRetry}>사용자 목록 다시 불러오기</Button></div>
      ) : null}
      {읽기.state === 'ready' ? <div data-principal-table-wrap>
        <Table>
          <caption>사용자 관리</caption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">이름</TableHead>
              <TableHead scope="col">상태</TableHead>
              {onOffboard === undefined ? null : <TableHead scope="col">오프보딩</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {현재명부.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.name}</TableCell>
                {/* 네 상태를 그대로 — 뭉치면 어느 계정에 무엇을 해야 하는지
                판단할 수 없다 (`FR-PRINCIPAL-009` AC-4). */}
                <TableCell>
                  <Badge data-testid="roster-status" variant={BADGE[user.status]}>{LABEL[user.status]}</Badge>
                </TableCell>
                {onOffboard === undefined ? null : <TableCell><Button type="button" variant="secondary" aria-label="오프보딩 열기" data-offboarding-principal-id={user.id} onClick={() => onOffboard(user.id)}>오프보딩</Button></TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div> : null}
      {읽기.state === 'ready' && 현재명부.length === 0 ? (
        <p role="note" aria-label="빈 상태 안내" data-principal-empty>표시할 사용자 항목이 없습니다.</p>
      ) : null}

      {/* 등록 자리는 명부가 비어 있어도 선다 — 첫 사용자를 넣을 자리가
          없으면 그 인스턴스는 설치 마법사 밖에서 사람을 못 늘린다. */}
      <section data-principal-registration aria-labelledby="roster-registration-title">
        <h3 id="roster-registration-title">사용자 직접 등록</h3>
        <form onSubmit={(event) => void 등록한다(event)}>
        <div data-slot="field-stack">
          <Field label="새 사용자 이름">
            <Input id="roster-new-name" autoComplete="username" value={이름} readOnly={등록중} onChange={(event) => { formGeneration.current += 1; set이름(event.target.value); }} />
          </Field>

          {/* 가린다 — 어깨너머로 읽히면 그 계정이 그대로 열린다. */}
          <Field label="임시 비밀번호">
            <Input
              id="roster-new-password"
              autoComplete="new-password"
              type="password"
              value={비밀번호}
              readOnly={등록중}
              onChange={(event) => { formGeneration.current += 1; set비밀번호(event.target.value); }}
            />
          </Field>
        </div>

        <div data-principal-actions>
          <Button
            type="submit"
            aria-describedby={onRegister === undefined ? 'roster-register-unavailable' : undefined}
            // 서버가 거절할 요청을 보내지 않는다 — 거절을 눌러 보고 아는 것과
            // 누를 수 없는 것은 사용자에게 다른 일이다.
            disabled={!보낼수있다}
          >
            {등록중 ? '등록 중' : '등록'}
          </Button>
          {onRegister === undefined ? (
            <p id="roster-register-unavailable">등록 기능을 사용할 수 없습니다.</p>
          ) : null}
        </div>
        {등록중 ? <p role="status">사용자를 등록하는 중입니다.</p> : null}
        {결과?.kind === 'success' ? <p role="status">사용자를 등록했습니다.</p> : null}
        {결과?.kind === 'success' && 결과.refreshFailed ? <p role="alert">사용자 목록을 새로 불러오지 못했습니다.</p> : null}
        {결과?.kind === 'failure' ? <p role="alert">사용자를 등록하지 못했습니다. 입력 내용을 확인하고 다시 시도하십시오.</p> : null}
        {결과?.kind === 'uncertain' ? <p role="alert">처리 결과를 확인하지 못했습니다. 목록을 새로 불러온 뒤 다시 시도하십시오.</p> : null}
        {재조정필요 && 읽기.state === 'ready' && 읽기.onRetry !== undefined ? <Button type="button" variant="secondary" onClick={읽기.onRetry}>사용자 목록 새로 불러오기</Button> : null}
        </form>
      </section>
    </section>
  );
}
