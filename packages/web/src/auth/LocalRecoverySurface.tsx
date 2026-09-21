import { useEffect, useState } from 'react';

import { Button } from '../components/ui/button.js';
import type { RecoveryRecord } from './auth-boundary.js';

export function LocalRecoverySurface({
  records,
  onResolve,
}: {
  records: readonly RecoveryRecord[];
  onResolve: (recordId: string) => void;
}) {
  const [downloaded, setDownloaded] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    if (records.length === 0) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [records.length]);

  const download = (record: RecoveryRecord) => {
    const url = URL.createObjectURL(new Blob([record.text], { type: 'text/markdown;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = record.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    setDownloaded((was) => new Set(was).add(record.id));
  };

  return (
    <main aria-label="로컬 편집본 복구" data-local-recovery>
      <h1>로컬 편집본 — 서버에 저장되지 않았습니다.</h1>
      <p>원래 계정에서 이 브라우저에 남겨 둔 편집 내용입니다. 서버 문서로 자동 저장하거나 병합하지 않습니다.</p>
      {records.map((record, index) => (
        <section key={record.id} aria-label={`로컬 편집본 ${index + 1}`}>
          <label>
            로컬 편집 내용
            <textarea readOnly value={record.text} />
          </label>
          <div data-local-recovery-actions>
            <Button type="button" onClick={() => download(record)}>로컬 파일로 다운로드</Button>
            <Button
              type="button"
              disabled={!downloaded.has(record.id)}
              onClick={() => onResolve(record.id)}
            >
              파일 보관을 확인하고 제거
            </Button>
            <Button type="button" variant="destructive" onClick={() => onResolve(record.id)}>편집본 버리기</Button>
          </div>
        </section>
      ))}
    </main>
  );
}
