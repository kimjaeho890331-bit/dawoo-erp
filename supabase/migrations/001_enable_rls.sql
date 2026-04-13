-- ============================================
-- DAWOO ERP RLS 정책 마이그레이션
-- 실행 순서: dawoo_db_schema.sql → 이 파일
-- Supabase Dashboard > SQL Editor에서 실행
-- DROP POLICY IF EXISTS 적용 — 재실행 안전
-- ============================================

-- ============================================
-- 1. 일반 테이블 (인증된 사용자 읽기/쓰기 허용)
-- ============================================

-- staff
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_select" ON staff;
DROP POLICY IF EXISTS "staff_insert" ON staff;
DROP POLICY IF EXISTS "staff_update" ON staff;
DROP POLICY IF EXISTS "staff_delete" ON staff;
CREATE POLICY "staff_select" ON staff FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff_insert" ON staff FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "staff_update" ON staff FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "staff_delete" ON staff FOR DELETE TO authenticated USING (true);

-- cities
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cities_select" ON cities;
DROP POLICY IF EXISTS "cities_insert" ON cities;
DROP POLICY IF EXISTS "cities_update" ON cities;
DROP POLICY IF EXISTS "cities_delete" ON cities;
CREATE POLICY "cities_select" ON cities FOR SELECT TO authenticated USING (true);
CREATE POLICY "cities_insert" ON cities FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "cities_update" ON cities FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "cities_delete" ON cities FOR DELETE TO authenticated USING (true);

-- work_categories
ALTER TABLE work_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "work_categories_select" ON work_categories;
DROP POLICY IF EXISTS "work_categories_insert" ON work_categories;
DROP POLICY IF EXISTS "work_categories_update" ON work_categories;
DROP POLICY IF EXISTS "work_categories_delete" ON work_categories;
CREATE POLICY "work_categories_select" ON work_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "work_categories_insert" ON work_categories FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "work_categories_update" ON work_categories FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "work_categories_delete" ON work_categories FOR DELETE TO authenticated USING (true);

-- work_types
ALTER TABLE work_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "work_types_select" ON work_types;
DROP POLICY IF EXISTS "work_types_insert" ON work_types;
DROP POLICY IF EXISTS "work_types_update" ON work_types;
DROP POLICY IF EXISTS "work_types_delete" ON work_types;
CREATE POLICY "work_types_select" ON work_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "work_types_insert" ON work_types FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "work_types_update" ON work_types FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "work_types_delete" ON work_types FOR DELETE TO authenticated USING (true);

-- projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "projects_select" ON projects;
DROP POLICY IF EXISTS "projects_insert" ON projects;
DROP POLICY IF EXISTS "projects_update" ON projects;
DROP POLICY IF EXISTS "projects_delete" ON projects;
CREATE POLICY "projects_select" ON projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "projects_insert" ON projects FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "projects_update" ON projects FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "projects_delete" ON projects FOR DELETE TO authenticated USING (true);

-- payments
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payments_select" ON payments;
DROP POLICY IF EXISTS "payments_insert" ON payments;
DROP POLICY IF EXISTS "payments_update" ON payments;
DROP POLICY IF EXISTS "payments_delete" ON payments;
CREATE POLICY "payments_select" ON payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "payments_insert" ON payments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "payments_update" ON payments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "payments_delete" ON payments FOR DELETE TO authenticated USING (true);

-- status_logs
ALTER TABLE status_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "status_logs_select" ON status_logs;
DROP POLICY IF EXISTS "status_logs_insert" ON status_logs;
DROP POLICY IF EXISTS "status_logs_update" ON status_logs;
DROP POLICY IF EXISTS "status_logs_delete" ON status_logs;
CREATE POLICY "status_logs_select" ON status_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "status_logs_insert" ON status_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "status_logs_update" ON status_logs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "status_logs_delete" ON status_logs FOR DELETE TO authenticated USING (true);

-- templates
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "templates_select" ON templates;
DROP POLICY IF EXISTS "templates_insert" ON templates;
DROP POLICY IF EXISTS "templates_update" ON templates;
DROP POLICY IF EXISTS "templates_delete" ON templates;
CREATE POLICY "templates_select" ON templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "templates_insert" ON templates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "templates_update" ON templates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "templates_delete" ON templates FOR DELETE TO authenticated USING (true);

-- documents
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "documents_select" ON documents;
DROP POLICY IF EXISTS "documents_insert" ON documents;
DROP POLICY IF EXISTS "documents_update" ON documents;
DROP POLICY IF EXISTS "documents_delete" ON documents;
CREATE POLICY "documents_select" ON documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "documents_insert" ON documents FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "documents_update" ON documents FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "documents_delete" ON documents FOR DELETE TO authenticated USING (true);

-- attachments
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "attachments_select" ON attachments;
DROP POLICY IF EXISTS "attachments_insert" ON attachments;
DROP POLICY IF EXISTS "attachments_update" ON attachments;
DROP POLICY IF EXISTS "attachments_delete" ON attachments;
CREATE POLICY "attachments_select" ON attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "attachments_insert" ON attachments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "attachments_update" ON attachments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "attachments_delete" ON attachments FOR DELETE TO authenticated USING (true);

-- schedules
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "schedules_select" ON schedules;
DROP POLICY IF EXISTS "schedules_insert" ON schedules;
DROP POLICY IF EXISTS "schedules_update" ON schedules;
DROP POLICY IF EXISTS "schedules_delete" ON schedules;
CREATE POLICY "schedules_select" ON schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY "schedules_insert" ON schedules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "schedules_update" ON schedules FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "schedules_delete" ON schedules FOR DELETE TO authenticated USING (true);

-- sites
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sites_select" ON sites;
DROP POLICY IF EXISTS "sites_insert" ON sites;
DROP POLICY IF EXISTS "sites_update" ON sites;
DROP POLICY IF EXISTS "sites_delete" ON sites;
CREATE POLICY "sites_select" ON sites FOR SELECT TO authenticated USING (true);
CREATE POLICY "sites_insert" ON sites FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "sites_update" ON sites FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sites_delete" ON sites FOR DELETE TO authenticated USING (true);

-- site_tasks
ALTER TABLE site_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "site_tasks_select" ON site_tasks;
DROP POLICY IF EXISTS "site_tasks_insert" ON site_tasks;
DROP POLICY IF EXISTS "site_tasks_update" ON site_tasks;
DROP POLICY IF EXISTS "site_tasks_delete" ON site_tasks;
CREATE POLICY "site_tasks_select" ON site_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "site_tasks_insert" ON site_tasks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "site_tasks_update" ON site_tasks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "site_tasks_delete" ON site_tasks FOR DELETE TO authenticated USING (true);

-- site_logs
ALTER TABLE site_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "site_logs_select" ON site_logs;
DROP POLICY IF EXISTS "site_logs_insert" ON site_logs;
DROP POLICY IF EXISTS "site_logs_update" ON site_logs;
DROP POLICY IF EXISTS "site_logs_delete" ON site_logs;
CREATE POLICY "site_logs_select" ON site_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "site_logs_insert" ON site_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "site_logs_update" ON site_logs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "site_logs_delete" ON site_logs FOR DELETE TO authenticated USING (true);

-- site_photos
ALTER TABLE site_photos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "site_photos_select" ON site_photos;
DROP POLICY IF EXISTS "site_photos_insert" ON site_photos;
DROP POLICY IF EXISTS "site_photos_update" ON site_photos;
DROP POLICY IF EXISTS "site_photos_delete" ON site_photos;
CREATE POLICY "site_photos_select" ON site_photos FOR SELECT TO authenticated USING (true);
CREATE POLICY "site_photos_insert" ON site_photos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "site_photos_update" ON site_photos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "site_photos_delete" ON site_photos FOR DELETE TO authenticated USING (true);

-- expenses
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "expenses_select" ON expenses;
DROP POLICY IF EXISTS "expenses_insert" ON expenses;
DROP POLICY IF EXISTS "expenses_update" ON expenses;
DROP POLICY IF EXISTS "expenses_delete" ON expenses;
CREATE POLICY "expenses_select" ON expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "expenses_insert" ON expenses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "expenses_update" ON expenses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "expenses_delete" ON expenses FOR DELETE TO authenticated USING (true);

-- estimates
ALTER TABLE estimates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "estimates_select" ON estimates;
DROP POLICY IF EXISTS "estimates_insert" ON estimates;
DROP POLICY IF EXISTS "estimates_update" ON estimates;
DROP POLICY IF EXISTS "estimates_delete" ON estimates;
CREATE POLICY "estimates_select" ON estimates FOR SELECT TO authenticated USING (true);
CREATE POLICY "estimates_insert" ON estimates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "estimates_update" ON estimates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "estimates_delete" ON estimates FOR DELETE TO authenticated USING (true);

-- vendors
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vendors_select" ON vendors;
DROP POLICY IF EXISTS "vendors_insert" ON vendors;
DROP POLICY IF EXISTS "vendors_update" ON vendors;
DROP POLICY IF EXISTS "vendors_delete" ON vendors;
CREATE POLICY "vendors_select" ON vendors FOR SELECT TO authenticated USING (true);
CREATE POLICY "vendors_insert" ON vendors FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "vendors_update" ON vendors FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "vendors_delete" ON vendors FOR DELETE TO authenticated USING (true);

-- promo_records
ALTER TABLE promo_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "promo_records_select" ON promo_records;
DROP POLICY IF EXISTS "promo_records_insert" ON promo_records;
DROP POLICY IF EXISTS "promo_records_update" ON promo_records;
DROP POLICY IF EXISTS "promo_records_delete" ON promo_records;
CREATE POLICY "promo_records_select" ON promo_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "promo_records_insert" ON promo_records FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "promo_records_update" ON promo_records FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "promo_records_delete" ON promo_records FOR DELETE TO authenticated USING (true);

-- as_records
ALTER TABLE as_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "as_records_select" ON as_records;
DROP POLICY IF EXISTS "as_records_insert" ON as_records;
DROP POLICY IF EXISTS "as_records_update" ON as_records;
DROP POLICY IF EXISTS "as_records_delete" ON as_records;
CREATE POLICY "as_records_select" ON as_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "as_records_insert" ON as_records FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "as_records_update" ON as_records FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "as_records_delete" ON as_records FOR DELETE TO authenticated USING (true);

-- ============================================
-- 2. 관리자 전용 테이블
-- ============================================

-- activity_log
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "activity_log_admin_all" ON activity_log;
DROP POLICY IF EXISTS "activity_log_own_select" ON activity_log;
CREATE POLICY "activity_log_admin_all" ON activity_log
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff
      WHERE staff.id::text = auth.uid()::text
      AND staff.role = '관리자'
    )
  );
CREATE POLICY "activity_log_own_select" ON activity_log
  FOR SELECT TO authenticated
  USING (staff_id::text = auth.uid()::text);

-- kpi_settings
ALTER TABLE kpi_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kpi_settings_admin_all" ON kpi_settings;
CREATE POLICY "kpi_settings_admin_all" ON kpi_settings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff
      WHERE staff.id::text = auth.uid()::text
      AND staff.role = '관리자'
    )
  );
