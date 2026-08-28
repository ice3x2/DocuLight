/**
 * 조각을 벡터로 옮기고 가까움을 잰다 (`FR-ARCH-001` AC-4).
 *
 * **신규 작성물이다.** 1.0 의 `smart_search` semantic 경로는 실제로 동작한
 * 적이 없으므로(`R21-a`) 옮겨 올 구현이 없고, 재현할 결과도 없다.
 *
 * 지금 선 것은 **문자 n-gram 기반 벡터**이며 학습된 임베딩이 아니다. 그
 * 사실을 여기 적어 두는 이유는, 「의미 검색」이라는 이름이 실제보다 넓게
 * 읽히기 쉽기 때문이다. 이 방식이 잡는 것은 표기가 겹치는 정도이지 뜻이
 * 통하는 정도가 아니다 — 「매출」과 「수익」은 여기서 가깝지 않다.
 *
 * 대신 외부 모델도 API 키도 없이 결정적으로 돌고, 한국어처럼 띄어쓰기가
 * 뜻의 경계와 어긋나는 언어에서도 어절을 쪼개 잡는다. 학습된 임베딩으로
 * 옮길 때는 이 파일의 `embed` 하나를 갈아 끼우면 되며, 조각을 불투명한
 * 문자열로 두는 벡터 인덱스 경계(`SEC-STORAGE-007`)가 그 교체를 열어 둔다.
 */

/** n-gram 의 길이. 둘이면 한국어의 두 글자 어근이 잡힌다. */
const GRAM = 2;

/** 벡터 하나 — 자질에서 무게로. 밀집 배열을 쓰지 않는 것은 차원이 열려 있어서다. */
export type Vector = ReadonlyMap<string, number>;

/**
 * 글자를 정규화한다. 대소문자와 공백·문장부호를 지운다.
 *
 * 부호를 남기면 같은 말이 문장 안 자리에 따라 다른 자질이 된다.
 */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

/** 조각을 벡터로. 같은 글자는 언제나 같은 벡터가 된다. */
export function embed(text: string): Vector {
  const flat = normalize(text);
  const counts = new Map<string, number>();

  for (let i = 0; i + GRAM <= flat.length; i += 1) {
    const gram = flat.slice(i, i + GRAM);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }

  // **길이로 나눈다.** 나누지 않으면 긴 문서가 무조건 가까워져, 순위가
  // 질의와의 관계가 아니라 문서 크기를 재게 된다.
  let norm = 0;
  for (const value of counts.values()) norm += value * value;
  if (norm === 0) return counts;

  const scale = 1 / Math.sqrt(norm);
  const unit = new Map<string, number>();
  for (const [gram, value] of counts) unit.set(gram, value * scale);
  return unit;
}

/**
 * 두 벡터의 가까움 — 코사인이다. 둘 다 단위 벡터이므로 내적으로 족하다.
 *
 * 짧은 쪽을 훑는다. 어느 쪽을 훑든 결과는 같고, 짧은 쪽이 싸다.
 */
export function similarity(a: Vector, b: Vector): number {
  const [short, long] = a.size <= b.size ? [a, b] : [b, a];

  let sum = 0;
  for (const [gram, value] of short) {
    const other = long.get(gram);
    if (other !== undefined) sum += value * other;
  }
  return sum;
}

/**
 * 본문을 색인 단위로 자른다.
 *
 * **헤딩 경계를 먼저 본다.** 고정 길이로 자르면 한 조각이 두 주제에 걸쳐
 * 어느 질의에도 어중간하게 가까워진다. 헤딩이 없거나 한 절이 너무 길면
 * 그때 길이로 자른다.
 */
export function chunk(body: string, maxChars = 800): string[] {
  const sections = body.split(/(?=^#{1,6}\s)/m).filter((one) => one.trim() !== '');
  const pieces: string[] = [];

  for (const section of sections.length === 0 ? [body] : sections) {
    const trimmed = section.trim();
    if (trimmed === '') continue;

    if (trimmed.length <= maxChars) {
      pieces.push(trimmed);
      continue;
    }
    for (let i = 0; i < trimmed.length; i += maxChars) {
      pieces.push(trimmed.slice(i, i + maxChars));
    }
  }

  return pieces;
}
