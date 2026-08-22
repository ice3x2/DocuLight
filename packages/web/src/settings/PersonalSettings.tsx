import { useId } from 'react';

import { personalFieldsOf, type PersonalSettingField } from '../shell/shell-contract.js';

/**
 * `에디터`·`외모(테마)` 카테고리의 내용 (`IR-SHELL-004`).
 *
 * **목록을 계약에서 읽는다.** 화면이 항목을 손으로 적으면 계약과 화면이 두
 * 벌이 되고, 한쪽만 고쳐진 뒤에는 「설정에 있는데 저장이 안 된다」로 나타난다.
 *
 * 값을 여기서 들지 않는다 — 정본은 (사용자, 항목) 쌍의 DB 행이고
 * (`DR-SHELL-002`) 이 부품은 받은 것을 그리고 고른 것을 되돌려 줄 뿐이다.
 * 안에서 들면 화면 상태와 서버 값이 갈리고, 갈린 뒤에는 새로고침해야
 * 어느 쪽이 옳은지 알 수 있다.
 */
export function PersonalSettings({
  category,
  values = {},
  onPick,
}: {
  category: PersonalSettingField['category'];
  /** 서버가 준 값. 없는 항목은 그 설정의 기본값으로 그린다. */
  values?: Readonly<Record<string, string>>;
  onPick?: (key: string, value: string) => void;
}) {
  const prefix = useId();

  return (
    <>
      {personalFieldsOf(category).map((field) => (
        <p key={field.key}>
          <label htmlFor={`${prefix}-${field.key}`}>{field.label}</label>
          <select
            id={`${prefix}-${field.key}`}
            value={values[field.key] ?? field.fallback}
            onChange={(event) => onPick?.(field.key, event.target.value)}
          >
            {field.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </p>
      ))}
    </>
  );
}
