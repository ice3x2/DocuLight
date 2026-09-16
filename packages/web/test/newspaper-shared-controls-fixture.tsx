import { createRoot } from 'react-dom/client';
import { useState } from 'react';

import { Button, Checkbox, Field, Input, Radio, Select } from '../src/components/ui/index.js';
import '../src/styles/index.css';

function Fixture() {
  const [submits, setSubmits] = useState(0);
  return (
    <main data-slot="document" style={{ padding: 24, width: 480, maxWidth: 'calc(100vw - 48px)' }}>
      <form onSubmit={(event) => { event.preventDefault(); setSubmits((value) => value + 1); }}>
        <div data-slot="field-stack">
          <Field label="문서 이름" description="긴 한글 설명은 좁은 화면에서도 자연스럽게 여러 줄로 이어져야 합니다.">
            <Input id="shared-name" defaultValue="신문지 문서" />
          </Field>
          <Field label="보기 방식">
            <Select id="shared-select" defaultValue="paper">
              <option value="paper">신문지</option>
              <option value="plain">기본</option>
            </Select>
          </Field>
          <label data-slot="selection-control" htmlFor="shared-checkbox">
            <Checkbox id="shared-checkbox" defaultChecked /> 변경 알림 받기
          </label>
          <label data-slot="selection-control" htmlFor="shared-radio">
            <Radio id="shared-radio" name="theme" defaultChecked /> 신문지 테마
          </label>
          <Button id="loading-action" loading>저장 중</Button>
          <output id="submit-count">{submits}</output>
        </div>
      </form>
    </main>
  );
}

createRoot(document.getElementById('fixture-root')!).render(<Fixture />);
