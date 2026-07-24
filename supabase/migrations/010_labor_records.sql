-- 010_labor_records.sql
-- 일용직 근무관리 (일용노무비지급명세서)
-- 월별 근무자 1명 = 1행. 근무자 정보(주민번호/연락처/계좌)는 최신 행에서 자동 재사용.
-- RLS 미적용: 현행 구조(프론트 anon 클라이언트, 타 테이블 RLS off)와 동일. 추후 인증 정비 시 일괄 적용.

-- 적용
CREATE TABLE IF NOT EXISTS labor_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INT NOT NULL,
  month INT NOT NULL,
  worker_name TEXT NOT NULL,
  resident_id TEXT,                          -- 주민등록번호
  phone TEXT,                                -- 연락처
  bank_name TEXT,                            -- 은행명(예금주 포함 자유기재)
  account_number TEXT,                       -- 계좌번호
  day_values JSONB NOT NULL DEFAULT '{}',    -- {"1": 1, "17": 0.5, ...} 날짜별 근무값
  daily_wage BIGINT,                         -- 일급
  vehicle_cost BIGINT,                       -- 차량유지비
  payment_date TEXT,                         -- 노무 지급일 (자유기재: "02-02(350,000)" 등)
  site_name TEXT,                            -- 현장명
  work_type TEXT,                            -- 공종
  note TEXT,                                 -- 비고
  -- 공제 수동값 (NULL이면 자동계산: 갑근세/주민세/고용보험만 자동, 나머지 기본 0)
  ded_income_tax BIGINT,
  ded_resident_tax BIGINT,
  ded_employment BIGINT,
  ded_pension BIGINT,
  ded_health BIGINT,
  ded_longterm BIGINT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_labor_records_ym ON labor_records(year, month);

COMMENT ON TABLE labor_records IS '일용직 근무관리 — 월별 일용노무비지급명세서 행';

-- 롤백 (필요 시 수동 실행)
-- DROP TABLE labor_records;
