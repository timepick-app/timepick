-- ============================================
-- Migration 003: Add event.end column for hybrid TTL
-- ============================================
-- Adds a cached end time column that stores MAX(slots.end_time)
-- Refreshed automatically via triggers when slots change
--
-- Purpose: Enable intelligent magic link TTL calculation based on event duration
-- Formula: TTL = min(event.end - now, configured.maxTTL)
--
-- Created: 2026-02-06
-- Phase: 14-hybrid-ttl
-- Plan: 14-01
-- ============================================

-- Step 1: Add the column (nullable, TIMESTAMP WITHOUT TIME ZONE)
-- Note: events table already has end_date column (unused)
-- This new 'end' column will be used for hybrid TTL calculation
-- Note: "end" is a reserved keyword, must be quoted
ALTER TABLE events ADD COLUMN IF NOT EXISTS "end" TIMESTAMP WITHOUT TIME ZONE;

-- Step 2: Add index for queries filtering by event end
CREATE INDEX IF NOT EXISTS idx_events_end ON events("end");

-- Step 3: Add comment for documentation
COMMENT ON COLUMN events."end" IS 'Cached end time from MAX(slots.end_time). NULL = no slots. Refreshed by trigger on slot changes.';

-- Step 4: Backfill existing events
-- Cast from TIMESTAMP WITH TIME ZONE (slots) to WITHOUT TIME ZONE (events)
UPDATE events e
SET "end" = (
  SELECT MAX(s.end_time)::timestamp without time zone
  FROM slots s
  WHERE s.event_id = e.id
);

-- Step 5: Create trigger function to refresh event."end" when slots change
CREATE OR REPLACE FUNCTION refresh_event_end()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- New slot added: recalculate MAX(end_time) for the event
    UPDATE events
    SET "end" = (
      SELECT MAX(end_time)::timestamp without time zone
      FROM slots
      WHERE event_id = NEW.event_id
    )
    WHERE id = NEW.event_id;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Slot end_time changed: recalculate MAX(end_time) for the event
    UPDATE events
    SET "end" = (
      SELECT MAX(end_time)::timestamp without time zone
      FROM slots
      WHERE event_id = NEW.event_id
    )
    WHERE id = NEW.event_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Slot deleted: recalculate MAX(end_time) for the event
    -- (may be NULL if this was the last slot)
    UPDATE events
    SET "end" = (
      SELECT MAX(end_time)::timestamp without time zone
      FROM slots
      WHERE event_id = OLD.event_id
    )
    WHERE id = OLD.event_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create triggers on slots table
-- Drop existing triggers first to avoid conflicts if re-running
DROP TRIGGER IF EXISTS refresh_event_end_on_insert ON slots;
CREATE TRIGGER refresh_event_end_on_insert
  AFTER INSERT ON slots
  FOR EACH ROW
  EXECUTE FUNCTION refresh_event_end();

DROP TRIGGER IF EXISTS refresh_event_end_on_update ON slots;
CREATE TRIGGER refresh_event_end_on_update
  AFTER UPDATE OF end_time ON slots
  FOR EACH ROW
  EXECUTE FUNCTION refresh_event_end();

DROP TRIGGER IF EXISTS refresh_event_end_on_delete ON slots;
CREATE TRIGGER refresh_event_end_on_delete
  AFTER DELETE ON slots
  FOR EACH ROW
  EXECUTE FUNCTION refresh_event_end();

-- ============================================
-- Verification
-- ============================================
-- Run this query to verify:
-- 1. Events with slots have end = MAX(end_time)
-- 2. Events without slots have end = NULL
--
-- SELECT e.id, e.name, e."end",
--        (SELECT MAX(end_time)::timestamp without time zone FROM slots WHERE event_id = e.id) as calculated_end,
--        (SELECT COUNT(*) FROM slots WHERE event_id = e.id) as slot_count
-- FROM events e
-- ORDER BY e.name;
--
-- Expected results:
-- - events."end" equals calculated_end for events with slots
-- - events."end" is NULL for events without slots
--
-- To verify triggers exist:
-- SELECT tgname FROM pg_trigger WHERE tgname LIKE 'refresh_event_end%';
-- Expected: 3 rows (refresh_event_end_on_insert, on_update, on_delete)
-- ============================================
