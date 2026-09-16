import { useEffect, useRef } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type RenderedTheme = Exclude<ThemePreference, 'system'>;

const memory = new Map<string, ThemePreference>();

const isThemePreference = (value: string | undefined): value is ThemePreference =>
  value === 'light' || value === 'dark' || value === 'system';

const systemTheme = (): RenderedTheme =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

export function applyThemePreference(preference: ThemePreference): RenderedTheme {
  const rendered = preference === 'system' ? systemTheme() : preference;
  document.documentElement.dataset.theme = rendered;
  document.documentElement.style.colorScheme = rendered;
  return rendered;
}

export function rememberTheme(userId: string, preference: ThemePreference): void {
  memory.set(userId, preference);
}

export const cachedTheme = (userId: string): ThemePreference | undefined => memory.get(userId);

export function clearThemeMemory(): void {
  memory.clear();
}

export function useThemeRuntime({
  userId,
  preference,
  settingsResolved,
}: {
  userId?: string;
  preference?: string;
  settingsResolved: boolean;
}): void {
  const activePreference = useRef<ThemePreference>('system');
  const previousUser = useRef<string | undefined>(undefined);

  useEffect(() => {
    const changedUser = previousUser.current !== undefined && previousUser.current !== userId;
    const lostSession = previousUser.current !== undefined && userId === undefined;
    if (changedUser || lostSession) clearThemeMemory();
    previousUser.current = userId;

    let next: ThemePreference = 'system';
    if (userId !== undefined) {
      if (settingsResolved && isThemePreference(preference)) {
        next = preference;
        rememberTheme(userId, next);
      } else {
        next = cachedTheme(userId) ?? 'system';
      }
    }

    activePreference.current = next;
    applyThemePreference(next);
  }, [preference, settingsResolved, userId]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const changed = () => {
      if (activePreference.current === 'system') applyThemePreference('system');
    };
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
}

export function ThemeRuntime(props: {
  userId?: string;
  preference?: string;
  settingsResolved: boolean;
}) {
  useThemeRuntime(props);
  return null;
}
