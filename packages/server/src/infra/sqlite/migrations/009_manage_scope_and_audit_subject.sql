-- 관리 항목의 대상 제한을 저장소가 지키고, 감사에 「누구에게 무엇을」을 더한다.
--
-- SEC-WORKSPACE-002 · DR-ACL-001 AC-4 · SEC-ACL-010 AC-3.

-- 관리는 **실재하는 워크스페이스**에만 걸린다.
--
-- 앞선 방벽은 저장소 메서드 안의 「노드 목록에 없으면 워크스페이스」라는
-- 음성 판정이었다. 그것은 지운 ID·오타·앞으로 생길 다른 종류를 전부
-- 통과시키고, 저장소를 직접 만지는 경로는 아예 지나간다. 006·008 이
-- 각각 group_member 와 principal 에 대해 채택한 것과 같은 이유·같은
-- 수단을 여기에도 둔다 — 그래야 판정 쪽의 강등(effective-permission.ts)이
-- 「혹시 모를 파손 데이터에 대한 대비」로 남고 정상 경로에서 발화하지 않는다.
--
-- acl_entry.node_id 에 외래키를 걸 수 없는 이유는 그 칸이 노드 ID 와
-- 워크스페이스 ID 를 함께 받기 때문이다(001_init.sql). 그래서 종류별
-- 제약을 트리거로 표현한다.
CREATE TRIGGER acl_entry_manage_workspace_only_insert
BEFORE INSERT ON acl_entry
WHEN NEW.level = 'admin'
BEGIN
  SELECT RAISE(ABORT, 'manage may only be granted on a workspace')
  WHERE NOT EXISTS (SELECT 1 FROM workspace WHERE id = NEW.node_id);
END;

-- 레벨을 나중에 올리는 경로도 같은 제약을 받는다. INSERT 만 막으면
-- edit 로 넣은 뒤 admin 으로 바꾸는 옆문이 남는다.
CREATE TRIGGER acl_entry_manage_workspace_only_update
BEFORE UPDATE OF level ON acl_entry
WHEN NEW.level = 'admin'
BEGIN
  SELECT RAISE(ABORT, 'manage may only be granted on a workspace')
  WHERE NOT EXISTS (SELECT 1 FROM workspace WHERE id = NEW.node_id);
END;

-- 감사 행에 「누구에게」와 「무엇을」을 더한다 (SEC-ACL-010 AC-3).
--
-- 002·005 와 같은 원칙이다 — 전체 스키마는 R84 계열이 소유하며 뒤 wave 가
-- 확정한다. 여기서는 wave-2 가 **실제로 적어야 하는 사실**만큼만 연다.
--
-- 이 둘이 없으면 `부모 권한 가져오기` 한 번이 만든 여러 부여의 감사 행이
-- 서로 구별되지 않는다 — operation·actor·node_id 가 전부 같아서 같은 행이
-- 여러 번 찍힌 것과 다르지 않고, 「전파를 막지 않는 대신 추적한다」는
-- 이 모델의 거래를 그 기록으로는 실행할 수 없다.
--
-- 주체 축은 `principal` 을 가리키지만 외래키를 걸지 않는다. 감사 행은
-- 기록된 뒤 수정·삭제되지 않아야 하는데(R84-a), FK 가 있으면 주체 삭제가
-- 그 행을 함께 지우거나 삭제 자체를 막는다. 계정은 삭제되지 않으므로
-- (CON-PRINCIPAL-003) 실무상 끊길 일이 없고, 그룹 삭제는 기록을
-- 남겨야 할 사건이지 지워야 할 사건이 아니다.
ALTER TABLE audit_log ADD COLUMN subject_id TEXT;
ALTER TABLE audit_log ADD COLUMN level TEXT;
