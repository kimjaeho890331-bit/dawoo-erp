-- ============================================
-- 004_ai_chat: AI 비서 대화 세션 + 메시지
--   chat_sessions : 대화 묶음 (이어보기 레일용). 직원별 여러 대화.
--   chat_messages : 기존 평면 메시지 테이블에 session_id/feedback/images 컬럼 보강.
-- 실행: Supabase Studio > SQL Editor 에서 적용
-- DROP POLICY IF EXISTS 적용 — 재실행 안전
-- 미적용 상태에서도 채팅은 동작(코드 graceful) — 레일/피드백만 비활성.
-- ============================================

-- === 1. chat_messages (기존 라이브 테이블 — 없으면 생성, 있으면 컬럼 보강) ===
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,  -- 발화 직원
  role TEXT NOT NULL,                                      -- user | assistant
  content TEXT NOT NULL DEFAULT '',
  channel TEXT NOT NULL DEFAULT 'web',                    -- web | telegram
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 보강 컬럼 (기존 테이블에 안전 추가)
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS session_id UUID;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS feedback TEXT;          -- up | down | null
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS images JSONB;           -- 첨부 이미지 메타

-- === 2. chat_sessions (대화 묶음 — 이어보기 레일) ===
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES staff(id) ON DELETE CASCADE,   -- 소유 직원
  title TEXT,                                             -- 첫 사용자 발화 (목록 제목)
  channel TEXT NOT NULL DEFAULT 'web',
  status TEXT NOT NULL DEFAULT 'active',                  -- active | closed(소프트삭제)
  flagged BOOLEAN NOT NULL DEFAULT false,                 -- 👎 피드백/부정 표현 자동 플래그
  flagged_reason TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_message_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE chat_sessions IS 'AI 비서 대화 묶음 — 직원별 이어보기 레일';

-- session_id FK (chat_sessions 생성 후 연결)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chat_messages_session_id_fkey'
  ) THEN
    ALTER TABLE chat_messages
      ADD CONSTRAINT chat_messages_session_id_fkey
      FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE;
  END IF;
END $$;

-- === 인덱스 ===
CREATE INDEX IF NOT EXISTS idx_chat_messages_staff ON chat_messages(staff_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_staff ON chat_sessions(staff_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_last ON chat_sessions(last_message_at DESC);

-- ============================================
-- RLS 정책 (API Route는 service_role로 우회 — 아래는 프론트 직접 접근 보호용)
--   읽기/쓰기 모두 인증된 직원 허용 (다우건설 단일 회사, 직원 5명)
-- ============================================

-- chat_sessions
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chat_sessions_select" ON chat_sessions;
DROP POLICY IF EXISTS "chat_sessions_insert" ON chat_sessions;
DROP POLICY IF EXISTS "chat_sessions_update" ON chat_sessions;
DROP POLICY IF EXISTS "chat_sessions_delete" ON chat_sessions;
CREATE POLICY "chat_sessions_select" ON chat_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "chat_sessions_insert" ON chat_sessions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "chat_sessions_update" ON chat_sessions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "chat_sessions_delete" ON chat_sessions FOR DELETE TO authenticated USING (true);

-- chat_messages
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chat_messages_select" ON chat_messages;
DROP POLICY IF EXISTS "chat_messages_insert" ON chat_messages;
DROP POLICY IF EXISTS "chat_messages_update" ON chat_messages;
DROP POLICY IF EXISTS "chat_messages_delete" ON chat_messages;
CREATE POLICY "chat_messages_select" ON chat_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "chat_messages_insert" ON chat_messages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "chat_messages_update" ON chat_messages FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "chat_messages_delete" ON chat_messages FOR DELETE TO authenticated USING (true);

-- ============================================
-- 롤백 (필요 시 Supabase Studio에서 수동 실행)
-- ============================================
-- ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_session_id_fkey;
-- ALTER TABLE chat_messages DROP COLUMN IF EXISTS session_id;
-- ALTER TABLE chat_messages DROP COLUMN IF EXISTS feedback;
-- ALTER TABLE chat_messages DROP COLUMN IF EXISTS images;
-- DROP TABLE IF EXISTS chat_sessions;
