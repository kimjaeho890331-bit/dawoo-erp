-- ============================================
-- 005_ai_events: AI 운영 신호 로그 (AI 검토 백오피스용)
--   ai_events : 확인카드 노출/등록/취소 + 피드백(👍👎) 이벤트.
--   → 도구별 등록·취소율, 만족도, 검토 큐의 데이터 소스.
-- 실행: Supabase Studio > SQL Editor 에서 적용
-- 미적용이어도 채팅/검토는 graceful (로그만 비활성).
-- ============================================

CREATE TABLE IF NOT EXISTS ai_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  session_id UUID,                  -- chat_sessions.id (FK 생략 — graceful)
  kind TEXT NOT NULL,               -- confirm_shown | confirm_approved | confirm_cancelled | feedback_up | feedback_down
  tool TEXT,                        -- 관련 도구 (confirm_*); feedback는 null
  detail TEXT,                      -- 자유 메모 (취소 사유 등)
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE ai_events IS 'AI 비서 운영 신호 — 확인카드 결정/피드백. AI 검토 대시보드 소스';

CREATE INDEX IF NOT EXISTS idx_ai_events_kind ON ai_events(kind);
CREATE INDEX IF NOT EXISTS idx_ai_events_created ON ai_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_events_tool ON ai_events(tool);

-- RLS (API Route는 service_role 우회 — 프론트 직접 접근 보호용)
ALTER TABLE ai_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_events_select" ON ai_events;
DROP POLICY IF EXISTS "ai_events_insert" ON ai_events;
CREATE POLICY "ai_events_select" ON ai_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_events_insert" ON ai_events FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================
-- 롤백
-- ============================================
-- DROP TABLE IF EXISTS ai_events;
