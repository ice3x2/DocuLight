import { cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 마이그레이션 SQL 을 빌드 산출물로 옮긴다.
 *
 * `tsc` 는 `.ts` 만 내보내므로 이 파일들이 빠진다. 빠진 채로 운영에 올리면
 * `runMigrations` 가 적용할 것을 하나도 찾지 못하고, 스키마 없는 DB 위에서
 * 첫 질의가 터진다 — 개발에서는 소스 트리를 그대로 읽으므로 **빌드해서
 * 띄웠을 때만** 드러나는 종류의 실패다.
 */
const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, '..', 'src', 'infra', 'sqlite', 'migrations');
const to = join(here, '..', 'dist', 'infra', 'sqlite', 'migrations');

await mkdir(to, { recursive: true });
await cp(from, to, { recursive: true });

console.log(`migrations copied to ${to}`);
