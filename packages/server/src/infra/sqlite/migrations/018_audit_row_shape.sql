-- 감사 행의 스키마 정본을 `R140-e` 의 열한 칸으로 맞춘다.
--
-- 앞선 마이그레이션(002·005·009)은 각자 필요한 만큼만 열면서 「전체 스키마는
-- 뒤 wave 가 확정한다」고 적어 두었다. 그 wave 가 여기다.
--
-- 네 칸이 새로 든다 — 이전값·이후값·상대 노드·대상 역할.
--
-- `상대 노드` 는 2-노드 조작을 위한 자리이고 그 조작은 **복사 하나뿐**이다
-- (`DR-AUDIT-003`). 이동·삭제·복구는 노드 ID 를 보존하므로 1-노드 조작이고
-- 위치 변화는 이전값·이후값 두 칸이 담는다.
--
-- `대상 역할` 은 **이 행의 대상**이 원본인지 사본인지를 담는다 — 상대편의
-- 역할이 아니다 (`DR-AUDIT-002` AC-4). 상대 노드가 비면 함께 빈다 (AC-5).
--
-- 외래키를 걸지 않는다. 감사 행은 대상 노드보다 오래 산다 — 영구 삭제는
-- 노드 행을 하드 삭제하는데, 그때 감사 행이 함께 사라지면 「그 노드가
-- 지워졌다」는 기록 자체가 지워진다.
ALTER TABLE audit_log ADD COLUMN before_value TEXT;
ALTER TABLE audit_log ADD COLUMN after_value TEXT;
ALTER TABLE audit_log ADD COLUMN counterpart_node_id TEXT;
ALTER TABLE audit_log ADD COLUMN target_role TEXT
  CHECK (target_role IN ('origin', 'copy'));
