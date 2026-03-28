-- ============================================================
-- CTPL Traffic Command System — Seed Data
-- ============================================================

-- Seed duty_categories (9 rows)
INSERT INTO duty_categories (name, name_urdu, icon_name, sort_order, requires_location, requires_route, color_hex) VALUES
  ('Duty Points',      'ڈیوٹی پوائنٹ',      'map-pin',        1, true,  false, '#2563EB'),
  ('Motorcycle Beats', 'موٹرسائیکل بیٹ',     'bike',           2, false, true,  '#0F766E'),
  ('Fork Lifter Duty', 'فورک لفٹر ڈیوٹی',    'truck',          3, true,  false, '#D97706'),
  ('Crane Duty',       'کرین ڈیوٹی',         'construction',   4, true,  false, '#7C3AED'),
  ('Office Duty',      'دفتری ڈیوٹی',        'building-2',     5, false, false, '#64748B'),
  ('Training',         'تربیت',              'graduation-cap', 6, false, false, '#0369A1'),
  ('Reserve/Stand-by', 'ریزرو',              'shield',         7, false, false, '#475569'),
  ('Rest',             'آرام',               'moon',           8, false, false, '#94A3B8'),
  ('Absent',           'غیر حاضر',           'x-circle',       9, false, false, '#DC2626');

-- Seed admin_user (password: ctpl@admin2026)
-- Hash generated with bcrypt, 12 rounds
INSERT INTO admin_users (username, password_hash, full_name, is_super_admin)
VALUES ('admin', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMeSSyXODGn7YNX5PHCfkMJjey', 'System Admin', true);
