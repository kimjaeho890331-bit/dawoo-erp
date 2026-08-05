-- ============================================
-- 006. staff.slack_id 추가 (개발자 요청서 2번)
-- 안전: 추가형(nullable) 컬럼이라 기존 동작에 영향 없음. 언제든 실행 가능.
-- 실행: Supabase Dashboard > SQL Editor
-- ============================================

ALTER TABLE staff ADD COLUMN IF NOT EXISTS slack_id text;

COMMENT ON COLUMN staff.slack_id IS '슬랙 사용자 ID (AI 비서가 슬랙에서 말 건 사람 매칭용)';

-- 현재 확정된 3명 (요청서 기준). 나머지는 슬랙 초대 후 입력.
UPDATE staff SET slack_id = 'U0BJBA7C74M' WHERE name = '김재호' AND slack_id IS NULL;
UPDATE staff SET slack_id = 'U0BK3JBL8Q4' WHERE name = '김현준' AND slack_id IS NULL;
UPDATE staff SET slack_id = 'U0BJGPA3GN7' WHERE name = '송승란' AND slack_id IS NULL;

-- 확인용
-- SELECT name, position, slack_id FROM staff ORDER BY name;
