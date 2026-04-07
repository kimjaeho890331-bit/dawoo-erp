-- 현장관리용 테이블 (Supabase SQL Editor에서 실행)
-- 접수대장(projects)과 완전 별개 독립 테이블

-- 기존 테이블 삭제 (있으면)
DROP TABLE IF EXISTS site_documents CASCADE;
DROP TABLE IF EXISTS site_photos CASCADE;
DROP TABLE IF EXISTS site_logs CASCADE;
DROP TABLE IF EXISTS schedules CASCADE;
DROP TABLE IF EXISTS sites CASCADE;

-- 1. 현장 (메인 테이블)
CREATE TABLE sites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,                     -- 현장명
  address TEXT,                           -- 주소
  site_manager TEXT,                      -- 현장소장
  site_assistant TEXT,                    -- 현장보조
  client_manager TEXT,                    -- 발주처 담당자
  client_phone TEXT,                      -- 발주처 연락처
  start_date DATE,                        -- 착공예정일
  end_date DATE,                          -- 준공예정일
  status TEXT DEFAULT '계약' CHECK (status IN ('계약', '착공', '공사중', '준공서류', '정산완료')),
  budget BIGINT DEFAULT 0,                -- 예산
  spent BIGINT DEFAULT 0,                 -- 지출
  memo TEXT,
  progress INT DEFAULT 0,                 -- 공정률 (0~100)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. 공정 일정 (캘린더 바)
CREATE TABLE schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  title TEXT NOT NULL,                    -- 공종명 (예: 철거, 방수, 기와)
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  contractor TEXT,                        -- 시공업체명
  workers TEXT,                           -- 투입 작업자
  memo TEXT,
  confirmed BOOLEAN DEFAULT false,        -- 미확정(테두리만) vs 확정(색채움)
  color TEXT DEFAULT '#3B82F6',           -- 바 색상
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. 현장일지
CREATE TABLE site_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  weather TEXT,                           -- 날씨
  today_work TEXT,                        -- 금일작업
  workers_detail TEXT,                    -- 투입인력 (직종별)
  materials TEXT,                         -- 자재
  remarks TEXT,                           -- 특이사항
  tomorrow_plan TEXT,                     -- 익일계획
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. 현장일지 사진
CREATE TABLE site_photos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  site_log_id UUID NOT NULL REFERENCES site_logs(id) ON DELETE CASCADE,
  photo_type TEXT NOT NULL CHECK (photo_type IN ('fixed', 'extra')),
  slot_index INT,                         -- fixed일 때 0~3
  file_url TEXT NOT NULL,
  file_name TEXT,
  caption TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. 현장 서류 (단계별)
CREATE TABLE site_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('착공', '공사중', '준공', '상시서류', '수금', '기타')),
  doc_name TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'auto')),
  file_url TEXT,
  file_name TEXT,
  source_tag TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS 활성화
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_documents ENABLE ROW LEVEL SECURITY;

-- 임시 정책 (개발 중 전체 접근 허용)
CREATE POLICY "sites_all" ON sites FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "schedules_all" ON schedules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "site_logs_all" ON site_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "site_photos_all" ON site_photos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "site_documents_all" ON site_documents FOR ALL USING (true) WITH CHECK (true);
