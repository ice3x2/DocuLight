import { AtomicCodeMirrorEditor, doculightExtensions } from '@doculight/editor';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { urlForNode } from '../routing/deep-link.js';
import {
  MODE_LABEL,
  isEditing,
  isMarkdown,
  nextMode,
  surfaceOf,
  type Mode,
} from './surface-contract.js';
import type { SaveState } from './tab-state.js';
import { useAutosave } from './useAutosave.js';

export interface OpenFile {
  nodeId: string;
  name: string;
  /** 이 문서에 대한 요청자의 유효 권한. 서버가 판정한 값을 그대로 받는다. */
  level: 'view' | 'edit' | 'admin' | null;
}

const canEditFile = (file: OpenFile) => file.level === 'edit' || file.level === 'admin';

/**
 * 상단 모드 토글 (`FR-EDITOR-002` · `FR-EDITOR-003` · `FR-EDITOR-004`).
 *
 * 보기 권한만 있어도 **편집 버튼을 남긴다**(`FR-EDITOR-004` AC-1). 사라지면
 * 그 문서가 편집 불가한 종류인 것으로 읽히고, 권한을 얻은 뒤에도 사용자가
 * 그것을 찾지 못한다. 대신 비활성으로 두고 전이 자체를 막는다.
 *
 * 비-md 파일에는 토글 자체가 서지 않는다(`FR-EDITOR-006` AC-2) — 편집할
 * 수 있는 종류가 아니라 비활성으로 보여 주면 언젠가 열릴 것처럼 읽힌다.
 */
function ModeToggle({
  file,
  mode,
  onChange,
}: {
  file: OpenFile;
  mode: Mode;
  onChange: (to: Mode) => void;
}) {
  if (!isMarkdown(file.name)) return null;

  const editable = canEditFile(file);

  return (
    <div role="group" aria-label="모드">
      <button type="button" aria-pressed={!isEditing(mode)} onClick={() => onChange('read')}>
        보기
      </button>
      <button
        type="button"
        aria-pressed={isEditing(mode)}
        aria-disabled={editable ? undefined : 'true'}
        onClick={() => onChange('live')}
      >
        편집
      </button>

      {isEditing(mode) && (
        // 하위 토글은 편집 계열 안에서만 뜻이 있다 — 읽기 중에 소스로 가는
        // 길을 열면 「읽기」와 「편집」의 경계가 사라진다.
        <>
          <button type="button" aria-pressed={mode === 'live'} onClick={() => onChange('live')}>
            라이브 프리뷰
          </button>
          <button type="button" aria-pressed={mode === 'source'} onClick={() => onChange('source')}>
            소스
          </button>
        </>
      )}
    </div>
  );
}

/**
 * 본문 영역.
 *
 * md 는 모드에 따라, 그 밖은 종류에 따라 그린다. **에디터 인스턴스가
 * 본문의 정본이다**(`CON-ARCH-006`) — 여기에 본문 문자열을 들고 있는
 * React 상태가 없는 이유가 그것이다.
 */
export function DocumentSurface({
  file,
  initialMode = 'read',
  save = 'saved',
  serverBody = null,
  body,
  baseHash,
  onTagClick,
}: {
  file: OpenFile;
  initialMode?: Mode;
  save?: SaveState;
  serverBody?: string | null;
  /** 서버가 본문과 함께 준 기준 해시 — 저장 요청이 이것을 싣는다. */
  baseHash?: string;
  /**
   * 서버에서 받아 온 본문. **초기 문서**를 넘기는 값이지 controlled
   * `value` 가 아니다 (`CON-ARCH-006` AC-2) — 편집기가 이것을 한 번 받아
   * 자기 문서로 삼고, 그 뒤로 정본은 편집기다.
   *
   * 아직 안 왔으면 편집기를 세우지 않는다. 빈 문자열로 세우면 사용자가
   * 그 위에 쓰기 시작하고, 본문이 도착하는 순간 그 편집이 밀린다.
   */
  body?: string;
  onTagClick?: (name: string) => void;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const surface = surfaceOf(file.name);
  // 확장 묶음을 마운트마다 다시 만들면 그때마다 편집기가 재구성된다.
  const extensions = useMemo(
    () => doculightExtensions(onTagClick === undefined ? {} : { onTagClick }),
    [onTagClick],
  );

  const change = (to: Mode) => setMode((from) => nextMode(from, to, { canEdit: canEditFile(file) }));

  const autosave = useAutosave(file.nodeId, baseHash);
  // 편집기 인스턴스에서 본문을 꺼낸다 — 정본이 거기이기 때문이다
  // (`CON-ARCH-006` AC-3).
  const readBody = useRef<() => string>(() => body ?? '');

  // Ctrl+S 는 디바운스를 건너뛰고 스냅샷을 강제한다 (`FR-STORAGE-001`
  // AC-3 · AC-4). 브라우저의 저장 대화상자를 막는다 — 그것이 뜨면
  // 사용자는 이 앱이 저장하지 않는다고 읽는다.
  const forceKey = useCallback(
    (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return;
      event.preventDefault();
      autosave.saveNow(readBody.current());
    },
    [autosave],
  );

  useEffect(() => {
    window.addEventListener('keydown', forceKey);
    return () => window.removeEventListener('keydown', forceKey);
  }, [forceKey]);

  // 자동 저장의 상태가 화면의 저장 상태를 이긴다 — 바깥이 준 값은 처음
  // 한 번뿐이고, 그 뒤로 실제 저장을 아는 것은 이쪽이다.
  const shown: SaveState =
    autosave.status === 'conflict' ? 'conflict' : autosave.status === 'rejected' ? 'rejected' : save;
  const conflictBody = autosave.serverBody ?? serverBody;

  if (surface === 'image') {
    return (
      <div>
        <img src={urlForNode(file.nodeId)} alt={file.name} />
      </div>
    );
  }

  if (surface === 'download') {
    // 뷰어를 열지 않는다 — 링크 하나가 이 요구의 전부다.
    return (
      <div>
        <a href={urlForNode(file.nodeId)} download={file.name}>
          {file.name} 내려받기
        </a>
      </div>
    );
  }

  return (
    <div>
      <ModeToggle file={file} mode={mode} onChange={change} />

      {shown === 'rejected' && (
        <div role="alert">
          <p>저장이 거부되었습니다. 편집 중이던 본문은 그대로 남아 있습니다.</p>
          {/* 본문을 되찾을 길을 함께 준다 (`FR-EDITOR-005` AC-2) — 알리기만
              하면 사용자는 화면을 닫는 순간 자기 글을 잃는다. */}
          <button type="button">내려받기</button>
        </div>
      )}

      {shown === 'conflict' && (
        <div role="region" aria-label="병합">
          <div role="alert">저장 중 원본이 바뀌어 병합이 필요합니다.</div>
          {/* 양쪽을 나란히 둔다 (`FR-EDITOR-008` AC-3) — 서버의 현재 내용이
              없으면 사용자는 무엇을 고를지 알 수 없다. */}
          <pre aria-label="서버의 현재 내용">{conflictBody}</pre>
        </div>
      )}

      <div role="region" aria-label={MODE_LABEL[mode]} data-node={file.nodeId}>
        {body === undefined ? null : mode === 'read' ? (
          // 읽기 모드도 같은 편집기로 그린다 — 두 렌더러를 두면 같은
          // 문서가 두 모습으로 보이고, 그 차이는 아무도 눈치채지 못한다.
          <AtomicCodeMirrorEditor markdownSource={body} extensions={extensions} readOnly />
        ) : mode === 'source' ? (
          // 소스는 원문 그대로다 — 데코레이션을 걸면 소스가 아니다.
          <pre>{body}</pre>
        ) : (
          <AtomicCodeMirrorEditor
            markdownSource={body}
            extensions={extensions}
            onMarkdownChange={(next: string) => {
              // 본문을 상태에 올리지 않고 **꺼내 오는 함수**만 갱신한다
              // (`CON-ARCH-006` AC-1) — 올리면 정본이 둘이 된다.
              readBody.current = () => next;
              autosave.changed(next);
            }}
          />
        )}
      </div>
    </div>
  );
}
