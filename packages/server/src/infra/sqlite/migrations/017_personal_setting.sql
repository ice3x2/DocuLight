-- 개인 설정 (DR-SHELL-002).
--
-- **인스턴스 설정 표(`instance_setting`)와 다른 표다.** 그쪽은 전역 평면
-- 맵이라 거기에 개인 키를 얹으면 전 사용자가 한 값을 공유한다 — 한 사람이
-- 테마를 바꾸면 모두의 테마가 바뀌고, 그 사실은 두 사람이 동시에 쓸 때만
-- 드러난다.
--
-- 주체와 항목이 함께 기본키다. 같은 항목을 다시 쓰면 줄이 하나여야 하며,
-- 두 줄이 되면 읽는 쪽이 어느 것을 볼지 rowid 순서에 맡기게 된다.
--
-- **주체에 외래키를 걸지 않는다.** 계정은 삭제되지 않고 `suspended` 로만
-- 관리되므로(CON-PRINCIPAL-003) 고아 행이 생기는 경로가 없고, 걸어 두면
-- 설치 직후 주체가 서기 전에 기본값을 읽는 경로가 막힌다.
CREATE TABLE personal_setting (
  principal_id TEXT NOT NULL,
  key          TEXT NOT NULL,
  value        TEXT NOT NULL,
  PRIMARY KEY (principal_id, key)
);
