-- ============================================
-- TimePick - Drop legacy events.invitation_template column
-- ============================================
-- Story: E4.S3 / 25.3 — Email Service Integration & Legacy Cleanup
-- Created: 2026-05-03
-- Purpose: Drop the legacy events.invitation_template column. The data is
--          superseded by events.invitation_mjml (per-event override, added
--          in migration 006) + the email_templates table (default template
--          per templateKey). A shadow column invitation_template_backup is
--          retained for >=30 days post-merge to enable a forensic recovery
--          path (documented in the rollback runbook, section S6). A follow-up
--          migration (021) drops the backup column after the rollback
--          window closes.
--
-- Reversibility: the column-drop rollback path is documented in the
--                rollback runbook, section S3 (git revert + manual
--                ALTER ADD + restore from backup). The dedicated rollback-008
--                script was retired together with migration 021.
--
-- Idempotency: ADD COLUMN IF NOT EXISTS + WHERE invitation_template_backup
--              IS NULL guard on the UPDATE + DROP COLUMN IF EXISTS make
--              this migration safe to re-run on an already-applied DB.
-- ============================================
-- Maintenance notes (READ before editing):
--
--   1. Order matters: ADD shadow -> UPDATE -> DROP legacy. Reordering breaks
--      the data-preservation contract.
--
--   2. The shadow column invitation_template_backup is intentionally
--      named with the "_backup" suffix (not "_legacy" or "_old") because
--      it serves the rollback runbook's S3 alternative path -- this name is
--      referenced there verbatim.
--
--   3. NO DATA LOSS during forward migration: all non-NULL invitation_template
--      values are copied to invitation_template_backup before DROP. Empty
--      string values are also copied (UPDATE with WHERE invitation_template
--      IS NOT NULL only excludes true NULL).
-- ============================================

BEGIN;

ALTER TABLE events ADD COLUMN IF NOT EXISTS invitation_template_backup TEXT;

UPDATE events
   SET invitation_template_backup = invitation_template
 WHERE invitation_template IS NOT NULL
   AND invitation_template_backup IS NULL;

ALTER TABLE events DROP COLUMN IF EXISTS invitation_template;

-- NOTE: SELECT * queries in event.service.ts expose invitation_template_backup
-- via the snakeToCamel middleware. Public endpoints use explicit column lists
-- to avoid leaking the forensic column. Admin endpoints tolerate the exposure
-- as a temporary trade-off (column dropped by migration 021).

COMMENT ON COLUMN events.invitation_template_backup IS 'Forensic backup of pre-E4 events.invitation_template column. Retained >=30 days post-merge per the rollback runbook, section S6. Dropped by migration 021 once the rollback window closed.';

COMMIT;
