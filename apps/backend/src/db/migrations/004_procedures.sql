-- ============================================================
-- CTPL Traffic Command System — Stored Procedures & Functions
-- ============================================================

-- ============================================================
-- STORED PROCEDURE 1: get_roster_summary
-- Returns JSON summary of all sectors for a DSP on a given date
-- ============================================================
CREATE OR REPLACE FUNCTION get_roster_summary(p_dsp_id UUID, p_date DATE)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(sector_data) INTO result
  FROM (
    SELECT
      s.id AS sector_id,
      s.name AS sector_name,
      s.color_hex AS sector_color,
      dr.id AS roster_id,
      COALESCE(dr.status, 'not_created') AS status,
      dr.published_at,
      COUNT(DISTINCT sm.id) AS total_staff,
      COALESCE(dr.assigned_staff_count, 0) AS assigned_count,
      COUNT(DISTINCT sm.id) - COALESCE(dr.assigned_staff_count, 0) AS unassigned_count,
      COALESCE(
        (SELECT json_agg(cat_data)
         FROM (
           SELECT dc.name, COUNT(re.id) AS count
           FROM roster_entries re
           JOIN duty_categories dc ON re.duty_category_id = dc.id
           WHERE re.roster_id = dr.id
           GROUP BY dc.name, dc.sort_order
           ORDER BY dc.sort_order
         ) cat_data
        ), '[]'::json
      ) AS category_breakdown,
      COALESCE(
        (SELECT json_agg(unassigned_data)
         FROM (
           SELECT sm2.id AS staff_id, sm2.badge_id, sm2.full_name, sm2.rank
           FROM staff_members sm2
           WHERE sm2.sector_id = s.id
             AND sm2.is_active = true
             AND sm2.id NOT IN (
               SELECT re2.staff_id FROM roster_entries re2 WHERE re2.roster_id = dr.id
             )
         ) unassigned_data
        ), '[]'::json
      ) AS unassigned_staff
    FROM sectors s
    LEFT JOIN daily_rosters dr ON dr.sector_id = s.id AND dr.roster_date = p_date
    LEFT JOIN staff_members sm ON sm.sector_id = s.id AND sm.is_active = true
    WHERE s.dsp_user_id = p_dsp_id AND s.is_active = true
    GROUP BY s.id, s.name, s.color_hex, dr.id, dr.status,
             dr.published_at, dr.assigned_staff_count
    ORDER BY s.display_order
  ) sector_data;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- STORED PROCEDURE 2: assign_staff_to_duty
-- Validates and assigns a staff member to a roster entry
-- ============================================================
CREATE OR REPLACE FUNCTION assign_staff_to_duty(
  p_roster_id UUID,
  p_staff_id UUID,
  p_category_id UUID,
  p_location VARCHAR DEFAULT NULL,
  p_notes VARCHAR DEFAULT NULL,
  p_shift_start TIME DEFAULT NULL,
  p_shift_end TIME DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_roster daily_rosters%ROWTYPE;
  v_staff staff_members%ROWTYPE;
  v_entry_id UUID;
BEGIN
  -- Get roster
  SELECT * INTO v_roster FROM daily_rosters WHERE id = p_roster_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'ROSTER_NOT_FOUND');
  END IF;

  -- Check not published
  IF v_roster.status = 'published' THEN
    RETURN json_build_object('success', false, 'error', 'ROSTER_ALREADY_PUBLISHED');
  END IF;

  -- Get staff
  SELECT * INTO v_staff FROM staff_members WHERE id = p_staff_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'STAFF_NOT_FOUND');
  END IF;

  -- Check staff in correct sector
  IF v_staff.sector_id != v_roster.sector_id THEN
    RETURN json_build_object('success', false, 'error', 'STAFF_WRONG_SECTOR');
  END IF;

  -- Check not already assigned today in ANY roster for same sector
  IF EXISTS (
    SELECT 1 FROM roster_entries re2
    JOIN daily_rosters dr2 ON re2.roster_id = dr2.id
    WHERE re2.staff_id = p_staff_id
      AND dr2.roster_date = v_roster.roster_date
      AND dr2.sector_id = v_roster.sector_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'STAFF_ALREADY_ASSIGNED');
  END IF;

  -- Insert entry
  INSERT INTO roster_entries (
    roster_id, staff_id, duty_category_id,
    duty_location, notes, shift_start, shift_end
  ) VALUES (
    p_roster_id, p_staff_id, p_category_id,
    p_location, p_notes, p_shift_start, p_shift_end
  ) RETURNING id INTO v_entry_id;

  RETURN json_build_object('success', true, 'entry_id', v_entry_id);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- STORED PROCEDURE 3: publish_roster
-- Publishes a draft roster after validation
-- ============================================================
CREATE OR REPLACE FUNCTION publish_roster(p_roster_id UUID, p_dsp_id UUID)
RETURNS JSON AS $$
DECLARE
  v_roster daily_rosters%ROWTYPE;
  v_total_staff INT;
  v_unassigned INT;
BEGIN
  SELECT * INTO v_roster FROM daily_rosters WHERE id = p_roster_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'ROSTER_NOT_FOUND');
  END IF;

  IF v_roster.created_by_dsp_id != p_dsp_id THEN
    RETURN json_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  SELECT COUNT(*) INTO v_total_staff
  FROM staff_members WHERE sector_id = v_roster.sector_id AND is_active = true;

  v_unassigned := v_total_staff - v_roster.assigned_staff_count;

  UPDATE daily_rosters
  SET status = 'published', published_at = now(), total_staff_count = v_total_staff
  WHERE id = p_roster_id;

  RETURN json_build_object(
    'success', true,
    'unassigned_staff_count', v_unassigned,
    'warning', CASE WHEN v_unassigned > 0
      THEN v_unassigned || ' staff unassigned'
      ELSE NULL END
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: get_unassigned_staff
-- Returns staff not yet assigned to a given roster
-- ============================================================
CREATE OR REPLACE FUNCTION get_unassigned_staff(p_roster_id UUID)
RETURNS TABLE (
  staff_id UUID,
  badge_id VARCHAR,
  full_name VARCHAR,
  rank VARCHAR,
  designation VARCHAR
) AS $$
DECLARE
  v_sector_id UUID;
BEGIN
  SELECT sector_id INTO v_sector_id FROM daily_rosters WHERE id = p_roster_id;

  RETURN QUERY
  SELECT sm.id, sm.badge_id, sm.full_name, sm.rank, sm.designation
  FROM staff_members sm
  WHERE sm.sector_id = v_sector_id
    AND sm.is_active = true
    AND sm.id NOT IN (
      SELECT re.staff_id FROM roster_entries re WHERE re.roster_id = p_roster_id
    )
  ORDER BY sm.full_name;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: get_roster_hotspots
-- Returns top duty locations from the last 7 days for a DSP
-- ============================================================
CREATE OR REPLACE FUNCTION get_roster_hotspots(p_dsp_id UUID, p_limit INT DEFAULT 10)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_agg(hotspot_data)
    FROM (
      SELECT
        re.duty_location AS location,
        COUNT(*) AS usage_count,
        json_agg(DISTINCT dc.name) AS categories
      FROM roster_entries re
      JOIN daily_rosters dr ON re.roster_id = dr.id
      JOIN sectors s ON dr.sector_id = s.id
      JOIN duty_categories dc ON re.duty_category_id = dc.id
      WHERE s.dsp_user_id = p_dsp_id
        AND dr.roster_date >= CURRENT_DATE - INTERVAL '7 days'
        AND re.duty_location IS NOT NULL
        AND re.duty_location != ''
      GROUP BY re.duty_location
      ORDER BY usage_count DESC
      LIMIT p_limit
    ) hotspot_data
  );
END;
$$ LANGUAGE plpgsql;
