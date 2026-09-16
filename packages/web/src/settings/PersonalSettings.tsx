import { useId } from 'react';

import { personalFieldsOf, type PersonalSettingField } from '../shell/shell-contract.js';

export type ThemeSaveState =
  | { state: 'idle' }
  | { state: 'saving' }
  | { state: 'saved' }
  | { state: 'error'; onRetry: () => void };

export type ThemeLoadState =
  | { state: 'loading' }
  | { state: 'ready' }
  | { state: 'error'; onRetry: () => void };

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
  themeLoadState = { state: 'ready' },
  themeSaveState = { state: 'idle' },
}: {
  category: PersonalSettingField['category'];
  /** 서버가 준 값. 없는 항목은 그 설정의 기본값으로 그린다. */
  values?: Readonly<Record<string, string>>;
  onPick?: (key: string, value: string) => void;
  themeLoadState?: ThemeLoadState;
  themeSaveState?: ThemeSaveState;
}) {
  const prefix = useId();
  const themeLoadId = `${prefix}-theme-load`;

  return (
    <>
      {personalFieldsOf(category).map((field) => (
        <p key={field.key}>
          <label htmlFor={`${prefix}-${field.key}`}>{field.label}</label>
          <select
            id={`${prefix}-${field.key}`}
            value={values[field.key] ?? field.fallback}
            disabled={category === 'appearance' && themeLoadState.state !== 'ready'}
            aria-describedby={category === 'appearance' && themeLoadState.state !== 'ready'
              ? themeLoadId
              : undefined}
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
      {category === 'appearance' && themeLoadState.state === 'loading' && (
        <p id={themeLoadId} role="status">테마 설정을 불러오는 중…</p>
      )}
      {category === 'appearance' && themeLoadState.state === 'error' && (
        <p id={themeLoadId} role="alert">
          테마 설정을 불러오지 못했습니다.{' '}
          <button type="button" onClick={themeLoadState.onRetry}>다시 불러오기</button>
        </p>
      )}
      {category === 'appearance' && themeSaveState.state === 'saving' && (
        <p role="status">테마 저장 중…</p>
      )}
      {category === 'appearance' && themeSaveState.state === 'saved' && (
        <p role="status">테마 저장됨</p>
      )}
      {category === 'appearance' && themeSaveState.state === 'error' && (
        <p role="alert">
          테마를 저장하지 못했습니다. 마지막 저장값으로 복원했습니다.{' '}
          <button type="button" onClick={themeSaveState.onRetry}>테마 저장 다시 시도</button>
        </p>
      )}
    </>
  );
}
