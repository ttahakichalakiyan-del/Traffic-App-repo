-- Run this in Supabase SQL Editor AFTER enabling PostGIS
-- Execute files in this exact order:

-- 1. First check PostGIS is enabled:
SELECT PostGIS_Version();
-- Should return version like: 3.4.0

-- 2. Run migrations in order:
-- Execute: 001_initial_schema.sql
-- Execute: 002_seeds.sql
-- Execute: 003_views.sql
-- Execute: 004_procedures.sql

-- 3. Verify all tables created:
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
-- Should show 14 tables

-- 4. Verify PostGIS columns:
SELECT f_table_name, f_geometry_column, type
FROM geometry_columns;
-- Should show spatial columns for areas, sectors, staff_locations etc

-- 5. Verify seed data:
SELECT name, name_urdu FROM duty_categories ORDER BY sort_order;
-- Should show 9 duty categories

-- 6. Verify admin user:
SELECT username, full_name, is_super_admin FROM admin_users;
-- Should show: admin, System Admin, true

-- 7. Enable Row Level Security:
ALTER TABLE dsp_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- RLS Policies (backend service role bypasses RLS):
CREATE POLICY "Service role full access" ON dsp_users
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON staff_members
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON admin_users
  FOR ALL USING (auth.role() = 'service_role');

-- 8. Create performance indexes if not already:
-- (Already in 001_initial_schema.sql but verify)
SELECT indexname, tablename FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename;

-- 9. Test stored procedures:
-- First need a test DSP and area, then:
-- SELECT get_roster_summary('dsp-uuid-here', CURRENT_DATE);
