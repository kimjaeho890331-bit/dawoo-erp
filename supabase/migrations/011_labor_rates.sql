-- 011_labor_rates.sql
-- 일용직 공제 요율 (월별 저장 — 요율이 바뀌어도 과거 달 자동계산이 변하지 않도록)
-- rates 예: {"income": 2.7, "resident": 10, "employment": 0.9, "pension": 4.5, "health": 3.43, "longterm": 11.52} (% 단위)

-- 적용
CREATE TABLE IF NOT EXISTS labor_rates (
  year INT NOT NULL,
  month INT NOT NULL,
  rates JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (year, month)
);

COMMENT ON TABLE labor_rates IS '일용직 근무관리 월별 공제 요율';

-- 롤백 (필요 시 수동 실행)
-- DROP TABLE labor_rates;
