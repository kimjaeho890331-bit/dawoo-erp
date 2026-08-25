-- 첨부 출처. 거래처DB에서 자동으로 붙은 서류와 기안자가 직접 올린 파일을 구분한다.
-- 승인 시 지출 영수증(expenses.receipt_url)은 직접 올린 것 중에서만 고른다 —
-- 자동 첨부(사업자등록증·통장사본)가 영수증으로 기록되면 회계 자료가 어긋난다.
ALTER TABLE expense_report_files
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

-- 기존 행은 전부 기안자가 직접 올린 것이므로 기본값이 사실과 맞는다.
