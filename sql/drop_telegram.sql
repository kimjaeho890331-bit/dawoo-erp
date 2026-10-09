-- =============================================
-- 텔레그램 흔적 정리 (선택, 수동 실행 전용)
-- 텔레그램 봇 코드는 2026-10에 삭제했다. 아래는 DB에 남은 텔레그램 칸·표를 지우는 SQL이다.
-- 지금 남아 있어도 화면·기능에는 영향이 없다. 지우고 싶을 때만 대표 확인 후
-- Supabase SQL Editor에서 실행한다. 지운 값(연결된 chat id 등)은 되돌릴 수 없다.
-- =============================================

BEGIN;

-- 직원 표의 텔레그램 칸
DROP INDEX IF EXISTS idx_staff_telegram_chat_id;
DROP INDEX IF EXISTS idx_staff_telegram_user_id;
ALTER TABLE staff DROP COLUMN IF EXISTS telegram_chat_id;
ALTER TABLE staff DROP COLUMN IF EXISTS telegram_linked_at;
ALTER TABLE staff DROP COLUMN IF EXISTS telegram_user_id;
ALTER TABLE staff DROP COLUMN IF EXISTS notify_telegram;
ALTER TABLE staff DROP COLUMN IF EXISTS telegram_id;

-- 텔레그램 봇 연결 코드 표와 텔레그램 알림 기록 표
-- (staff_invitations는 /onboard 화면과 무관하다 — 그 화면은 INVITE_CODE 환경변수를 쓴다)
DROP TABLE IF EXISTS staff_invitations;
DROP TABLE IF EXISTS notifications_log;

COMMIT;

-- chat_messages.channel의 'telegram' 값은 지난 대화 기록이라 그대로 둔다.
