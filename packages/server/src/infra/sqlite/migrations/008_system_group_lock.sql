-- 시스템 그룹 잠금과 멤버 종류 고정을 **저장소가** 지킨다.
--
-- CON-PRINCIPAL-002 · DR-PRINCIPAL-002 AC-2.
--
-- `006` 이 「멤버는 사용자만」에 대해 스스로 적은 원칙 — 앱 계층 검사만으로는
-- 「칸이 없다」가 아니라 「지금은 아무도 안 쓴다」에 그친다 — 이 같은 파일의
-- 시스템 그룹에는 적용되지 않았다. 그 결과 `removeGroup('system-superuser')`
-- 한 줄로 슈퍼유저 판정의 정본이 사라졌다(`DR-PRINCIPAL-001`).

-- 시스템 그룹은 삭제되지 않는다 (CON-PRINCIPAL-002 AC-1 · AC-2).
--
-- 슈퍼유저 그룹이 사라지면 그 멤버십이 CASCADE 로 함께 지워져 인스턴스에
-- 슈퍼유저가 0명이 되고, default 그룹이 사라지면 모든 사용자가 갖고 있던
-- 기본 권한이 한 번에 없어진다. 둘 다 되돌릴 방법이 없다.
CREATE TRIGGER principal_system_group_no_delete
BEFORE DELETE ON principal
WHEN OLD.id IN ('system-superuser', 'system-default')
BEGIN
  SELECT RAISE(ABORT, 'system groups cannot be deleted');
END;

-- 시스템 그룹은 개명되지 않는다 (AC-3).
--
-- 이름이 아니라 **참조**를 지키는 규칙이다. 판정 코드와 설치 마법사는 이
-- 둘을 ID 로 가리키지만, 이름이 바뀌면 화면과 감사 로그가 가리키는 대상이
-- 갈린다. `status` 같은 다른 칸의 갱신은 막지 않는다 — 막을 이유가 없는
-- 것까지 막으면 그것대로 다른 문제가 된다.
CREATE TRIGGER principal_system_group_no_rename
BEFORE UPDATE OF name ON principal
WHEN OLD.id IN ('system-superuser', 'system-default') AND NEW.name IS NOT OLD.name
BEGIN
  SELECT RAISE(ABORT, 'system groups cannot be renamed');
END;

-- 멤버인 사용자를 그룹으로 뒤집을 수 없다 (DR-PRINCIPAL-002 AC-2).
--
-- `006` 의 트리거 둘은 `group_member` 에 **넣는** 시점만 본다. 사용자로
-- 넣은 뒤 그 주체의 `kind` 를 바꾸면 트리거를 하나도 거치지 않고 중첩이
-- 성립한다 — 「그룹이 다른 그룹을 멤버로 갖는 구조」가 옆문으로 들어온다.
--
-- 아무 그룹에도 들지 않은 사용자의 kind 변경은 막지 않는다. 그 경우
-- 중첩이 생길 자리가 없다.
CREATE TRIGGER principal_member_kind_locked
BEFORE UPDATE OF kind ON principal
WHEN NEW.kind IS NOT OLD.kind
BEGIN
  SELECT RAISE(ABORT, 'a group member must stay a user')
  WHERE EXISTS (SELECT 1 FROM group_member WHERE user_id = OLD.id);
END;
