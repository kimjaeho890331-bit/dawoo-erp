-- 012_expense_approval.sql
-- 지출결의서 전자결재 (카카오워크 전자결재 대체)
-- 문서 1건 = expense_reports 1행 + 지급정보/상세내용/결재선/첨부 자식 행
-- RLS 미적용: 현행 구조(프론트 anon 클라이언트, 타 테이블 RLS off)와 동일.
--             쓰기 보호는 /api/approval/* 서버 라우트에서 수행한다.

-- 적용

CREATE TABLE IF NOT EXISTS expense_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_no TEXT UNIQUE,                          -- CDV-26-000158. 결재 완료 시 채번
  title TEXT NOT NULL,                         -- 기안제목 (50자)
  status TEXT NOT NULL DEFAULT 'draft',        -- draft/pending/approved/rejected/withdrawn
  drafter_staff_id UUID NOT NULL REFERENCES staff(id),
  submitted_at TIMESTAMPTZ,                    -- 상신일시
  completed_at TIMESTAMPTZ,                    -- 결재완료일시
  total_amount BIGINT NOT NULL DEFAULT 0,      -- 지급 총계 = payments 합계
  category TEXT,                               -- 계정과목. 최종 승인 시 결재자가 선택
  body_html TEXT,                              -- 본문 에디터
  retention_years INT NOT NULL DEFAULT 5,      -- 보존연한 (표시용)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expense_report_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
  seq INT NOT NULL DEFAULT 0,
  vendor_name TEXT NOT NULL,
  amount BIGINT NOT NULL,
  pay_request_date DATE NOT NULL,
  bank TEXT NOT NULL,
  account_no TEXT NOT NULL,
  business_no TEXT,
  expense_id UUID REFERENCES expenses(id)      -- 승인 시 생성된 지출. 중복 생성 방지 키
);

CREATE TABLE IF NOT EXISTS expense_report_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
  seq INT NOT NULL DEFAULT 0,
  vendor_name TEXT,
  account TEXT,
  content TEXT,
  dept_name TEXT,
  amount BIGINT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS expense_report_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
  seq INT NOT NULL,                            -- 결재 순서. 작을수록 먼저
  staff_id UUID NOT NULL REFERENCES staff(id),
  role TEXT NOT NULL,                          -- approval / cooperation
  state TEXT NOT NULL DEFAULT 'waiting',       -- waiting / approved / rejected
  acted_at TIMESTAMPTZ,
  comment TEXT
);

CREATE TABLE IF NOT EXISTS expense_report_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  size BIGINT NOT NULL DEFAULT 0,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expense_report_refs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
  ref_report_id UUID NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS doc_sequences (
  form_abbr TEXT NOT NULL,
  year INT NOT NULL,
  last_no INT NOT NULL DEFAULT 0,
  PRIMARY KEY (form_abbr, year)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_er_status ON expense_reports(status);
CREATE INDEX IF NOT EXISTS idx_er_drafter ON expense_reports(drafter_staff_id);
CREATE INDEX IF NOT EXISTS idx_er_submitted ON expense_reports(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_erp_report ON expense_report_payments(report_id);
CREATE INDEX IF NOT EXISTS idx_erd_report ON expense_report_details(report_id);
CREATE INDEX IF NOT EXISTS idx_erl_report ON expense_report_lines(report_id);
CREATE INDEX IF NOT EXISTS idx_erl_staff ON expense_report_lines(staff_id, state);
CREATE INDEX IF NOT EXISTS idx_erf_report ON expense_report_files(report_id);
CREATE INDEX IF NOT EXISTS idx_push_staff ON push_subscriptions(staff_id);

-- 카카오워크 마지막 문서번호가 CDV-26-000157이므로 158부터 이어간다
INSERT INTO doc_sequences (form_abbr, year, last_no)
VALUES ('CDV', 2026, 157)
ON CONFLICT (form_abbr, year) DO NOTHING;

-- 문서번호 원자적 채번. 동시에 두 명이 승인해도 번호가 겹치지 않는다.
CREATE OR REPLACE FUNCTION next_doc_no(p_form_abbr TEXT, p_year INT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_no INT;
BEGIN
  INSERT INTO doc_sequences (form_abbr, year, last_no)
  VALUES (p_form_abbr, p_year, 0)
  ON CONFLICT (form_abbr, year) DO NOTHING;

  UPDATE doc_sequences
     SET last_no = last_no + 1
   WHERE form_abbr = p_form_abbr AND year = p_year
  RETURNING last_no INTO v_no;

  RETURN p_form_abbr || '-' || lpad((p_year % 100)::TEXT, 2, '0') || '-' || lpad(v_no::TEXT, 6, '0');
END
$$;

COMMENT ON TABLE expense_reports IS '지출결의서 문서 본체';
COMMENT ON TABLE expense_report_payments IS '지급 정보 — 실제 송금 대상 1행';
COMMENT ON TABLE expense_report_details IS '상세 내용 — 비용 내역 (선택)';
COMMENT ON TABLE expense_report_lines IS '결재선 — seq 순서대로 결재/협조';
COMMENT ON TABLE doc_sequences IS '문서번호 순번. 2026년 CDV는 157부터 시작(카카오워크 이어받기)';
COMMENT ON FUNCTION next_doc_no IS '문서번호 원자적 채번 — CDV-26-000158 형식';

-- 롤백 (필요 시 수동 실행)
-- DROP FUNCTION IF EXISTS next_doc_no(TEXT, INT);
-- DROP TABLE IF EXISTS push_subscriptions;
-- DROP TABLE IF EXISTS doc_sequences;
-- DROP TABLE IF EXISTS expense_report_refs;
-- DROP TABLE IF EXISTS expense_report_files;
-- DROP TABLE IF EXISTS expense_report_lines;
-- DROP TABLE IF EXISTS expense_report_details;
-- DROP TABLE IF EXISTS expense_report_payments;
-- DROP TABLE IF EXISTS expense_reports;
