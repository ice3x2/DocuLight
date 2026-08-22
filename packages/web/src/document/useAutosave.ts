import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, loadDocument, openEditSession, saveBody } from '../api/client.js';
import {
  AUTOSAVE_DEBOUNCE_MS,
  conflictDetected,
  edited,
  forceSave,
  idleAutosave,
  initialAutosave,
  resolvedOnce,
  saveRejected,
  saveSucceeded,
  type AutosaveState,
} from './autosave.js';

/**
 * 자동 저장을 실제 왕복에 잇는다 (`FR-STORAGE-001`).
 *
 * 규칙은 전부 `autosave.ts` 의 값 전이가 갖는다. 여기는 **시계와
 * 네트워크만** 붙인다 — 규칙을 여기 두면 그것을 확인하려고 타이머를
 * 흉내 내야 하고, 흉내 낸 시계는 진짜 규칙을 재지 못한다.
 */
export interface Autosave {
  status: AutosaveState['status'];
  /** 충돌 시 서버가 함께 준 현재 본문. */
  serverBody: string | null;
  /** 사용자가 고쳤다. */
  changed: (body: string) => void;
  /** Ctrl+S. */
  saveNow: (body: string) => void;
  /**
   * 머지 뷰에서 1회 해소했다.
   *
   * 합친 본문을 **곧바로 저장까지 보낸다** — 화면만 닫으면 사용자는 합친
   * 것이 반영됐다고 믿고 그것을 잃는다. 서버의 현재 해시를 기준으로
   * 보내므로 그 저장은 다시 충돌하지 않는다.
   */
  resolve: (body: string) => void;
}

export function useAutosave(nodeId: string | null, baseHash: string | undefined): Autosave {
  const [state, setState] = useState<AutosaveState>(() => initialAutosave(baseHash ?? ''));
  const session = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 문서가 바뀌면 상태도 갈아 낀다 — 앞 문서의 더티 표식이 남으면 그것이
  // 새 문서에 대한 저장으로 나간다.
  useEffect(() => {
    setState(initialAutosave(baseHash ?? ''));
    session.current = null;
  }, [nodeId, baseHash]);

  const send = useCallback(
    async (body: string, current: AutosaveState, forceSnapshot = false) => {
      if (nodeId === null) return;

      // 세션은 **첫 저장에** 연다. 문서를 열자마자 열면 읽기만 하고 닫은
      // 문서마다 빈 세션이 쌓인다.
      if (session.current === null) {
        session.current = await openEditSession(nodeId).catch(() => null);
      }

      try {
        const { hash } = await saveBody(nodeId, {
          body,
          baseHash: current.baseHash,
          ...(session.current === null ? {} : { session: session.current }),
          // Ctrl+S 만 강제한다 — 자동 저장까지 강제하면 세션당 1회 규칙이
          // 사라지고 보관 디렉토리가 저장 횟수만큼 늘어난다.
          ...(forceSnapshot ? { forceSnapshot: true } : {}),
        });
        setState((was) => saveSucceeded(was, hash));
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          setState((was) => conflictDetected(was, error.current ?? ''));
          return;
        }
        setState((was) => saveRejected(was));
      }
    },
    [nodeId],
  );

  const changed = useCallback(
    (body: string) => {
      setState((was) => {
        const next = edited(was, body);
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          // 디바운스가 지났는지는 값 전이가 판정한다 — 여기서 다시
          // 판정하면 규칙이 두 곳에 생긴다.
          const intent = idleAutosave(next, AUTOSAVE_DEBOUNCE_MS);
          if (intent.save) void send(intent.body, next);
        }, AUTOSAVE_DEBOUNCE_MS);
        return next;
      });
    },
    [send],
  );

  const saveNow = useCallback(
    (body: string) => {
      setState((was) => {
        const next = edited(was, body);
        const intent = forceSave(next);
        if (intent.save) void send(intent.body, next, intent.forceSnapshot);
        return next;
      });
    },
    [send],
  );

  const resolve = useCallback(
    (body: string) => {
      if (nodeId === null) return;

      void (async () => {
        // 서버의 현재 해시를 다시 받아 그것을 기준으로 보낸다 — 낡은
        // 기준으로 보내면 해소 직후의 저장이 곧바로 다시 충돌한다.
        const fresh = await loadDocument(nodeId).catch(() => null);
        if (fresh === null) return;

        const resumed = resolvedOnce(state, { body, hash: fresh.hash });
        setState(resumed);
        await send(body, resumed);
      })();
    },
    [nodeId, send, state],
  );

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return { status: state.status, serverBody: state.serverBody, changed, saveNow, resolve };
}
