-- ================================================
-- cowork_tasks 테이블
-- 용도: ERP ↔ Cowork 간 비동기 작업 큐
--   - ERP: 건축물대장 발급 등 task를 INSERT (status=pending)
--   - Cowork: polling으로 pending task 읽어서 처리
--   - Cowork: 완료 시 status=done으로 업데이트
--   - ERP: realtime 구독으로 status 변화 감지
-- ================================================

CREATE TABLE IF NOT EXISTS cowork_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL,
    -- 'issue_certificate' (건축물대장 표제부+전유부 통합 발급)
    -- 향후 확장: 'issue_owner', 'issue_land_register' 등
  payload JSONB DEFAULT '{}',
    -- 예: { "building_name": "...", "road_address": "...", "jibun_address": "...",
    --      "dong": "...", "ho": "...", "cert_types": ["표제부", "전유부"] }
  status TEXT NOT NULL DEFAULT 'pending',
    -- 'pending' → 'processing' → 'done' | 'failed'
  result_drive_file_id TEXT,
  result_drive_file_url TEXT,
  error_message TEXT,
  requested_by UUID REFERENCES staff(id),
    -- 누가 요청했는지
  processing_started_at TIMESTAMPTZ,
  done_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 조회 성능
CREATE INDEX IF NOT EXISTS idx_cowork_tasks_status_created
  ON cowork_tasks(status, created_at);
CREATE INDEX IF NOT EXISTS idx_cowork_tasks_project
  ON cowork_tasks(project_id);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_cowork_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cowork_tasks_updated_at ON cowork_tasks;
CREATE TRIGGER trg_cowork_tasks_updated_at
  BEFORE UPDATE ON cowork_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_cowork_tasks_updated_at();

-- Realtime publication에 추가 (UI 실시간 갱신용)
-- Supabase Dashboard → Database → Replication 에서 추가 필요할 수 있음
-- SQL로 강제:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'cowork_tasks'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE cowork_tasks';
  END IF;
END $$;

COMMENT ON TABLE cowork_tasks IS 'ERP ↔ Cowork 비동기 작업 큐';
COMMENT ON COLUMN cowork_tasks.task_type IS 'issue_certificate 등';
COMMENT ON COLUMN cowork_tasks.payload IS '작업별 필요 데이터 JSON';
COMMENT ON COLUMN cowork_tasks.status IS 'pending | processing | done | failed';
