import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';

import { ThemeRuntime, type ThemePreference } from '../src/theme/runtime.js';

declare global {
  interface Window { editorMounts: number; firstTheme?: string }
}

window.editorMounts = 0;
window.firstTheme = document.documentElement.dataset.theme;

function EditorProbe() {
  useEffect(() => {
    window.editorMounts += 1;
  }, []);
  return <textarea aria-label="편집기 표본" defaultValue="선택과 실행취소 이력을 가진 본문" />;
}

const requested = new URLSearchParams(location.search).get('preference');
const preference: ThemePreference = requested === 'light' || requested === 'dark' ? requested : 'system';

createRoot(document.querySelector('#react-root')!).render(
  <>
    <ThemeRuntime settingsResolved userId="browser-user" preference={preference} />
    <EditorProbe />
  </>,
);
