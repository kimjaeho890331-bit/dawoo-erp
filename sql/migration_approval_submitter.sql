-- ================================================
-- projects.approval_submitter 컬럼 추가
-- 용도: 승인 버튼을 누른 직원 이름 기록
-- 패턴: 기존 consent_submitter, application_submitter, completion_submitter와 일관
-- ================================================

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS approval_submitter TEXT;

COMMENT ON COLUMN projects.approval_submitter IS '승인 처리자 이름 (승인 버튼 클릭 시 기록)';
