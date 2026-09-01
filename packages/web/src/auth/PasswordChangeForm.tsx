import { useState } from 'react';

/**
 * 거절 사유별 안내 (`SEC-AUTH-018`).
 *
 * 로그인과 달리 서버가 **코드**를 주므로 문구는 화면이 갖는다 — 서버의
 * `PasswordRule` 과 같은 값이며, 늘어나면 여기도 함께 늘어야 한다. 모르는
 * 코드는 뭉개지 않고 그대로 보인다: 뭉개면 사용자는 무엇을 고칠지 모른 채
 * 같은 값을 다시 넣는다.
 */
export const PASSWORD_REASONS: Readonly<Record<string, string>> = {
  'wrong-password': '현재 비밀번호가 올바르지 않습니다',
  'empty-password': '새 비밀번호를 입력하세요',
  'self-only': '자기 비밀번호만 바꿀 수 있습니다',
  'unknown-account': '계정을 찾을 수 없습니다',
};

/**
 * 자기 비밀번호를 바꾸는 폼 (`SEC-AUTH-018` AC-1).
 *
 * **현재 비밀번호를 함께 묻는다.** 없으면 탈취된 세션 하나로 계정을 영구히
 * 빼앗을 수 있다 — 세션은 만료되지만 바뀐 비밀번호는 그렇지 않다. 서버도
 * 같은 값을 요구하며(`password-service`), 화면이 그것을 묻지 않으면 그
 * 요구가 곧 「바꿀 수 없다」가 된다.
 */
export function PasswordChangeForm({
  onSubmit,
}: {
  /** 바꾼다. 거절되면 서버가 준 규칙 코드가 돌아온다. */
  onSubmit?: (input: { current: string; next: string }) => Promise<string | undefined | void>;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [rule, setRule] = useState<string | null>(null);
  const [보내는중, set보내는중] = useState(false);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (보내는중) return;
        set보내는중(true);
        setRule(null);
        void Promise.resolve(onSubmit?.({ current, next }))
          .then((거절) => {
            if (typeof 거절 === 'string') setRule(거절);
          })
          .finally(() => set보내는중(false));
      }}
    >
      <label>
        현재 비밀번호
        <input
          name="current"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
        />
      </label>
      <label>
        새 비밀번호
        <input
          name="next"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(event) => setNext(event.target.value)}
        />
      </label>

      {rule === null ? null : <p role="alert">{PASSWORD_REASONS[rule] ?? rule}</p>}

      <button type="submit" disabled={보내는중}>
        바꾸기
      </button>
    </form>
  );
}
