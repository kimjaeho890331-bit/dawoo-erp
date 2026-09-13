-- docs/security/rls-draft.sql
-- 설계 초안만. 실행하지 말 것. supabase/migrations 에 넣지 말 것.
-- ENABLE ROW LEVEL SECURITY 를 지금 적용하면 화면이 깨진다.
-- 테이블 DROP 금지.

-- =============================================================================
-- 전제 (주석)
--   1) 프론트 anon 클라이언트를 세션 JWT 클라이언트로 바꾸거나
--   2) 아래 테이블 CRUD를 API(service_role)로만 옮긴 뒤에만 검토.
-- =============================================================================

-- --- credential_entries (022와 동일 방향, 재실행 검토용) ---
-- -- ALTER TABLE credential_entries ENABLE ROW LEVEL SECURITY;  -- 지금 실행 금지
-- -- REVOKE ALL ON TABLE credential_entries FROM PUBLIC, anon, authenticated;
-- -- GRANT ALL ON TABLE credential_entries TO service_role;

-- --- staff_emails ---
-- -- ALTER TABLE staff_emails ENABLE ROW LEVEL SECURITY;  -- 지금 실행 금지
-- -- REVOKE ALL ON TABLE staff_emails FROM PUBLIC, anon, authenticated;
-- -- GRANT ALL ON TABLE staff_emails TO service_role;

-- --- staff (세션 클라이언트 이후) ---
-- -- ALTER TABLE staff ENABLE ROW LEVEL SECURITY;  -- 지금 실행 금지
-- -- CREATE POLICY staff_select_auth ON staff FOR SELECT TO authenticated USING (true);
-- -- -- 쓰기는 관리자/API만. staff.role 클레임이 JWT에 없으므로 당분간 service_role 쓰기.

-- --- expense_reports / 자식 ---
-- -- ALTER TABLE expense_reports ENABLE ROW LEVEL SECURITY;  -- 지금 실행 금지
-- -- ALTER TABLE expense_report_payments ENABLE ROW LEVEL SECURITY;
-- -- ALTER TABLE expense_report_details ENABLE ROW LEVEL SECURITY;
-- -- ALTER TABLE expense_report_lines ENABLE ROW LEVEL SECURITY;
-- -- ALTER TABLE expense_report_files ENABLE ROW LEVEL SECURITY;
-- -- ALTER TABLE expense_report_refs ENABLE ROW LEVEL SECURITY;
-- -- ALTER TABLE doc_sequences ENABLE ROW LEVEL SECURITY;
-- -- REVOKE ALL ON TABLE expense_reports FROM PUBLIC, anon, authenticated;
-- -- REVOKE ALL ON TABLE expense_report_payments FROM PUBLIC, anon, authenticated;
-- -- REVOKE ALL ON TABLE expense_report_details FROM PUBLIC, anon, authenticated;
-- -- REVOKE ALL ON TABLE expense_report_lines FROM PUBLIC, anon, authenticated;
-- -- REVOKE ALL ON TABLE expense_report_files FROM PUBLIC, anon, authenticated;
-- -- REVOKE ALL ON TABLE expense_report_refs FROM PUBLIC, anon, authenticated;
-- -- REVOKE ALL ON TABLE doc_sequences FROM PUBLIC, anon, authenticated;
-- -- GRANT ALL ON TABLE expense_reports TO service_role;
-- -- GRANT ALL ON TABLE expense_report_payments TO service_role;
-- -- GRANT ALL ON TABLE expense_report_details TO service_role;
-- -- GRANT ALL ON TABLE expense_report_lines TO service_role;
-- -- GRANT ALL ON TABLE expense_report_files TO service_role;
-- -- GRANT ALL ON TABLE expense_report_refs TO service_role;
-- -- GRANT ALL ON TABLE doc_sequences TO service_role;

-- --- expenses / sites / projects / vendors / schedules ---
-- -- ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;  -- 지금 실행 금지
-- -- ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
-- -- ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
-- -- ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
-- -- ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
-- -- CREATE POLICY expenses_auth_all ON expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- -- CREATE POLICY sites_auth_all ON sites FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- -- CREATE POLICY projects_auth_all ON projects FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- -- CREATE POLICY vendors_auth_all ON vendors FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- -- CREATE POLICY schedules_auth_all ON schedules FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- -- REVOKE ALL ON TABLE expenses FROM anon;
-- -- REVOKE ALL ON TABLE sites FROM anon;
-- -- REVOKE ALL ON TABLE projects FROM anon;
-- -- REVOKE ALL ON TABLE vendors FROM anon;
-- -- REVOKE ALL ON TABLE schedules FROM anon;

-- --- activity_log ---
-- -- ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;  -- 지금 실행 금지
-- -- CREATE POLICY activity_log_select_auth ON activity_log FOR SELECT TO authenticated USING (true);
-- -- REVOKE ALL ON TABLE activity_log FROM anon;
-- -- -- INSERT는 API(service_role)만.

-- --- notices (선택) ---
-- -- ALTER TABLE notices ENABLE ROW LEVEL SECURITY;  -- 지금 실행 금지
-- -- CREATE POLICY notices_select_auth ON notices FOR SELECT TO authenticated USING (true);
-- -- REVOKE ALL ON TABLE notices FROM anon;

-- --- 롤백 (깨진 테이블만, DROP TABLE 금지) ---
-- -- DROP POLICY IF EXISTS staff_select_auth ON staff;
-- -- GRANT SELECT, INSERT, UPDATE, DELETE ON staff TO anon, authenticated;
-- -- ALTER TABLE staff DISABLE ROW LEVEL SECURITY;
