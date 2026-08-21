-- 인증 — 비밀번호·세션·개인 액세스 토큰.
--
-- SEC-AUTH-001 · SEC-AUTH-002 · SEC-AUTH-005 · SEC-AUTH-006.

-- 비밀번호 해시는 주체 행에 붙인다.
--
-- 별도 테이블로 빼지 않는 이유는 계정과 자격증명이 1:1 이고 함께 태어나
-- 함께 사라지기 때문이다 — 나누면 해시 없는 계정과 주인 없는 해시가
-- 생길 자리가 만들어진다.
--
-- 그룹에는 비밀번호가 없으므로 NULL 을 허용한다. 사용자에게 반드시 있어야
-- 한다는 규칙은 스키마가 아니라 생성 경로가 지킨다 — CHECK 로 표현하려면
-- kind 와 묶어야 하는데, 그러면 설치 마법사가 계정을 만들기 전에 비밀번호를
-- 정해야 하는 순서 제약이 생긴다.
ALTER TABLE principal ADD COLUMN password_hash TEXT;

-- 세션 — **누구인가만 담는다** (SEC-AUTH-002 AC-1).
--
-- 권한·그룹 멤버십·ACL 값을 담는 칸이 없다. 담으면 그것이 스냅샷이 되어
-- 권한 회수가 다음 요청에 반영되지 않고, 회수를 반영하려면 모든 세션을
-- 찾아 고쳐야 한다 — 그 순간 세션이 권한의 두 번째 정본이 된다.
--
-- 토큰은 **해시로** 저장한다. 평문을 두면 DB 유출이 곧 전 세션 탈취다.
-- 세션 토큰은 무작위 128비트라 사전 공격 대상이 아니므로 bcrypt 가 아니라
-- SHA-256 이면 족하다 — 비밀번호와 달리 추측 가능한 후보 공간이 없다.
CREATE TABLE session (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES principal (id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);

CREATE INDEX session_by_user ON session (user_id);

-- 개인 액세스 토큰 (SEC-AUTH-005 · SEC-AUTH-006).
--
-- 전역 API Key 를 담을 칸이 없다는 것이 그 폐기의 표현이다(AC-2) —
-- 모든 토큰이 소유자를 가리키므로 주인 없는 자격증명이 존재할 수 없다.
--
-- `token_hash` 는 세션과 같은 이유로 해시다. 평문은 발급 응답에 한 번
-- 실리고 어디에도 남지 않는다(AC-2).
--
-- `revoked_at` 은 폐기를 **행으로 지우지 않고** 표시한다. 지우면 감사가
-- 가리키는 대상이 사라진다.
CREATE TABLE personal_access_token (
  id            TEXT PRIMARY KEY,
  token_hash    TEXT NOT NULL UNIQUE,
  user_id       TEXT NOT NULL REFERENCES principal (id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  scope         TEXT NOT NULL CHECK (scope IN ('read-only', 'read-write')),
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  last_used_at  TEXT,
  revoked_at    TEXT
);

CREATE INDEX pat_by_user ON personal_access_token (user_id);

-- 인스턴스 설정 — 가입 모드가 여기 산다 (FR-AUTH-004 AC-4).
--
-- 키-값으로 두는 이유는 이 wave 가 실제로 저장해야 하는 설정이 하나뿐이고,
-- 칸을 미리 늘리면 쓰이지 않는 칸의 기본값이 규범처럼 읽히기 때문이다.
CREATE TABLE instance_setting (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
