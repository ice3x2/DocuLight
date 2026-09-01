import { useState } from 'react';

/**
 * 이름과 비밀번호를 받아 한 번 제출하는 폼.
 *
 * 로그인(`IR-AUTH-001` AC-1)과 가입 신청(AC-2)이 같은 골격을 쓴다 — 두 번째
 * 사용처가 생긴 자리에서 공용화했다. 갈리는 것은 셋뿐이며 전부 인자로 받는다:
 * 버튼 문구, 자동완성 힌트, 그리고 **성공했을 때 무엇을 보이는가**.
 *
 * **거절 사유를 이 부품이 짓지 않는다.** 사유는 서버가 소유하고 여기서는
 * 받은 문장을 그대로 세운다 — 화면이 자기 문구를 갖기 시작하면 서버의 판정이
 * 늘 때마다 두 곳이 갈리고, 갈린 쪽은 사용자가 무엇을 해야 할지 알 수 없는
 * 일반 문구로 뭉개진다.
 */
export function CredentialForm({
  submitLabel,
  passwordHint,
  successNotice,
  onSubmit,
}: {
  /** 제출 버튼의 문구. 이 폼이 무엇을 하는지 사용자가 읽는 유일한 자리다. */
  submitLabel: string;
  /** 비밀번호 칸의 `autoComplete`. 로그인은 기존 것, 가입은 새 것이다. */
  passwordHint: 'current-password' | 'new-password';
  /**
   * 성공했을 때 세울 안내. 없으면 아무것도 세우지 않는다.
   *
   * 로그인은 화면 자체가 바뀌므로 안내가 필요 없지만, 가입 신청은 같은
   * 화면에 남으므로 아무 말도 없으면 사용자가 신청이 나갔는지 알 수 없어
   * 다시 누른다.
   */
  successNotice?: string;
  /** 제출한다. 거절되면 그 사유 문장을, 되면 아무것도 돌려주지 않는다. */
  onSubmit?: (input: { name: string; password: string }) => Promise<string | undefined | void>;
}) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState<string | null>(null);
  const [됐다, set됐다] = useState(false);
  const [보내는중, set보내는중] = useState(false);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (보내는중) return;
        set보내는중(true);
        setReason(null);
        set됐다(false);
        void Promise.resolve(onSubmit?.({ name, password }))
          .then((거절) => {
            if (typeof 거절 === 'string') setReason(거절);
            else set됐다(true);
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
          autoComplete={passwordHint}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>

      {/* 사유는 `alert` 로 세운다 — 화면 낭독기가 그것을 읽지 않으면
          왜 안 되는지 알 방법이 없다. */}
      {reason === null ? null : <p role="alert">{reason}</p>}
      {됐다 && successNotice !== undefined ? <p role="status">{successNotice}</p> : null}

      <button type="submit" disabled={보내는중}>
        {submitLabel}
      </button>
    </form>
  );
}
