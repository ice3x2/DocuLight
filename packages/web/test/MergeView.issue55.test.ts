import { describe, expect, it } from 'vitest';

import { diffCueText } from '../src/document/MergeView';

describe('IR-EDITOR-002 merge non-color cues', () => {
  it('labels both changed sides without placing the cue in document text', () => {
    expect(diffCueText('a')).toBe('− 삭제');
    expect(diffCueText('b')).toBe('+ 추가');
  });
});
