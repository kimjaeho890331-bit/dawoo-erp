-- ============================================
-- 카카오 OAuth 인증을 위한 staff 테이블 확장
-- 2026.04.09
-- ============================================

-- staff 테이블에 이메일 + 인증 상태 추가
ALTER TABLE staff ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;

-- 기존에 이메일이 설정된 직원은 인증 완료 처리
UPDATE staff SET is_verified = true WHERE email IS NOT NULL;
