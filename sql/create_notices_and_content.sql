-- notices 테이블 생성
-- 시드 없음. 운영 공지는 사장이 준 안내글을 에이전트/화면에서 수동 등록한다.
CREATE TABLE IF NOT EXISTS notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '공지',
  pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

NOTIFY pgrst, 'reload schema';
