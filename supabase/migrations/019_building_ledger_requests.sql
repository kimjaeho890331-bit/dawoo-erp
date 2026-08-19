-- 019_building_ledger_requests.sql
-- 건축물대장 발급 대기열. 직원이 접수대장(projects) 빌라를 넣고,
-- 세움터 에이전트가 5건씩 발급 후 issued로 표시하면 직원이 확인한다.
-- projects에는 컬럼을 추가하지 않는다. 기존 테이블 RLS는 변경하지 않는다.
-- 백필/주소 추정 없음.

-- 적용
CREATE TABLE IF NOT EXISTS building_ledger_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'issued', 'confirmed')),
  address_used TEXT,
  drive_folder_id TEXT,
  drive_folder_url TEXT,
  drive_file_id TEXT,
  drive_file_url TEXT,
  batch_key TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  requested_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  issued_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 신청·발급 중인 빌라는 한 건만. 확인(confirmed) 후에는 다시 신청할 수 있다.
CREATE UNIQUE INDEX IF NOT EXISTS building_ledger_requests_one_open_per_project
  ON building_ledger_requests (project_id)
  WHERE status IN ('requested', 'issued');

CREATE INDEX IF NOT EXISTS building_ledger_requests_status_requested_at_idx
  ON building_ledger_requests (status, requested_at);

COMMENT ON TABLE building_ledger_requests IS
  '건축물대장 발급 대기열. requested=세움터 대기, issued=파일 저장됨, confirmed=직원 확인.';
COMMENT ON COLUMN building_ledger_requests.address_used IS
  '신청 시점 road_address 또는 jibun_address 스냅샷. 없으면 NULL. 추정하지 않음.';
COMMENT ON COLUMN building_ledger_requests.batch_key IS
  '세움터가 5건 배치에 찍는 선택 키.';

ALTER TABLE building_ledger_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "building_ledger_requests_select" ON building_ledger_requests
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "building_ledger_requests_insert" ON building_ledger_requests
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "building_ledger_requests_update" ON building_ledger_requests
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "building_ledger_requests_delete" ON building_ledger_requests
  FOR DELETE TO authenticated USING (true);

-- 롤백 (필요 시 수동 실행)
-- DROP TABLE IF EXISTS building_ledger_requests;
