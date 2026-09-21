import { AtomicCodeMirrorEditor, doculightExtensions, type AtomicCodeMirrorEditorHandle } from '@doculight/editor';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { fetchWikiTargets, uploadAttachment } from '../api/client.js';
import { pasteUpload } from '../attachment/upload-contract.js';
import { Button } from '../components/ui/button.js';
import { ErrorState, LoadingState } from '../components/ui/states.js';
import { urlForNode } from '../routing/deep-link.js';
import { MergeView } from './MergeView.js';
import { resolveWikiLink } from './wiki-link-resolve.js';
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
import type { AuthOwner, LiveDraftRegistration } from '../auth/auth-boundary.js';
import type { MergeViewHandle } from './MergeView.js';

export interface OpenFile {
  nodeId: string;
  name: string;
  /** 이 문서에 대한 요청자의 유효 권한. 서버가 판정한 값을 그대로 받는다. */
  level: 'view' | 'edit' | 'admin' | null;
}

const canEditFile = (file: OpenFile) => file.level === 'edit' || file.level === 'admin';

/**
 * 편집 중이던 본문을 로컬 파일로 내린다 (`FR-EDITOR-005` AC-2).
 *
 * 서버를 거치지 않는다 — 거칠 수 있었으면 애초에 저장이 됐을 것이다.
 * 브라우저가 가진 것만으로 파일을 만든다.
 */
function downloadBody(name: string, body: string): void {
  const url = URL.createObjectURL(new Blob([body], { type: 'text/markdown' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  // 놓아주지 않으면 그 blob 이 탭이 닫힐 때까지 메모리에 남는다.
  URL.revokeObjectURL(url);
}

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
  disabled = false,
}: {
  file: OpenFile;
  mode: Mode;
  onChange: (to: Mode) => void;
  disabled?: boolean;
}) {
  if (!isMarkdown(file.name)) return null;

  const editable = canEditFile(file);

  return (
    <div role="group" aria-label="모드">
      <button type="button" disabled={disabled} aria-pressed={!isEditing(mode)} onClick={() => onChange('read')}>
        보기
      </button>
      <button
        type="button"
        disabled={disabled}
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
          <button type="button" disabled={disabled} aria-pressed={mode === 'live'} onClick={() => onChange('live')}>
            라이브 프리뷰
          </button>
          <button type="button" disabled={disabled} aria-pressed={mode === 'source'} onClick={() => onChange('source')}>
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
  onOpenWikiLink,
  onSaved,
  onAuthenticationLoss,
  onSaveState,
  registerDraft,
  beforeDraftUnmount,
  draftOwner,
  allowsProtected,
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
  /** 위키링크를 눌렀다 (`CON-EDITOR-002` AC-1). 그 문서를 여는 일은 셸이 한다. */
  onOpenWikiLink?: (target: string) => void;
  /**
   * 이 본문이 서버에 올라갔다.
   *
   * 받는 쪽이 서버 상태 캐시를 그 값으로 맞춘다 — 맞추지 않으면 탭을 닫았다
   * 열었을 때 저장 전 본문이 돌아온다.
   */
  onSaved?: (body: string, hash: string) => void;
  onAuthenticationLoss?: () => void;
  /**
   * 저장 상태가 바뀌었다.
   *
   * 위로 알리는 이유는 **탭 교체 판정이 바깥에 있기** 때문이다
   * (`FR-SHELL-012` AC-3 · AC-4) — 이 안에만 두면 잃을 것이 남은 탭인지를
   * 바깥이 알 수 없어 그대로 교체한다.
   */
  onSaveState?: (state: SaveState) => void;
  registerDraft?: (surface: LiveDraftRegistration) => () => void;
  beforeDraftUnmount?: (surface: LiveDraftRegistration) => void;
  draftOwner?: AuthOwner;
  allowsProtected?: (owner: AuthOwner) => boolean;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const frozen = useRef(false);
  const [isFrozen, setIsFrozen] = useState(false);
  const surface = surfaceOf(file.name);
  const ownerAllowsProtected = useCallback(
    () => !frozen.current && (draftOwner === undefined || allowsProtected === undefined || allowsProtected(draftOwner)),
    [allowsProtected, draftOwner],
  );
  /**
   * 첨부 업로드 (`FR-ATTACH-004`).
   *
   * 권한을 **여기서 먼저 본다**(AC-4) — 받아 놓고 서버가 거절하면
   * 사용자에게는 파일이 사라진 것으로 보인다. 서버의 판정은 그대로 남는다.
   */
  const attach = useCallback(
    async (file: File): Promise<string | null> => {
      if (!ownerAllowsProtected()) return null;
      const ownerNodeId = fileRef.current.nodeId;
      const allowed = pasteUpload(
        { nodeId: ownerNodeId, level: fileRef.current.level },
        [file],
      );
      if (!allowed.ok) return null;

      const done = await uploadAttachment(ownerNodeId, file).catch(() => null);
      return done === null || !ownerAllowsProtected() || fileRef.current.nodeId !== ownerNodeId ? null : done.link;
    },
    [ownerAllowsProtected],
  );

  /**
   * `[[` 뒤의 후보 (`CON-EDITOR-002` AC-1).
   *
   * 못 받으면 **빈 목록**이다 — 던지면 편집기의 자동완성이 그 자리에서
   * 멈추고, 그 뒤로는 후보가 다시 뜨지 않는다.
   */
  const suggest = useCallback(
    (query: string) => ownerAllowsProtected()
      ? fetchWikiTargets(query)
        .then((rows) => ownerAllowsProtected()
          ? rows.map((row) => ({ target: row.target, label: row.label, detail: row.detail }))
          : [])
        .catch(() => [])
      : Promise.resolve([]),
    [ownerAllowsProtected],
  );

  // 확장 묶음을 마운트마다 다시 만들면 그때마다 편집기가 재구성된다.
  const extensions = useMemo(
    () =>
      doculightExtensions({
        ...(onTagClick === undefined ? {} : { onTagClick }),
        ...(onOpenWikiLink === undefined ? {} : { onOpenWikiLink: (target: string) => {
          if (ownerAllowsProtected()) onOpenWikiLink(target);
        } }),
        onAttach: attach,
        suggestWikiLinks: suggest,
        // 푸는 규칙은 `wiki-link-resolve` 한 자리다 — 여기서 감싸면
        // 없는 문서와 권한 없는 문서를 가르는 자리가 하나 더 생긴다.
        resolveWikiLink,
      }),
    [onTagClick, onOpenWikiLink, ownerAllowsProtected, attach, suggest],
  );

  const change = (to: Mode) => {
    if (frozen.current) return;
    setMode((from) => nextMode(from, to, { canEdit: canEditFile(file) }));
  };

  // 업로드 콜백이 파일 정보를 참조하되 그때마다 새로 만들어지지 않게 한다 —
  // 새로 만들면 확장 묶음이 바뀌어 편집기가 재구성되고 편집이 흔들린다.
  const fileRef = useRef(file);
  fileRef.current = file;

  /**
   * 저장이 성공하면 그 판본을 **아는 것**으로 적어 둔다.
   *
   * 적어 두지 않으면 그 판본이 캐시를 타고 되돌아올 때 「남이 갈아 끼운
   * 것」으로 읽혀, 저장 뒤에 더 친 글자가 그 자리에서 밀린다.
   */
  const noteSaved = useCallback(
    (savedBody: string, hash: string) => {
      // 이 판본은 **우리가 만든 것**이다. 적어 두지 않으면 그것이 캐시를
      // 타고 돌아올 때 남이 갈아 끼운 것으로 읽힌다.
      knownHashes.current.add(hash);
      if (ownerAllowsProtected()) onSaved?.(savedBody, hash);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ref 는 의도적으로 뺀다
    [onSaved, ownerAllowsProtected],
  );

  const autosave = useAutosave(file.nodeId, baseHash, noteSaved, onAuthenticationLoss, ownerAllowsProtected);
  const editorHandle = useRef<AtomicCodeMirrorEditorHandle | null>(null);
  const sourceHandle = useRef<HTMLTextAreaElement | null>(null);
  const mergeHandle = useRef<MergeViewHandle | null>(null);
  const frozenSnapshot = useRef<string | null>(null);
  /**
   * 편집기에 넘길 문서.
   *
   * 모드를 바꾸면 편집기가 다시 마운트되는데, 그때 **서버가 준 원본**을
   * 넘기면 사용자가 방금 친 글자가 사라진다(`FR-EDITOR-003` AC-3). 마지막
   * 으로 꺼내 온 값을 기억해 두었다가 그것을 넘긴다.
   *
   * 이것이 controlled `value` 가 아닌 이유는 **읽기만** 하기 때문이다 —
   * 타이핑마다 여기로 되돌려 렌더하지 않고, 마운트 시점에 한 번 쓴다
   * (`CON-ARCH-006` AC-2).
   */
  const lastBody = useRef<string | undefined>(body);
  /**
   * 우리가 아는 **서버 쪽 판본들**.
   *
   * 판정을 본문이 아니라 해시로 하는 이유가 중요하다. 본문으로 재면 우리가
   * 방금 저장한 글이 캐시를 타고 되돌아올 때 그것이 「남이 갈아 끼운 새
   * 본문」과 구별되지 않고, 그 사이에 더 친 글자가 밀린다. 해시로 재면
   * **우리가 만든 판본인지**가 곧바로 갈린다 — 저장 왕복이 도는 중에
   * 옛 본문이 다시 와도 그 해시는 이미 아는 것이라 아무 일도 없다.
   */
  const knownHashes = useRef<Set<string>>(new Set(baseHash === undefined ? [] : [baseHash]));
  /**
   * **남의 판본을 받아들인 횟수** (`FR-EDITOR-009` · `FR-SHELL-008` AC-2).
   *
   * 편집기의 정체성이 이 값을 탄다. 노드로만 고정하면 새 버전 올리기가
   * 갈아 끼운 본문을 편집기가 받지 못하고, 본문 문자열로 두면 우리가 방금
   * 저장한 판본이 돌아올 때마다 편집기가 통째로 다시 선다 — 그때 포커스가
   * 빠지고 이어 친 글자가 사라진다. 갈리는 자리는 **아는 판본인가**이고
   * 그 판정은 바로 아래 `knownHashes` 가 이미 한다.
   */
  const adopted = useRef(0);
  // 본문이 **나중에** 도착한다. 탭은 곧바로 서고 서버 응답은 그 뒤에
  // 오므로, 처음 한 번만 채우는 초기값에 기대면 그 자리가 빈 채로 굳는다 —
  // 그 상태로 Ctrl+S 를 누르면 빈 문자열이 저장되어 문서가 지워진다.
  //
  // 판본이 우리가 모르는 것으로 바뀌면 **본문도 함께** 받아들인다. 새 버전
  // 올리기가 그 경우다: 해시만 갈아 끼우고 본문을 두면 옛 본문 + 새 해시가
  // 되어 서버의 충돌 판정을 그대로 통과하고, 방금 올린 판본이 조용히
  // 되돌려진다.
  //
  // **하나가 아니라 아는 것 전부**를 든다. 마지막 하나만 들면 저장 응답이
  // 새 해시를 적어 둔 뒤 아직 옛 해시를 들고 있는 렌더가 한 번 끼는데,
  // 그때 「모르는 판본」으로 읽혀 옛 본문이 화면을 덮는다.
  if (baseHash !== undefined && !knownHashes.current.has(baseHash) && body !== undefined) {
    knownHashes.current.add(baseHash);
    lastBody.current = body;
    // 편집기가 이 본문을 실제로 열어야 한다 — 세대를 올려 정체성을 바꾼다.
    adopted.current += 1;
  } else if (body !== undefined && lastBody.current === undefined) {
    lastBody.current = body;
  }
  /** 지금 편집기가 들고 있는 본문. 저장·내려받기·머지가 이것을 읽는다. */
  const readBody = () => lastBody.current ?? '';
  const compositionStartBody = useRef<string | null>(null);
  const bodyChanged = (next: string) => {
    if (frozen.current) return;
    lastBody.current = next;
    if (compositionStartBody.current === null) autosave.changed(next);
  };
  const compositionStarted = () => {
    if (compositionStartBody.current === null) compositionStartBody.current = readBody();
  };
  const compositionEnded = () => {
    const before = compositionStartBody.current;
    compositionStartBody.current = null;
    const next = readBody();
    if (before !== null && next !== before) autosave.changed(next);
  };
  // **모드나 문서가 바뀔 때만** 다시 읽는다. 타이핑마다 새 값을 넘기면
  // 편집기가 자기 문서와 다른 값을 계속 받아 흔들리고, 글자가 새어 나간다.
  const documentText = useMemo(
    () => lastBody.current,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ref 는 의도적으로 뺀다
    [file.nodeId, mode, body],
  );

  // Ctrl+S 는 디바운스를 건너뛰고 스냅샷을 강제한다 (`FR-STORAGE-001`
  // AC-3 · AC-4). 브라우저의 저장 대화상자를 막는다 — 그것이 뜨면
  // 사용자는 이 앱이 저장하지 않는다고 읽는다.
  const forceKey = useCallback(
    (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return;
      event.preventDefault();
      if (!ownerAllowsProtected()) return;
      autosave.saveNow(readBody());
    },
    [autosave, ownerAllowsProtected],
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

  useEffect(() => onSaveState?.(shown), [shown, onSaveState]);

  const registeredDraft = useRef<LiveDraftRegistration | undefined>(undefined);
  useEffect(() => {
    if (registerDraft === undefined || draftOwner === undefined || baseHash === undefined) return;
    const registration: LiveDraftRegistration = {
      owner: draftOwner,
      nodeId: file.nodeId,
      revision: baseHash,
      get mode() { return shown === 'conflict' ? 'merge' : mode; },
      read: () => frozenSnapshot.current ?? mergeHandle.current?.getRight()
        ?? sourceHandle.current?.value
        ?? editorHandle.current?.getMarkdown()
        ?? readBody(),
      acknowledged: () => body ?? '',
      state: () => shown === 'rejected' || shown === 'conflict' || shown === 'saving' ? shown : 'saved',
      composing: () => compositionStartBody.current !== null,
      freeze: (next) => {
        if (next && !frozen.current) {
          frozenSnapshot.current = mergeHandle.current?.getRight()
            ?? sourceHandle.current?.value
            ?? editorHandle.current?.getMarkdown()
            ?? readBody();
        } else if (!next) {
          frozenSnapshot.current = null;
        }
        frozen.current = next;
        setIsFrozen(next);
        autosave.pause(next);
        editorHandle.current?.setReadOnly(next || mode === 'read');
        if (sourceHandle.current !== null) sourceHandle.current.readOnly = next;
        mergeHandle.current?.setReadOnly(next);
      },
    };
    registeredDraft.current = registration;
    const unregister = registerDraft(registration);
    return () => {
      if (registeredDraft.current === registration) registeredDraft.current = undefined;
      unregister();
    };
  }, [registerDraft, draftOwner, file.nodeId, baseHash, body, mode, shown, autosave]);

  useLayoutEffect(() => () => {
    if (registeredDraft.current !== undefined) beforeDraftUnmount?.(registeredDraft.current);
  }, [beforeDraftUnmount]);

  if (surface === 'image') {
    return <ImageSurface nodeId={file.nodeId} name={file.name} />;
  }

  if (surface === 'download') {
    // 뷰어를 열지 않는다 — 링크 하나가 이 요구의 전부다.
    return (
      <div data-file-download-surface>
        <p>파일을 내려받아 확인하세요.</p>
        <a href={urlForNode(file.nodeId)} download={file.name}>
          {file.name} 내려받기
        </a>
      </div>
    );
  }

  return (
    <div data-document-surface data-editor-mode={mode}>
      <ModeToggle file={file} mode={mode} onChange={change} disabled={isFrozen} />

      {shown === 'rejected' && (
        <div role="alert" data-save-rejected>
          <p>저장하지 못했습니다. 편집 내용은 그대로 남아 있습니다. 본문을 내려받아 보관할 수 있습니다.</p>
          {/* 본문을 되찾을 길을 함께 준다 (`FR-EDITOR-005` AC-2) — 알리기만
              하면 사용자는 화면을 닫는 순간 자기 글을 잃는다. */}
          <Button variant="secondary" aria-label="편집 중인 본문 내려받기" onClick={() => downloadBody(file.name, readBody())}>
            내려받기
          </Button>
        </div>
      )}

      {shown === 'conflict' && (
        <>
          <div role="alert" data-save-conflict>저장 중 원본이 바뀌어 병합이 필요합니다. 편집 내용은 유지됩니다.</div>
          {/* 양쪽을 나란히 두고 **고를 수 있게** 한다 (`FR-EDITOR-008`
              AC-3 · AC-4). 읽기 전용으로 두면 대조는 되는데 해소가 안 되고,
              해소가 안 되면 자동 저장이 영영 멈춘 채로 남는다. */}
          <MergeView
            label="병합"
            left={conflictBody ?? ''}
            right={readBody()}
            leftLabel="서버 내용"
            rightLabel="내 편집 내용"
            editorHandleRef={mergeHandle}
            onResolve={(merged) => {
              if (!ownerAllowsProtected()) return;
              lastBody.current = merged;
              autosave.resolve(merged);
            }}
          />
        </>
      )}

      <div
        role="region"
        aria-label={MODE_LABEL[mode]}
        data-node={file.nodeId}
        data-document-body
        onCompositionStartCapture={compositionStarted}
        onCompositionEndCapture={compositionEnded}
      >
        {documentText === undefined ? null : mode === 'source' ? (
          // 소스는 **원문 그대로**다 — 마크다운 편집기를 쓰면 그 편집기가
          // 기호를 숨기므로 소스가 아니게 된다. 읽기 전용도 아니다:
          // 표 구분선이나 각주 정의를 손보려면 여기가 유일한 자리다
          // (`FR-EDITOR-003` AC-2).
          <textarea
            ref={sourceHandle}
            aria-label="원문"
            data-source-editor
            defaultValue={documentText}
            readOnly={isFrozen}
            onChange={(event) => bodyChanged(event.target.value)}
          />
        ) : (
          <AtomicCodeMirrorEditor
            // 모드가 바뀌면 새 인스턴스를 세운다 — 데코레이션 구성이 다르기
            // 때문이다. 넘기는 문서는 **마지막으로 꺼내 온 것**이라 그 사이
            // 편집이 살아남는다.
            key={mode}
            // **정체성은 노드와 채택 세대다** (`FR-EDITOR-009`).
            //
            // 이 값을 넘기지 않으면 편집기가 `markdownSource` 문자열을 자기
            // 정체성으로 삼고, 저장이 성공해 상위가 새 본문을 내려보낼 때마다
            // EditorView 를 destroy 하고 다시 만든다. 그러면 포커스가 빠지고
            // 이어 친 글자가 그대로 사라진다.
            //
            // 노드로만 고정해도 안 된다 — 남이 갈아 끼운 본문(새 버전 올리기,
            // `FR-SHELL-008` AC-2)을 편집기가 받지 못한다. 세대를 함께 담아
            // **아는 판본이면 그대로, 모르는 판본이면 다시** 세운다.
            documentId={`${file.nodeId}:${adopted.current}`}
            markdownSource={documentText}
            extensions={extensions}
            editorHandleRef={editorHandle}
            readOnly={mode === 'read' || isFrozen}
            onMarkdownChange={(next: string) => {
              // 본문을 상태에 올리지 않고 **ref 한 곳**만 갱신한다
              // (`CON-ARCH-006` AC-1) — 올리면 정본이 둘이 된다. 두 ref 로
              // 나눠 들면 그중 하나만 갱신되는 자리가 생기고, 그 자리가
              // 위에서 말한 데이터 손실이었다.
              if (mode !== 'read') bodyChanged(next);
            }}
          />
        )}
      </div>
    </div>
  );
}

function ImageSurface({ nodeId, name }: { nodeId: string; name: string }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const image = useRef<HTMLImageElement>(null);
  const resource = urlForNode(nodeId);

  useEffect(() => {
    setState('loading');
    const current = image.current;
    if (current?.complete && current.naturalWidth > 0) setState('loaded');
  }, [nodeId, resource, attempt]);

  return (
    <div role="region" aria-label="이미지 미리보기" aria-busy={state === 'loading' ? 'true' : undefined} data-image-preview data-image-state={state}>
      {state === 'loading' ? <LoadingState label="이미지를 불러오는 중입니다." /> : null}
      {state === 'error' ? (
        <ErrorState label="이미지 오류" title="이미지를 표시할 수 없습니다." onRetry={() => {
          setState('loading');
          setAttempt((value) => value + 1);
        }} />
      ) : null}
      <img key={`${nodeId}:${attempt}`} ref={image} src={resource} alt={name} onLoad={() => setState('loaded')} onError={() => setState('error')} />
    </div>
  );
}
