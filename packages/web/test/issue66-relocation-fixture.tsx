import { useState } from 'react';
import { createRoot } from 'react-dom/client';

import { RelocationDialog } from '../src/shell/RelocationDialog.js';
import '../src/styles/index.css';

const longSource = '아주 긴 한글 원본 문서 이름과 분기별 검토 기록을 모두 포함한 회의록 최종 검토본.md';
const longPath = '본사 문서함/제품 전략과 장기 계획/2026년 하반기 매우 긴 한글 프로젝트 이름/검토 완료 자료';
const destinations = [
  { id: 'one', path: longPath },
  ...Array.from({ length: 18 }, (_, index) => ({ id: `d${index}`, path: `부서 ${index + 1}/업무 자료/보관 위치 ${index + 1}` })),
];

function Fixture() {
  const state = new URLSearchParams(location.search).get('state') ?? 'increase';
  const kind = state === 'copy' ? 'copy' : 'move';
  const relocation = state === 'missing'
    ? undefined
    : kind === 'copy'
      ? { kind: 'copy' as const, reachable: 7 }
      : state === 'equal'
        ? { kind: 'move' as const, before: 4, after: 4 }
        : state === 'decrease'
          ? { kind: 'move' as const, before: 5, after: 2 }
          : { kind: 'move' as const, before: 3, after: 8 };
  const available = state === 'empty' ? [] : destinations;
  const [destinationId, setDestinationId] = useState(state === 'empty' ? '' : 'one');
  const [cancelCount, setCancelCount] = useState(0);
  const [confirmCount, setConfirmCount] = useState(0);

  return (
    <main data-issue66-component-harness="" data-cancel-count={cancelCount} data-confirm-count={confirmCount}>
      <RelocationDialog
        kind={kind}
        open
        sourceName={longSource}
        destinations={available}
        destinationId={destinationId}
        {...(relocation === undefined ? {} : { relocation })}
        grade="L2"
        level="admin"
        {...(kind === 'copy' ? { result: { copied: 6 } } : {})}
        onDestination={setDestinationId}
        onCancel={() => setCancelCount((value) => value + 1)}
        onConfirm={() => setConfirmCount((value) => value + 1)}
      />
    </main>
  );
}

const root = document.getElementById('root');
if (root === null) throw new Error('fixture root missing');
createRoot(root).render(<Fixture />);
