/**
 * 시험 환경에 **측정**을 붙인다.
 *
 * `react-arborist` 와 `@tanstack/react-virtual` 은 창 크기를 재서 그릴
 * 줄을 정한다. happy-dom 은 레이아웃을 하지 않아 그 값이 전부 0 이고,
 * 그러면 두 부품이 아무 줄도 그리지 않는다 — 「비어 있다」와 구별되지
 * 않으므로 시험이 제품을 관측하지 못한다.
 *
 * 여기서 크기를 **주는 것**이 시험을 느슨하게 만드는 것과 다른 이유는,
 * 재는 대상이 여전히 제품의 렌더 결과이기 때문이다. 브라우저가 하는 일을
 * 대신할 뿐 제품의 판단을 대신하지 않는다.
 */
const VIEWPORT = { width: 800, height: 640 };

class StubResizeObserver {
  constructor(private readonly notify: ResizeObserverCallback) {}

  observe(target: Element): void {
    this.notify(
      [{ target, contentRect: { ...VIEWPORT, top: 0, left: 0, bottom: VIEWPORT.height, right: VIEWPORT.width, x: 0, y: 0, toJSON: () => ({}) } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }

  unobserve(): void {}
  disconnect(): void {}
}

if (globalThis.ResizeObserver === undefined) {
  globalThis.ResizeObserver = StubResizeObserver as unknown as typeof ResizeObserver;
}

for (const [name, value] of [
  ['offsetWidth', VIEWPORT.width],
  ['offsetHeight', VIEWPORT.height],
  ['clientWidth', VIEWPORT.width],
  ['clientHeight', VIEWPORT.height],
] as const) {
  Object.defineProperty(HTMLElement.prototype, name, { configurable: true, value });
}

Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
  configurable: true,
  value: () => ({
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    top: 0,
    left: 0,
    bottom: VIEWPORT.height,
    right: VIEWPORT.width,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }),
});
