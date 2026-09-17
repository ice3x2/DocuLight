import { useState } from 'react';
import { createRoot } from 'react-dom/client';

import { DocumentSurface } from '../src/document/DocumentSurface.js';
import { NewVersionPrompt } from '../src/tree/NewVersionPrompt.js';
import type { TreeNodeView } from '../src/tree/tree-contract.js';
import '../src/styles/index.css';
import '../src/styles/shell.css';

const binary: TreeNodeView = { id: 'binary', name: '매우 긴 한글과 LongUnbrokenFilenameForIssue58.zip', kind: 'file', visibility: 'full', level: 'edit', parentLevel: 'edit', overwriteIrreversible: true, children: [] };

function Fixture() {
  const [surface, setSurface] = useState<'wide' | 'tall' | 'tiny' | 'missing' | 'forbidden' | 'retry' | 'download'>('wide');
  const [picker, setPicker] = useState(false);
  const [picks, setPicks] = useState(0);
  const file = surface === 'download'
    ? { nodeId: 'download', name: '긴 이름 📎 보고서 LongUnbrokenFilenameForDownload.pdf', level: 'view' as const }
    : { nodeId: surface, name: `${surface}-투명그림.png`, level: 'view' as const };
  return <main style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
    <nav>{(['wide','tall','tiny','missing','forbidden','retry','download'] as const).map((name) => <button key={name} onClick={() => setSurface(name)}>{name}</button>)}<button onClick={() => setPicker(true)}>picker</button></nav>
    <div style={{ display:'flex', minWidth:0, minHeight:0, flex:'1 1 auto' }}><DocumentSurface file={file} /></div>
    {picker ? <NewVersionPrompt node={binary} onPick={async () => { setPicks((value) => value + 1); return { status: 'success' }; }} onCancel={() => setPicker(false)} /> : null}
    <output aria-label="pick count">{picks}</output>
  </main>;
}

createRoot(document.getElementById('root')!).render(<Fixture />);
