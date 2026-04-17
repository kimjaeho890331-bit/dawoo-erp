-- =============================================
-- 텔레그램 그룹 채팅 지원 마이그레이션
-- staff 테이블에 telegram_user_id 컬럼 추가
-- (그룹 채팅에서 from.id로 직원 식별용)
-- 실행: Supabase SQL Editor에 전체 복사 → Run
-- =============================================

BEGIN;

-- telegram_user_id: 텔레그램 사용자 고유 ID (chat_id와 다름)
-- DM에서는 chat_id == user_id이지만,
-- 그룹 채팅에서는 chat_id가 그룹 ID이므로 user_id로 개인 식별 필요
ALTER TABLE staff ADD COLUMN IF NOT EXISTS telegram_user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_staff_telegram_user_id ON staff(telegram_user_id);

COMMIT;

-- 확인
SELECT id, name, telegram_chat_id, telegram_user_id FROM staff WHERE telegram_chat_id IS NOT NULL;
