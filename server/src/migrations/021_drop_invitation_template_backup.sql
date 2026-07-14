-- ============================================
-- TimePick - Drop forensic backup column events.invitation_template_backup
-- ============================================
-- Created: 2026-06-14
-- Purpose: Complete the E4 cleanup that migration 008 promised. Migration 008
--          (2026-05-03) dropped the legacy events.invitation_template column but
--          retained events.invitation_template_backup as a >=30-day forensic
--          recovery window, stating "a follow-up migration (009) will drop the
--          backup column after the rollback window closes". Migration 009 created
--          shell_parts instead and never dropped the backup column. The window
--          closed 2026-06-02; the column is referenced by NO application code
--          (services / controllers / db / client / tests — verified). This
--          migration completes the cleanup.
--
-- Idempotency: DROP COLUMN IF EXISTS makes this safe to re-run.
--
-- Reversibility: intentionally NONE. The 30-day forensic window is closed by
--          design; rollback-008-drop-invitation-template.ts (which restored data
--          from this column) is retired together with this migration.
-- ============================================

BEGIN;

ALTER TABLE events DROP COLUMN IF EXISTS invitation_template_backup;

COMMIT;
