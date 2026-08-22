import { useState } from 'react';

import { DocumentArea } from '../../src/document/DocumentArea.js';
import type { TabState } from '../../src/document/tab-state.js';

type Props = Omit<Parameters<typeof DocumentArea>[0], 'state' | 'onState'>;

/**
 * 탭 상태를 대신 들어 주는 시험용 껍데기.
 *
 * `DocumentArea` 는 탭 상태를 바깥이 소유하도록 만들어졌다 — 안에서 복사해
 * 들면 정본이 둘이 되고, 닫기·전환이 바깥에 닿지 않는다. 그 소유자를
 * 시험마다 손으로 세우면 그 조립이 시험 파일마다 갈리므로 여기 한 번 둔다.
 */
export function ControlledDocumentArea({ initial, ...rest }: Props & { initial: TabState }) {
  const [state, setState] = useState<TabState>(initial);

  return <DocumentArea state={state} onState={setState} {...rest} />;
}
