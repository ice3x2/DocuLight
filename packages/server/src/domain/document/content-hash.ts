import { createHash } from 'node:crypto';

/**
 * 본문의 내용 해시 (`FR-STORAGE-002`).
 *
 * 충돌 판정의 근거가 **내용**인 이유는 mtime 이 내용과 무관하게 움직이기
 * 때문이다 — 백업 도구가 파일을 만지거나 동기화가 타임스탬프를 밀면
 * 아무도 고치지 않은 문서에 거짓 충돌이 난다. 반대로 내용이 같으면
 * 두 사람이 같은 글자를 쳤다는 뜻이고, 그것은 충돌이 아니다.
 */
export function contentHash(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}
