-- 008_vendor_categories.sql
-- 거래처 DB 공종칩: 공종을 칩으로 등록해두고 거래처 분류에 클릭으로 반영
-- vendors.category(TEXT)는 그대로 두고, 칩 목록만 별도 테이블로 관리

-- 적용
CREATE TABLE IF NOT EXISTS vendor_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE vendor_categories IS '거래처 공종칩 목록 (협력업체/일용직 공통)';

ALTER TABLE vendor_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vendor_categories_select" ON vendor_categories;
DROP POLICY IF EXISTS "vendor_categories_insert" ON vendor_categories;
DROP POLICY IF EXISTS "vendor_categories_update" ON vendor_categories;
DROP POLICY IF EXISTS "vendor_categories_delete" ON vendor_categories;
CREATE POLICY "vendor_categories_select" ON vendor_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "vendor_categories_insert" ON vendor_categories FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "vendor_categories_update" ON vendor_categories FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "vendor_categories_delete" ON vendor_categories FOR DELETE TO authenticated USING (true);

-- 롤백 (필요 시 수동 실행)
-- DROP TABLE vendor_categories;
