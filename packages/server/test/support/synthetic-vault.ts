import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * 실제 옵시디언 볼트가 갖는 성질을 갖춘 **합성 볼트**를 디스크에 만든다.
 *
 * 원장 §4 **수용 기준 1** 은 실제 볼트로 수동 검증하라고 정했고 그 회차는
 * 2026-08-24 에 있었다(md 1,315 · 비-md 133). 그 뒤로 다섯 회차가 지났지만
 * 같은 볼트로 다시 재려면 개인 데이터가 필요하다 — 그 데이터는 저장소에 없고,
 * 있어서도 안 된다.
 *
 * **그래서 볼트의 성질만 합성한다.** 실제 볼트를 다시 읽는 대신, 실제 볼트를
 * 넣었을 때 부딪히는 것들을 재현한다. 아래 여섯이 그것이며, 각각이 실제
 * 볼트에서 관측된 성질이다.
 *
 * | 성질 | 왜 이것인가 |
 * |---|---|
 * | NFD·NFC 혼재 | macOS 가 만든 이름은 NFD 다. 같은 볼트를 Windows 에서 열면 NFC 로 보이고, 두 형태를 같게 다루지 않으면 같은 파일이 둘로 선다 |
 * | 대소문자만 다른 이름 | Windows·macOS 는 대소문자를 구분하지 않고 Linux 는 구분한다. 볼트가 기계를 옮겨 다니면 이 자리에서 충돌한다 |
 * | `.obsidian` 디렉토리 | 모든 볼트에 있다. 사용자의 문서가 아니므로 트리에 서면 안 된다 |
 * | 비-md 파일 | 실제 볼트의 133개가 그것이었다. 트리에는 서되 본문으로 읽히면 안 된다 |
 * | 깊은 중첩 | 주제별로 나눈 볼트는 예닐곱 겹이 흔하다 |
 * | 규모 | 1,300개가 실측값이다. 한 건씩 삽입하면 그 수에서 드러난다 |
 *
 * **개인 데이터에 기대지 않는다.** 이름과 본문은 전부 이 함수가 짓는다.
 */
export interface SyntheticVault {
  /** NFC 로 적은 이름 (`문서.md`). 같은 글자를 NFD 로 적은 짝이 함께 있다. */
  nfcName: string;
  /** NFD 로 적은 이름. 눈으로는 위와 같아 보인다. */
  nfdName: string;
  /** 대소문자만 다른 두 이름. */
  upperName: string;
  lowerName: string;
  /** 볼트 설정 디렉토리 안의 파일 — 트리에 서면 안 된다. */
  obsidianPath: string;
  /** md 가 아닌 파일들. */
  nonMarkdown: readonly string[];
  /** 가장 깊은 자리의 문서. */
  deepPath: string;
  /** 규모를 위해 만든 문서들의 경로. */
  bulk: readonly string[];
  /**
   * 트리에 서야 하는 파일의 총수 — `.obsidian` 아래는 빼고 센다.
   *
   * **디스크를 실제로 세어 정한다.** 파일 시스템마다 결과가 다르기 때문이다:
   * Windows·macOS 는 대소문자를 구분하지 않아 `Note.md` 와 `note.md` 가 하나로
   * 합쳐지고, macOS 는 이름을 NFD 로 정규화해 NFC·NFD 짝도 하나가 된다.
   * 상수로 적으면 이 시험이 기계를 옮길 때마다 깨진다.
   */
  visibleCount: number;
  /** 이 파일 시스템이 대소문자를 구분하는가 — 실측값이다. */
  caseSensitive: boolean;
  /** 이 파일 시스템이 이름의 유니코드 정규화 형태를 보존하는가 — 실측값이다. */
  keepsNormalization: boolean;
}

/** `root` 아래 모든 파일의 상대 경로. `.obsidian` 은 빼고 센다. */
async function 보이는파일들(root: string, 아래 = ''): Promise<string[]> {
  const 모은것: string[] = [];
  for (const entry of await readdir(join(root, 아래), { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const 상대 = 아래 === '' ? entry.name : `${아래}/${entry.name}`;
    if (entry.isDirectory()) 모은것.push(...(await 보이는파일들(root, 상대)));
    else 모은것.push(상대);
  }
  return 모은것;
}

/** 눈으로 같아 보이는 두 이름. 앞은 NFC, 뒤는 NFD 다. */
const 한글 = '가나다';

/**
 * 합성 볼트를 `root` 아래에 만든다.
 *
 * `bulkCount` 는 규모 축의 문서 수다. 기본값을 작게 둔 것은 이 함수를 쓰는
 * 시험 대부분이 규모가 아니라 **다른** 축을 재기 때문이다 — 규모를 재는
 * 시험만 그 값을 올린다.
 */
export async function makeSyntheticVault(
  root: string,
  { bulkCount = 20 }: { bulkCount?: number } = {},
): Promise<SyntheticVault> {
  const nfcName = `${한글.normalize('NFC')}.md`;
  const nfdName = `${한글.normalize('NFD')}.md`;
  const upperName = 'Note.md';
  const lowerName = 'note.md';

  // 깊은 중첩 — 일곱 겹.
  const deepDir = join('연구', '2026', '분기1', '주제', '세부', '더', '깊이');
  const deepPath = join(deepDir, '가장깊은문서.md');

  const nonMarkdown = ['자료/그림.png', '자료/보고서.pdf', '자료/그래프.canvas'];
  const obsidianPath = '.obsidian/workspace.json';

  const bulk = Array.from({ length: bulkCount }, (_, i) => `대량/문서-${String(i).padStart(4, '0')}.md`);

  const 전부 = [
    { path: nfcName, body: '# NFC 이름\n' },
    { path: nfdName, body: '# NFD 이름\n' },
    { path: upperName, body: '# 대문자\n' },
    { path: lowerName, body: '# 소문자\n' },
    { path: deepPath, body: '# 깊은 자리\n' },
    { path: obsidianPath, body: '{"main":{}}' },
    ...nonMarkdown.map((path) => ({ path, body: 'not markdown' })),
    ...bulk.map((path) => ({ path, body: `# ${path}\n` })),
  ];

  for (const one of 전부) {
    const full = join(root, one.path);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, one.body, 'utf8');
  }

  const 보이는것 = await 보이는파일들(root);
  const 뿌리이름 = (await readdir(root)).filter((one) => !one.startsWith('.'));

  return {
    nfcName,
    nfdName,
    upperName,
    lowerName,
    obsidianPath,
    nonMarkdown,
    deepPath,
    bulk,
    visibleCount: 보이는것.length,
    // 둘 다 남았으면 구분한다. 하나로 합쳐졌으면 구분하지 않는다.
    caseSensitive: 뿌리이름.includes(upperName) && 뿌리이름.includes(lowerName),
    // NFC 와 NFD 가 각각 남았으면 형태를 보존한다. macOS 는 둘을 NFD 하나로 합친다.
    keepsNormalization: 뿌리이름.includes(nfcName) && 뿌리이름.includes(nfdName),
  };
}
