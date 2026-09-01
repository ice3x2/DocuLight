import { useState } from 'react';

/**
 * 로그인 폼 (`IR-AUTH-001` AC-1).
 *
 * **거절 사유를 화면이 짓지 않는다.** 상태별 안내(R60 · R60-b)는 서버의
 * `account-gate` 가 소유하고 이 화면은 받은 문장을 그대로 세운다 — 여기에
 * 문구를 두면 계정 상태가 늘 때마다 두 곳이 갈리고, 갈린 쪽은 사용자가
 * 무엇을 해야 할지 알 수 없는 일반 문구로 뭉개진다.
 */
export function LoginForm({
  onLogin,
}: {
  /** 로그인을 시도한다. 거절되면 그 사유 문장을, 되면 아무것도 돌려주지 않는다. */
  onLogin?: (input: { name: string; password: string }) => Promise<string | undefined | void>;
}) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState<string | null>(null);
  const [보내는중, set보내는중] = useState(false);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (보내는중) return;
        set보내는중(true);
        setReason(null);
        void Promise.resolve(onLogin?.({ name, password }))
          .then((거절) => {
            if (typeof 거절 === 'string') setReason(거절);
          })
          .finally(() => set보내는중(false));
      }}
    >
      <label>
        이름
        <input
          name="name"
          autoComplete="username"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label>
        비밀번호
        {/* 가린다 — 어깨너머로 읽히면 그 계정이 그대로 열린다. */}
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>

      {/* 사유는 `alert` 로 세운다 — 화면 낭독기가 그것을 읽지 않으면
          로그인이 왜 안 되는지 알 방법이 없다. */}
      {reason === null ? null : <p role="alert">{reason}</p>}

      <button type="submit" disabled={보내는중}>
        로그인
      </button>
    </form>
  );
}
