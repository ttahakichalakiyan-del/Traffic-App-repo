-- ============================================================
-- CTPL Traffic Command System — Initial Schema
-- PostgreSQL 15 + PostGIS 3.4
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLE 1: dsp_users
-- ============================================================
CREATE TABLE dsp_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  badge_number VARCHAR(20) UNIQUE,
  rank VARCHAR(50),
  designation VARCHAR(100),
  phone VARCHAR(20),
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 2: areas
-- ============================================================
CREATE TABLE areas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  dsp_user_id UUID REFERENCES dsp_users(id) ON DELETE SET NULL,
  boundary GEOMETRY(POLYGON, 4326) NOT NULL,
  center_point GEOMETRY(POINT, 4326),
  color_hex VARCHAR(7) DEFAULT '#2563EB',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 3: sectors
-- ============================================================
CREATE TABLE sectors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  area_id UUID NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  dsp_user_id UUID REFERENCES dsp_users(id) ON DELETE SET NULL,
  name VARCHAR(100) NOT NULL,
  display_order INT DEFAULT 1,
  color_hex VARCHAR(7) DEFAULT '#2563EB',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 4: staff_members
-- ============================================================
CREATE TABLE staff_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  badge_id VARCHAR(30) UNIQUE NOT NULL,
  pin_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  rank VARCHAR(50),
  designation VARCHAR(100),
  area_id UUID REFERENCES areas(id) ON DELETE SET NULL,
  sector_id UUID REFERENCES sectors(id) ON DELETE SET NULL,
  phone VARCHAR(20),
  device_token TEXT,
  device_info JSONB,
  is_active BOOLEAN DEFAULT true,
  is_on_duty BOOLEAN DEFAULT false,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 5: sessions
-- ============================================================
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  user_type VARCHAR(10) NOT NULL CHECK (user_type IN ('dsp', 'staff', 'admin')),
  token_hash VARCHAR(255) UNIQUE NOT NULL,
  device_fingerprint TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 6: staff_locations
-- ============================================================
CREATE TABLE staff_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  location_point GEOMETRY(POINT, 4326),
  accuracy FLOAT,
  speed FLOAT,
  bearing FLOAT,
  battery_level INT,
  is_on_duty BOOLEAN DEFAULT false,
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 7: traffic_snapshots
-- ============================================================
CREATE TABLE traffic_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  area_id UUID REFERENCES areas(id) ON DELETE CASCADE,
  segment_id VARCHAR(100),
  road_name VARCHAR(200),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  location_point GEOMETRY(POINT, 4326),
  congestion_level SMALLINT CHECK (congestion_level BETWEEN 0 AND 3),
  speed_kmh FLOAT,
  jam_factor FLOAT,
  data_source VARCHAR(50),
  timestamp TIMESTAMPTZ NOT NULL
);

-- ============================================================
-- TABLE 8: predictions
-- ============================================================
CREATE TABLE predictions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  area_id UUID REFERENCES areas(id) ON DELETE CASCADE,
  road_name VARCHAR(200),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  location_point GEOMETRY(POINT, 4326),
  predicted_date DATE NOT NULL,
  time_window_start TIME,
  time_window_end TIME,
  day_of_week SMALLINT,
  confidence FLOAT CHECK (confidence BETWEEN 0 AND 1),
  historical_occurrences INT,
  model_version VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 9: alerts
-- ============================================================
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  area_id UUID REFERENCES areas(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  road_name VARCHAR(200),
  alert_type VARCHAR(50),
  severity SMALLINT CHECK (severity BETWEEN 1 AND 3),
  description TEXT,
  detected_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  acknowledged_by_dsp_id UUID REFERENCES dsp_users(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true
);

-- ============================================================
-- TABLE 10: duty_categories
-- ============================================================
CREATE TABLE duty_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) UNIQUE NOT NULL,
  name_urdu VARCHAR(100),
  icon_name VARCHAR(50),
  sort_order INT DEFAULT 0,
  requires_location BOOLEAN DEFAULT false,
  requires_route BOOLEAN DEFAULT false,
  color_hex VARCHAR(7),
  is_active BOOLEAN DEFAULT true
);

-- ============================================================
-- TABLE 11: daily_rosters
-- ============================================================
CREATE TABLE daily_rosters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sector_id UUID NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
  roster_date DATE NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_by_dsp_id UUID REFERENCES dsp_users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  notes TEXT,
  total_staff_count INT DEFAULT 0,
  assigned_staff_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(sector_id, roster_date)
);

-- ============================================================
-- TABLE 12: roster_entries
-- ============================================================
CREATE TABLE roster_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  roster_id UUID NOT NULL REFERENCES daily_rosters(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  duty_category_id UUID REFERENCES duty_categories(id) ON DELETE SET NULL,
  duty_location VARCHAR(255),
  beat_route VARCHAR(500),
  shift_start TIME,
  shift_end TIME,
  notes VARCHAR(500),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(roster_id, staff_id)
);

-- ============================================================
-- TABLE 13: roster_shares
-- ============================================================
CREATE TABLE roster_shares (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  roster_id UUID NOT NULL REFERENCES daily_rosters(id) ON DELETE CASCADE,
  shared_by_dsp_id UUID REFERENCES dsp_users(id) ON DELETE SET NULL,
  share_type VARCHAR(20),
  recipient_count INT DEFAULT 0,
  shared_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TABLE 14: admin_users
-- ============================================================
CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  is_super_admin BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- staff_locations: query by staff + recent time, spatial lookup
CREATE INDEX idx_staff_locations_staff_time ON staff_locations(staff_id, timestamp DESC);
CREATE INDEX idx_staff_locations_point ON staff_locations USING GIST(location_point);

-- traffic_snapshots: query by area + time, spatial lookup
CREATE INDEX idx_traffic_area_time ON traffic_snapshots(area_id, timestamp DESC);
CREATE INDEX idx_traffic_point ON traffic_snapshots USING GIST(location_point);

-- predictions: query by area + date + confidence, spatial lookup
CREATE INDEX idx_predictions_area_date ON predictions(area_id, predicted_date, confidence DESC);
CREATE INDEX idx_predictions_point ON predictions USING GIST(location_point);

-- alerts: active alerts per area
CREATE INDEX idx_alerts_area_active ON alerts(area_id, is_active, detected_at DESC);

-- daily_rosters: lookup by sector + date
CREATE INDEX idx_rosters_sector_date ON daily_rosters(sector_id, roster_date DESC);

-- roster_entries: lookup by roster and staff
CREATE INDEX idx_roster_entries_roster ON roster_entries(roster_id);
CREATE INDEX idx_roster_entries_staff ON roster_entries(staff_id);

-- areas: spatial boundary queries
CREATE INDEX idx_areas_boundary ON areas USING GIST(boundary);

-- sessions: lookup by user, expiry cleanup
CREATE INDEX idx_sessions_user ON sessions(user_id, user_type);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- staff_members: lookup by area and sector
CREATE INDEX idx_staff_members_area ON staff_members(area_id);
CREATE INDEX idx_staff_members_sector ON staff_members(sector_id);

-- ============================================================
-- TRIGGERS: auto-update updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_dsp_users_updated_at
  BEFORE UPDATE ON dsp_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_areas_updated_at
  BEFORE UPDATE ON areas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_staff_members_updated_at
  BEFORE UPDATE ON staff_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_daily_rosters_updated_at
  BEFORE UPDATE ON daily_rosters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_roster_entries_updated_at
  BEFORE UPDATE ON roster_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
