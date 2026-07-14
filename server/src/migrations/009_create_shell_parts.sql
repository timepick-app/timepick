-- ============================================
-- TimePick - Shell Parts (Email Shell Policy)
-- ============================================
-- Story: E26.S1 / 26.1 — Table shell_parts + résolveur cascade
-- Created: 2026-05-14
-- Purpose: Persistence layer for the 3-block email shell (header, body,
--          footer) inherited along a cascade owner: event -> template ->
--          brand -> hardcoded fallback. Replaces the figé buildShell()
--          composition in render-email.service.ts with a server-resolved
--          shell composed from rows of this table.
--
-- Reversibility: rollback script retiré — politique forward-only.
--                Urgence : git revert du SQL + correctif SQL manuel / restauration backup.
--
-- Backfill policy: NO BACKFILL (per the email-shell customization policy, § Backfill).
--                  Post-009-fresh, the table is empty: every block resolves
--                  to `origin='hardcoded'` via the fallback module, and the
--                  rendered shell is byte-identical to the pre-26-1 output
--                  (boussole de régression = 26-0 snapshots).
-- ============================================
-- Maintenance notes (READ before editing):
--
--   1. owner_id is TEXT (not UUID) on purpose. The cascade stores THREE
--      identifier conventions, one per owner_kind:
--        - owner_kind='event'    -> owner_id = events.id (UUID)
--        - owner_kind='template' -> owner_id = email_templates.template_key
--                                   ('invitation', 'magic_link_login', ...)
--        - owner_kind='brand'    -> owner_id = '1' (singleton)
--      Type-safety per convention is enforced in shell-parts.service.ts
--      (camelCase DTO) and shell-resolver.service.ts (cascade lookup).
--
--   2. The UNIQUE index (owner_kind, owner_id, part_kind) is REQUIRED for
--      the ON CONFLICT upsert pattern in shell-parts.service.ts. Removing
--      it breaks idempotent writes. Keep names stable —
--      shell_parts_owner_part_unique is referenced verbatim by the DB
--      smoke tests.
--
--   3. The CHECK constraints on owner_kind and part_kind lock the allowed
--      values at schema level. Adding a 4th part (e.g. 'banner') or a 4th
--      owner_kind requires a new migration that DROP/ADD CONSTRAINT —
--      do NOT silently amend this file (the constraint won't update on
--      an already-migrated DB).
-- ============================================

CREATE TABLE IF NOT EXISTS shell_parts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_kind VARCHAR(16) NOT NULL,
    owner_id TEXT NOT NULL,
    part_kind VARCHAR(16) NOT NULL,
    content_mjml TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT shell_parts_owner_kind_check
        CHECK (owner_kind IN ('brand', 'template', 'event')),
    CONSTRAINT shell_parts_part_kind_check
        CHECK (part_kind IN ('header', 'body', 'footer'))
);

-- One header (or body, or footer) per owner. Required for ON CONFLICT upserts.
CREATE UNIQUE INDEX IF NOT EXISTS shell_parts_owner_part_unique
    ON shell_parts (owner_kind, owner_id, part_kind);

-- Trigger for updated_at (reuses update_updated_at_column from migration 001).
DROP TRIGGER IF EXISTS update_shell_parts_updated_at ON shell_parts;
CREATE TRIGGER update_shell_parts_updated_at
    BEFORE UPDATE ON shell_parts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE shell_parts IS 'Cascade-resolved blocks composing the email shell (header, body, footer). Three owner levels: brand singleton, default template per template_key, per-event override. Read order: event > template > brand > hardcoded fallback (in code). NO BACKFILL — empty table is the canonical post-deploy state.';
COMMENT ON COLUMN shell_parts.id IS 'Surrogate row PK. Lookups use the (owner_kind, owner_id, part_kind) unique tuple, not this UUID.';
COMMENT ON COLUMN shell_parts.owner_kind IS 'Cascade level: brand (singleton), template (per template_key), or event (per UUID). CHECK enforces the enum at schema level.';
COMMENT ON COLUMN shell_parts.owner_id IS 'Per-convention identifier: UUID for owner_kind=event, template_key string for owner_kind=template, ''1'' for owner_kind=brand. TEXT to accommodate the three shapes.';
COMMENT ON COLUMN shell_parts.part_kind IS 'Shell block kind: header, body, or footer. In 26-1, body cascade is NOT consumed at read (gel volontaire — body stays read from email_templates / events.invitation_mjml). Writes for part_kind=body are accepted for forward-compat (S2/S3 may seed them) but ignored by shell-resolver.service.ts.';
COMMENT ON COLUMN shell_parts.content_mjml IS 'MJML fragment for this block. Validated by shell-content.validator.ts (Zod whitelist).';
