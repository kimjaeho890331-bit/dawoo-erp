-- =============================================
-- tasks 테이블 마이그레이션 (내 할 일 / 내 시킨 일)
-- 실행: Supabase SQL Editor에 전체 복사 → Run
-- =============================================

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,                              -- 할 일 내용
  assigned_to UUID REFERENCES staff(id) ON DELETE SET NULL,  -- 수행자 (받은 사람)
  assigned_by UUID REFERENCES staff(id) ON DELETE SET NULL,  -- 지시자 (시킨 사람)
  deadline DATE,                                       -- 마감일
  done BOOLEAN DEFAULT false,                          -- 완료 여부
  done_at TIMESTAMPTZ,                                 -- 완료 시각
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,  -- 선택적 프로젝트 연결
  note TEXT,                                           -- 비고
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to) WHERE done = false;
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_by ON tasks(assigned_by) WHERE done = false;
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline) WHERE done = false;

-- RLS (개발 단계에서는 전체 허용)
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks_all" ON tasks FOR ALL USING (true) WITH CHECK (true);
