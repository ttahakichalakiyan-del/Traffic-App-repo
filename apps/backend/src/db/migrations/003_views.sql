-- ============================================================
-- CTPL Traffic Command System — Views & Triggers
-- ============================================================

-- ============================================================
-- VIEW 1: v_on_duty_staff
-- Real-time view joining staff, latest location, today's roster
-- ============================================================
CREATE OR REPLACE VIEW v_on_duty_staff AS
SELECT
  sm.id AS staff_id,
  sm.badge_id,
  sm.full_name,
  sm.rank,
  sm.designation,
  sm.phone,
  sm.device_token,
  sm.is_on_duty,
  sm.last_seen_at,
  sm.area_id,
  sm.sector_id,
  s.name AS sector_name,
  s.color_hex AS sector_color,
  sl.lat,
  sl.lng,
  sl.accuracy,
  sl.battery_level,
  sl.timestamp AS last_ping_at,
  EXTRACT(EPOCH FROM (now() - sl.timestamp)) / 60 AS minutes_since_ping,
  CASE
    WHEN sl.timestamp < now() - INTERVAL '3 minutes' THEN true
    ELSE false
  END AS is_location_stale,
  re.duty_category_id,
  dc.name AS duty_category_name,
  re.duty_location AS todays_duty_location,
  re.beat_route,
  re.shift_start,
  re.shift_end
FROM staff_members sm
LEFT JOIN sectors s ON sm.sector_id = s.id
LEFT JOIN LATERAL (
  SELECT *
  FROM staff_locations
  WHERE staff_id = sm.id
  ORDER BY timestamp DESC
  LIMIT 1
) sl ON true
LEFT JOIN daily_rosters dr
  ON dr.sector_id = sm.sector_id
  AND dr.roster_date = CURRENT_DATE
  AND dr.status = 'published'
LEFT JOIN roster_entries re
  ON re.roster_id = dr.id
  AND re.staff_id = sm.id
LEFT JOIN duty_categories dc
  ON re.duty_category_id = dc.id
WHERE sm.is_active = true;

-- ============================================================
-- VIEW 2: v_daily_roster_full
-- Denormalized roster view for PDF generation and display
-- ============================================================
CREATE OR REPLACE VIEW v_daily_roster_full AS
SELECT
  dr.id AS roster_id,
  dr.roster_date,
  dr.status,
  dr.notes,
  dr.published_at,
  dr.total_staff_count,
  dr.assigned_staff_count,
  s.id AS sector_id,
  s.name AS sector_name,
  s.color_hex AS sector_color,
  a.id AS area_id,
  a.name AS area_name,
  dsp.full_name AS dsp_name,
  dsp.badge_number AS dsp_badge,
  re.id AS entry_id,
  re.duty_location,
  re.beat_route,
  re.shift_start,
  re.shift_end,
  re.notes AS entry_notes,
  dc.name AS duty_category,
  dc.name_urdu AS duty_category_urdu,
  dc.sort_order AS category_sort_order,
  sm.id AS staff_id,
  sm.full_name AS staff_name,
  sm.badge_id AS staff_badge,
  sm.rank AS staff_rank,
  sm.designation AS staff_designation
FROM daily_rosters dr
JOIN sectors s ON dr.sector_id = s.id
JOIN areas a ON s.area_id = a.id
LEFT JOIN dsp_users dsp ON dr.created_by_dsp_id = dsp.id
LEFT JOIN roster_entries re ON re.roster_id = dr.id
LEFT JOIN staff_members sm ON re.staff_id = sm.id
LEFT JOIN duty_categories dc ON re.duty_category_id = dc.id
ORDER BY dr.roster_date DESC, dc.sort_order, sm.full_name;

-- ============================================================
-- TRIGGER: auto-update assigned_staff_count on roster_entries
-- ============================================================
CREATE OR REPLACE FUNCTION update_roster_staff_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE daily_rosters
    SET assigned_staff_count = assigned_staff_count + 1
    WHERE id = NEW.roster_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE daily_rosters
    SET assigned_staff_count = assigned_staff_count - 1
    WHERE id = OLD.roster_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_roster_count
  AFTER INSERT OR DELETE ON roster_entries
  FOR EACH ROW EXECUTE FUNCTION update_roster_staff_count();

-- ============================================================
-- TRIGGER: auto-update staff_members.last_seen_at on location insert
-- ============================================================
CREATE OR REPLACE FUNCTION update_staff_last_seen()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE staff_members
  SET last_seen_at = NEW.timestamp
  WHERE id = NEW.staff_id
    AND (last_seen_at IS NULL OR NEW.timestamp > last_seen_at);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_last_seen
  AFTER INSERT ON staff_locations
  FOR EACH ROW EXECUTE FUNCTION update_staff_last_seen();
