import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DocumentSurface } from '../src/document/DocumentSurface.js';
import { MergeView } from '../src/document/MergeView.js';
import { ThemeRuntime, type ThemePreference } from '../src/theme/runtime.js';
import '../src/styles/index.css';
import '../src/styles/shell.css';
import '@doculight/editor/styles.css';

const markdown = [
  '# 매우 긴 한국어 신문 제목과줄바꿈없는ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  '', '## 둘째 제목', '', '### 셋째 제목', '', '#### 넷째 제목', '', '##### 다섯째 제목', '', '###### 여섯째 제목',
  '', '> 신문지 인용문입니다.', '', '- [x] 완료한 일', '- [ ] 남은 일', '',
  '본문과 `inline code`가 있습니다.', '', '| 열하나 | 열둘 | 열셋 | 열넷 | 열다섯 | 열여섯 | 열일곱 | 열여덟 |', '| --- | --- | --- | --- | --- | --- | --- | --- |', '| 매우긴표값ABCDEFGHIJKLMN | 둘 | 셋 | 넷 | 다섯 | 여섯 | 일곱 | 여덟 |', '',
  '```ts', 'const answer = 42;', '```', '', '$$E = mc^2$$', '', '#신문지', '',
  '```mermaid', 'graph LR; A[긴 노드 A]-->B[긴 노드 B]-->C[긴 노드 C]-->D[긴 노드 D]-->E[긴 노드 E]-->F[긴 노드 F]-->G[긴 노드 G]-->H[긴 노드 H]-->I[긴 노드 I]-->J[긴 노드 J]-->K[긴 노드 K]-->L[긴 노드 L]-->M[긴 노드 M]-->N[긴 노드 N]-->O[긴 노드 O]-->P[긴 노드 P];', '```', '',
  '```mermaid', 'graph LR; A[긴 노드 A]-->B[긴 노드 B]-->C[긴 노드 C]-->D[긴 노드 D]-->E[긴 노드 E]-->F[긴 노드 F]-->G[긴 노드 G]-->H[긴 노드 H]-->I[긴 노드 I]-->J[긴 노드 J]-->K[긴 노드 K]-->L[긴 노드 L]-->M[긴 노드 M]-->N[긴 노드 N]-->O[긴 노드 O]-->P[긴 노드 P];', '```', '',
  '[^각주]: 각주 정의 😀  ', '', '마지막 공백을 보존합니다.  ',
  ...Array.from({ length: 30 }, (_, i) => `문단 ${i + 1} 긴 본문 내용입니다.`),
].join('\n');

declare global { interface Window { __issue54: { saves: Array<{ body: string }>; markdown: string; setTheme?: (value: ThemePreference) => void } } }
window.__issue54 = { saves: [], markdown };
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = String(input).split('?')[0];
  if (path.endsWith('/session')) return new Response(JSON.stringify({ session: 'issue54-session' }), { headers: { 'content-type': 'application/json' } });
  if (path.endsWith('/api/documents/issue54') && init?.method === 'PUT') {
    const payload = JSON.parse(String(init.body)) as { body: string };
    window.__issue54.saves.push(payload);
    return new Response(JSON.stringify({ hash: `saved-${window.__issue54.saves.length}` }), { headers: { 'content-type': 'application/json' } });
  }
  return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
}) as typeof fetch;

function Fixture() {
  const requested = new URLSearchParams(location.search).get('theme');
  const initial: ThemePreference = requested === 'dark' || requested === 'system' ? requested : 'light';
  const [preference, setPreference] = useState<ThemePreference>(initial);
  window.__issue54.setTheme = setPreference;
  return <>
    <ThemeRuntime settingsResolved userId="issue54-user" preference={preference} />
    <nav aria-label="테마 시험" style={{ position: 'fixed', left: -10000 }}>
      {(['light','dark','system'] as const).map(value => <button key={value} onClick={() => setPreference(value)}>테마 {value}</button>)}
    </nav>
    <main data-product-shell style={{ width: '100vw', height: '100vh', display: 'flex', minWidth: 0, minHeight: 0 }}>
      <DocumentSurface file={{ nodeId: 'issue54', name: '신문지.md', level: 'edit' }} body={markdown} baseHash="h1" initialMode="read" />
      <aside data-merge-fixture style={{ position: 'fixed', right: 0, bottom: 0, width: 420, height: 150, overflow: 'auto', background: 'var(--surface-document)' }}>
        <div data-merge-case="theme-transition"><MergeView label="테마 병합" left={'# 이전\n'} right={'# 현재\n초안'} /></div>
        <div data-pure-insert><MergeView label="순수 추가" left={'같음\n'} right={'같음\n추가\n'} /></div>
        <div data-pure-delete><MergeView label="순수 삭제" left={'같음\n삭제\n'} right={'같음\n'} /></div>
      </aside>
    </main>
  </>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
