import { describe, expect, it } from 'vitest';

import {
  getCachedSize,
  isMermaidModuleLoaded,
  renderMermaid,
  setCachedSize,
} from '../src/core/mermaid-render';

const OK = '<svg width="120" height="80"></svg>';

describe('SDS-AC-4 · 렌더 실패를 예외가 아닌 값으로 돌려준다', () => {
  it('renderer 가 throw 해도 전파하지 않고 error 를 반환한다', async () => {
    const boom = () => {
      throw new Error('Parse error on line 1');
    };

    const result = await renderMermaid('!!! 잘못된 코드', 'id-1', boom);

    expect(result).toEqual({ error: expect.stringContaining('Parse error') });
  });

  it('renderer 가 reject 해도 전파하지 않는다', async () => {
    const reject = () => Promise.reject(new Error('render failed'));

    await expect(renderMermaid('x', 'id-2', reject)).resolves.toEqual({
      error: expect.stringContaining('render failed'),
    });
  });

  it('성공하면 svg 를 반환한다', async () => {
    const result = await renderMermaid('graph TD;', 'id-3', async () => OK);
    expect(result).toEqual({ svg: OK });
  });
});

describe('SDS-AC-5 · 렌더 크기를 캐시하여 마운트 후 증가를 막는다', () => {
  it('캐시가 비어 있으면 undefined 를 돌려준다', () => {
    expect(getCachedSize('처음 보는 코드')).toBeUndefined();
  });

  it('저장한 크기를 같은 코드로 다시 읽을 수 있다', () => {
    const code = 'graph LR; A-->B;';
    setCachedSize(code, { w: 120, h: 80 });

    expect(getCachedSize(code)).toEqual({ w: 120, h: 80 });
  });

  it('코드가 다르면 캐시를 공유하지 않는다', () => {
    setCachedSize('코드 A', { w: 10, h: 10 });
    expect(getCachedSize('코드 B')).toBeUndefined();
  });
});

describe('SDS-AC-6 · mermaid 모듈은 필요할 때만 적재한다', () => {
  it('렌더를 한 번도 요청하지 않으면 모듈을 적재하지 않는다', () => {
    expect(isMermaidModuleLoaded()).toBe(false);
  });

  it('주입된 renderer 로 렌더해도 mermaid 모듈은 적재되지 않는다', async () => {
    await renderMermaid('graph TD;', 'id-4', async () => OK);
    expect(isMermaidModuleLoaded()).toBe(false);
  });
});
