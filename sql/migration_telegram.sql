-- =============================================
-- 텔레그램 봇 통합 마이그레이션 (안전 버전)
-- 실행: Supabase SQL Editor에 전체 복사 → Run
-- =============================================
-- 이전 실패한 마이그레이션으로 partial 상태일 수 있으므로
-- 문제가 되는 신규 테이블을 먼저 DROP 후 재생성
-- (chat_messages, notifications_log는 신규 테이블이라 데이터 손실 없음)

BEGIN;

-- 0. 기존 partial 테이블 정리 (데이터 없는 신규 테이블만)
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS notifications_log CASCADE;

-- 1. staff 테이블에 텔레그램 컬럼 추가
ALTER TABLE staff ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS telegram_linked_at TIMESTAMPTZ;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS notify_telegram BOOLEAN DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_staff_telegram_chat_id ON staff(telegram_chat_id);

-- 2. 웹/텔레그램 통합 대화 저장소 (AI 비서 동기화)
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES staff(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('web', 'telegram')),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_chat_messages_staff ON chat_messages(staff_id, created_at DESC);
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_messages_all" ON chat_messages FOR ALL USING (true) WITH CHECK (true);

-- 3. 알림 발송 이력 (중복 방지 + 감사)
CREATE TABLE notifications_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'telegram',
  trigger TEXT NOT NULL,
  reference_date DATE,
  reference_id TEXT,
  message_preview TEXT,
  telegram_message_id TEXT,
  sent_at TIMESTAMPTZ DEFAULT now(),
  success BOOLEAN DEFAULT true,
  error_message TEXT
);
CREATE INDEX idx_notif_staff_date ON notifications_log(staff_id, reference_date, trigger);
CREATE UNIQUE INDEX uniq_notif_daily
  ON notifications_log(staff_id, trigger, reference_date)
  WHERE trigger IN ('morning_brief', 'afternoon_remind', 'evening_recap');
CREATE UNIQUE INDEX uniq_notif_schedule_imminent
  ON notifications_log(staff_id, trigger, reference_id)
  WHERE trigger = 'schedule_imminent';

ALTER TABLE notifications_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_log_all" ON notifications_log FOR ALL USING (true) WITH CHECK (true);

COMMIT;

-- 완료 확인
SELECT 'chat_messages' AS table_name, COUNT(*) AS rows FROM chat_messages
UNION ALL
SELECT 'notifications_log', COUNT(*) FROM notifications_log
UNION ALL
SELECT 'staff (telegram_chat_id exists)', COUNT(*) FROM staff WHERE telegram_chat_id IS NULL OR telegram_chat_id IS NOT NULL;
