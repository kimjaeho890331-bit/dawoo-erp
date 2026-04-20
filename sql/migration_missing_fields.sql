-- ================================================
-- 누락된 projects 컬럼 추가
-- 원인: 승인(approval_received_date), 착공서류(construction_doc_date),
--       공사완료일(construction_end_date), 추가공사금(additional_cost),
--       실측 메모(field_memo/area_result) 필드가 코드에서는 사용되지만 DB에 없어서
--       자동저장이 조용히 실패함 → 새로고침 시 다 사라짐
-- ================================================

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS approval_received_date DATE,
  ADD COLUMN IF NOT EXISTS construction_doc_date DATE,
  ADD COLUMN IF NOT EXISTS construction_doc_submitter TEXT,
  ADD COLUMN IF NOT EXISTS construction_end_date DATE,
  ADD COLUMN IF NOT EXISTS additional_cost INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS field_memo TEXT,
  ADD COLUMN IF NOT EXISTS area_result TEXT;

COMMENT ON COLUMN projects.approval_received_date IS '승인일 (2단계, approval_date=사용승인일과 구분)';
COMMENT ON COLUMN projects.construction_doc_date IS '착공서류 제출일';
COMMENT ON COLUMN projects.construction_doc_submitter IS '착공서류 제출자';
COMMENT ON COLUMN projects.construction_end_date IS '공사완료일';
COMMENT ON COLUMN projects.additional_cost IS '추가공사금';
COMMENT ON COLUMN projects.field_memo IS '실측 현장메모';
COMMENT ON COLUMN projects.area_result IS '실측 면적결과';
