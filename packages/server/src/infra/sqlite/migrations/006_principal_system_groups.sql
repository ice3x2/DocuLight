-- 시스템 그룹 두 개와 「멤버는 사용자만」 불변식.
--
-- CON-PRINCIPAL-002 · DR-PRINCIPAL-002.

-- 슈퍼유저 그룹 — 인스턴스 전역 권한을 표현하는 유일한 자리
-- (CON-PRINCIPAL-001 AC-1). 멤버가 0명인 상태가 정상 초기값이며, 설치
-- 마법사가 그 상태를 판정 조건으로 쓴다(SEC-AUTH-010, 뒤 wave).
--
-- default 그룹 — 모든 사용자가 속한다. 멤버십 행은 만들지 않는다: 소속이
-- 데이터면 빠질 수 있고, 빠진 사용자는 설치 마법사가 default 에 준 권한을
-- 받지 못한 채 조용히 남는다. 「모든 사용자」는 불변식이므로 코드가
-- 상수로 얹는다(domain/principal/subject.ts).
--
-- 상태가 active 인 이유는 그룹에 가입 승인 흐름이 없기 때문이다 — pending
-- 으로 두면 뒤 wave 의 승인 화면이 시스템 그룹을 승인 대상으로 집어 든다.
INSERT INTO principal (id, kind, name, status) VALUES
  ('system-superuser', 'group', 'superuser', 'active'),
  ('system-default',   'group', 'default',   'active');

-- 그룹은 사용자만을 멤버로 가지며 중첩되지 않는다(DR-PRINCIPAL-002 AC-2).
--
-- 앱 계층 검사만으로는 부족하다 — 그것은 「칸이 없다」가 아니라 「지금은
-- 아무도 안 쓴다」이고, 저장소를 직접 만지는 두 번째 경로가 생기는 순간
-- 무너진다. group_member.user_id 가 principal 을 가리키므로 칸 자체는
-- 그룹을 담을 수 있고, 그래서 담기지 못하게 하는 것은 트리거의 몫이다.
--
-- UPDATE 도 함께 막는다. INSERT 만 막으면 사용자로 넣은 뒤 그룹으로
-- 바꾸는 경로가 남는다.
CREATE TRIGGER group_member_insert_user_only
BEFORE INSERT ON group_member
BEGIN
  SELECT RAISE(ABORT, 'group_member.user_id must reference a user')
  WHERE (SELECT kind FROM principal WHERE id = NEW.user_id) IS NOT 'user';
END;

CREATE TRIGGER group_member_update_user_only
BEFORE UPDATE ON group_member
BEGIN
  SELECT RAISE(ABORT, 'group_member.user_id must reference a user')
  WHERE (SELECT kind FROM principal WHERE id = NEW.user_id) IS NOT 'user';
END;
