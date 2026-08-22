import { useEffect, useState } from 'react';

import { loadSettings, saveSettings } from '../api/client.js';
import { INSTANCE_SETTING_FIELDS } from '../shell/shell-contract.js';

/**
 * 인스턴스 설정 (`IR-SHELL-002` AC-7 · `DR-SHELL-001` AC-3).
 *
 * 다섯 설정의 이름과 키는 **셸 계약이 소유한다** — 여기서 다시 적으면
 * 그 목록이 둘이 되고, 목록이 갈리면 아무도 알아채지 못한다.
 *
 * 값을 문자열로 다룬다 — 저장소가 문자열만 담고, 해석은 그 설정을 쓰는
 * 쪽이 한다. 여기서 숫자로 바꿔 주면 잘못된 값의 처리 방식이 설정마다
 * 달라야 하는데 그 판단이 이 화면에 없다.
 */
export function InstanceSettings() {
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void loadSettings()
      .then(setValues)
      // 못 읽으면 빈 폼이 아니라 그 사실을 보여 준다 — 빈 폼은 값이
      // 없는 것으로 읽히고, 사용자가 그 위에 저장하면 전부 덮인다.
      .catch(() => setFailed(true));
  }, []);

  if (failed) return <p>설정을 불러오지 못했습니다.</p>;
  if (values === null) return <p>설정을 불러오는 중입니다.</p>;

  return (
    <form
      aria-label="인스턴스 설정"
      onSubmit={(event) => {
        event.preventDefault();
        void saveSettings(values).catch(() => setFailed(true));
      }}
    >
      {INSTANCE_SETTING_FIELDS.map((field) => (
        <label key={field.key}>
          {field.label}
          <input
            value={values[field.key] ?? ''}
            onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
          />
        </label>
      ))}

      <button type="submit">저장</button>
    </form>
  );
}
