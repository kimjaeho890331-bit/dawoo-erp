-- 032_cost_ratios.sql
-- 건축 원가계산서 비율 (조달청 간접공사비 제비율).
--
-- 지금까지 이 표는 노션에만 있었다. 견적서를 쓸 때마다 노션을 따로 열어야 했고,
-- 회사는 ERP만 쓰기로 했으니 ERP 안으로 들여온다. 보기용이지만 조달청 기준이
-- 반기마다 바뀌므로 화면에서 직접 고칠 수 있어야 한다.
--
-- 화면 supabase 클라이언트(anon)가 직접 읽고 쓴다. leave_settings 와 같이
-- RLS는 켜지 않는다 (CLAUDE.md "RLS 지금 ENABLE 금지").
-- 추가 전용. 기존 테이블·정책 변경 없음.

-- 비목별 요율
CREATE TABLE IF NOT EXISTS cost_ratios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sort_order INT NOT NULL DEFAULT 0,
  item TEXT NOT NULL UNIQUE,   -- 비목 (간접노무비, 산재보험료 …)
  rate NUMERIC,                -- 요율 (%)
  basis TEXT,                  -- 구성비 (무엇에 곱하는지)
  criteria TEXT,               -- 기준 (10억 미만 / 6개월 이하 …)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE cost_ratios IS '건축 원가계산서 비율 — 조달청 간접공사비 제비율 (견적 작성 시 확인용)';
COMMENT ON COLUMN cost_ratios.item IS '비목. 화면에서 중복 등록을 막으려고 UNIQUE';
COMMENT ON COLUMN cost_ratios.rate IS '요율 (%)';
COMMENT ON COLUMN cost_ratios.basis IS '구성비 — 어떤 금액에 곱하는지';
COMMENT ON COLUMN cost_ratios.criteria IS '적용 기준 (공사금액·기간·공종 조건)';

-- 적용기간과 조달청 캡처 (단일 행)
CREATE TABLE IF NOT EXISTS cost_ratio_settings (
  id INT PRIMARY KEY DEFAULT 1,
  effective_from DATE,          -- 적용 시작일
  effective_to DATE,            -- 적용 종료일 (조달청이 안 정했으면 비움)
  capture_url TEXT,             -- 조달청 적용기준 캡처 (documents 버킷 공개 URL)
  capture_name TEXT,            -- 캡처 원본 파일명
  source_note TEXT,             -- 조달청에서 찾아가는 경로 메모
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cost_ratio_settings_singleton CHECK (id = 1)
);

COMMENT ON TABLE cost_ratio_settings IS '건축 원가계산서 비율의 적용기간·조달청 캡처 (단일 행)';

-- 노션에 있던 2026-04-13 기준값을 그대로 옮긴다.
-- 이미 있으면 건드리지 않는다 (화면에서 고친 값을 되돌리지 않기 위해).
INSERT INTO cost_ratios (sort_order, item, rate, basis, criteria) VALUES
  (10,  '간접노무비',                      17.5,  '직접노무비 × 율',          '10억 미만 / 6개월 이하'),
  (20,  '산재보험료',                      3.56,  '노무비 × 율',              NULL),
  (30,  '고용보험료',                      1.01,  '노무비 × 율',              '130억 미만'),
  (40,  '국민건강보험료',                  3.595, '직접노무비 × 율',          '1개월 이상'),
  (50,  '국민연금보험료',                  4.75,  '직접노무비 × 율',          '1개월 이상'),
  (60,  '노인장기요양보험료',              13.14, '건강보험료 × 율',          '1개월 이상'),
  (70,  '퇴직공제부금비',                  2.3,   '직접노무비 × 율',          '1억 이상'),
  (80,  '산업안전보건비',                  3.11,  '(재료비+직접노무비) × 율', '5억 미만 / 건축공사'),
  (90,  '환경보전비',                      0.3,   '직접공사비 × 율',          '전문, 개보수 공사'),
  (100, '기타경비',                        5.0,   '(재료비+노무비) × 율',     '건축공사'),
  (110, '건설하도급대금 지급보증서 발급수수료', 0.081, '직접공사비 × 율',      '50억 미만'),
  (120, '건설기계대여대금 지급보증액 발급금액', 0.07,  '직접공사비 × 율',      NULL),
  (130, '일반관리비',                      8,     '(재료비+노무비+경비) × 율', NULL),
  (140, '이윤',                            15,    '(노무비+경비+일반관리비) × 율', NULL),
  (150, '석면분담금',                      0.006, '노무비 × 율',              '모든 건설공사 적용'),
  (160, '임금채권부담금',                  0.09,  '노무비 × 율',              '모든 건설공사 적용')
ON CONFLICT (item) DO NOTHING;

INSERT INTO cost_ratio_settings (id, effective_from, source_note) VALUES (
  1,
  '2026-04-13',
  '조달청 1588-0800 → 상단 조달업무 → 업무별자료·시설공사 → "간접" 검색 → 간접공사비(제비율) 적용기준 변경알림'
) ON CONFLICT (id) DO NOTHING;

-- anon/authenticated가 화면에서 직접 접근 (RLS 미사용 — leave_settings 와 동일)
GRANT SELECT, INSERT, UPDATE, DELETE ON cost_ratios TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON cost_ratio_settings TO anon, authenticated;

-- 롤백 (필요 시 수동 실행)
-- DROP TABLE IF EXISTS cost_ratios;
-- DROP TABLE IF EXISTS cost_ratio_settings;
