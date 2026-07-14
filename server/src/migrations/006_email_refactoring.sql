-- ============================================
-- TimePick - Email Templates Refactoring (Foundation)
-- ============================================
-- Story: E1.S1 / 22.1 — Email Refactoring Foundation
-- Created: 2026-05-01
-- Purpose: Provision the persistence layer for the 3-level email template
--          hierarchy (brand identity → default templates → per-event override).
--          This migration is additive: it does NOT touch the legacy
--          events.invitation_template column (kept until Epic E4 cleanup) and
--          does NOT alter the existing email service. Subsequent stories
--          (E1.S2 renderEmail healthcheck, E1.S3a brand-settings API,
--          E1.S3b Settings UI) build on top of these tables and seeds.
--
-- Reversibility: rollback script retiré — politique forward-only.
--                Urgence : git revert du SQL + correctif SQL manuel / restauration backup.
--
-- ============================================
-- Maintenance notes (READ before editing):
--
--   1. The CHECK constraint on email_templates.template_key locks the four
--      allowed keys at schema level. Adding a 5th template (e.g.
--      'newsletter') requires a NEW migration that does
--      ALTER TABLE email_templates DROP CONSTRAINT email_templates_template_key_check
--      then re-adds it with the extended enum. Do NOT silently amend this
--      file — the constraint won't update on an already-migrated DB.
--
--   2. Brand identity tokens (primary_color, background_color, font_family,
--      button_border_radius) are NOT inlined in the seed MJML below. They
--      are injected at runtime by E1.S2's renderEmail() via <mj-attributes>
--      at the shell level (D-ext5). Do NOT add hex color literals or
--      font-family strings to the seed bodies — they would silently
--      override the brand-customized values for every admin.
--
--   3. INSERT ... ON CONFLICT DO NOTHING means: once a row exists in
--      email_brand_settings or email_templates, this seed will NEVER
--      overwrite it. To change a factory body for an environment where
--      006 has already been applied, write a NEW migration with an explicit
--      UPDATE statement (and remember to update default_body_mjml too).
--      Do NOT amend this file expecting the change to propagate — it won't.
-- ============================================

-- ============================================
-- TABLE: email_brand_settings
-- ============================================
-- Singleton row holding the brand identity (logo, colors, font, button radius).
-- The CHECK (id = 1) constraint enforces the singleton invariant at the DB
-- level — the global shell is unique and shared (D-ext4, prd.md:457).
CREATE TABLE IF NOT EXISTS email_brand_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    logo_url TEXT,
    primary_color VARCHAR(7) NOT NULL DEFAULT '#18181b',
    background_color VARCHAR(7) NOT NULL DEFAULT '#ffffff',
    font_family VARCHAR(64) NOT NULL DEFAULT 'Inter, Arial, sans-serif',
    button_border_radius SMALLINT NOT NULL DEFAULT 4,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT email_brand_settings_singleton CHECK (id = 1)
);

-- Trigger for updated_at (reuses update_updated_at_column from migration 001).
DROP TRIGGER IF EXISTS update_email_brand_settings_updated_at ON email_brand_settings;
CREATE TRIGGER update_email_brand_settings_updated_at
    BEFORE UPDATE ON email_brand_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE email_brand_settings IS 'Singleton row holding the email brand identity (logo, colors, font, button radius). One row only — enforced by CHECK (id = 1).';
COMMENT ON COLUMN email_brand_settings.id IS 'Always 1 — singleton enforcement via CHECK constraint.';
COMMENT ON COLUMN email_brand_settings.logo_url IS 'Optional path/URL of the brand logo (uploaded via /api/admin/uploads/email-image in E1.S3b). NULL = no logo, render falls back to text header.';
COMMENT ON COLUMN email_brand_settings.primary_color IS 'CTA / button color as hex #RRGGBB. Default mirrors the legacy DEFAULT_INVITATION_TEMPLATE header (#18181b). Injected at runtime by renderEmail() — do not inline in seed bodies.';
COMMENT ON COLUMN email_brand_settings.background_color IS 'Email body background color as hex #RRGGBB. Injected at runtime — do not inline in seed bodies.';
COMMENT ON COLUMN email_brand_settings.font_family IS 'Font stack used by the shell (raw value; the curated allowlist lives in the API/UI Zod schema in S3a/S3b). Injected at runtime — do not inline in seed bodies.';
COMMENT ON COLUMN email_brand_settings.button_border_radius IS 'Button border radius in pixels (0-32 expected; UI/API enforce the bound).';

-- ============================================
-- TABLE: email_templates
-- ============================================
-- Default MJML body fragment for each transactional email. Each row stores
-- BOTH the current admin-edited body (`body_mjml`) and the frozen factory
-- body (`default_body_mjml`) so that the Reset-to-factory action in E2 can
-- restore the original without re-fetching from disk (D-ext6, prd.md:459).
CREATE TABLE IF NOT EXISTS email_templates (
    template_key VARCHAR(64) PRIMARY KEY,
    body_mjml TEXT NOT NULL,
    default_body_mjml TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT email_templates_template_key_check
        CHECK (template_key IN (
            'invitation',
            'magic_link_login',
            'magic_link_recovery',
            'reservation_confirmation'
        ))
);

DROP TRIGGER IF EXISTS update_email_templates_updated_at ON email_templates;
CREATE TRIGGER update_email_templates_updated_at
    BEFORE UPDATE ON email_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE email_templates IS 'Per-key MJML body fragments for transactional emails (invitation, magic link login/recovery, reservation confirmation). Bodies only — the shell is owned by the renderEmail service and injected at compile time.';
COMMENT ON COLUMN email_templates.template_key IS 'Discriminator: invitation | magic_link_login | magic_link_recovery | reservation_confirmation. CHECK constraint guards against typos — extending requires a new migration that ALTERs the constraint.';
COMMENT ON COLUMN email_templates.body_mjml IS 'Current admin-edited MJML body fragment (mj-section/mj-column/mj-text/mj-button). Initially equal to default_body_mjml at seed time.';
COMMENT ON COLUMN email_templates.default_body_mjml IS 'Frozen factory body — copied to body_mjml by Reset-to-factory in E2.';

-- ============================================
-- TABLE: events - Per-event invitation override
-- ============================================
-- Per-event MJML body override for the invitation template (Epic E3). NULL =
-- inherit the default template from email_templates. The legacy column
-- events.invitation_template stays in place until Epic E4's cleanup step.
ALTER TABLE events
ADD COLUMN IF NOT EXISTS invitation_mjml TEXT;

COMMENT ON COLUMN events.invitation_mjml IS 'Per-event MJML body override for the invitation template (E3). NULL = inherit the default template from email_templates.';

-- ============================================
-- SEED: email_brand_settings (factory defaults)
-- ============================================
-- Mirrors the visual defaults of the POC v2 starter and the legacy
-- DEFAULT_INVITATION_TEMPLATE header color. ON CONFLICT (id) DO NOTHING
-- preserves any admin edits applied between migration runs (idempotency).
INSERT INTO email_brand_settings (id, logo_url, primary_color, background_color, font_family, button_border_radius)
VALUES (1, NULL, '#18181b', '#ffffff', 'Inter, Arial, sans-serif', 4)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- SEED: email_templates (four factory bodies)
-- ============================================
-- Each body is a brand-token-agnostic MJML *fragment* (no <mjml>/<mj-head>/
-- <mj-body> wrappers — the shell is injected at runtime by E1.S2's
-- renderEmail). Variables follow the existing VariablesPayload contract in
-- mjml-compile.service.ts (event_name, event_description, magic_link,
-- expiration_date); additional variables (slot_date, slot_time, cancel_link)
-- are documented per template — extending VariablesPayload is E1.S2's job.
--
-- Important constraints (POC-era learnings, MEMORY.md):
--   - All MJML tags use the explicit-close form (e.g., <mj-image>...</mj-image>),
--     never the void form `/>` — grapesjs-mjml silently absorbs subsequent
--     siblings as children when given a self-closing tag.
--   - No bespoke data-* attrs (DOMPurify v3 ADD_URI_SAFE_ATTR allowlist).
--
-- The single INSERT below uses a VALUES-table to declare each MJML body
-- ONCE and then projects it as both body_mjml and default_body_mjml at
-- INSERT time. This guarantees AC5 (body_mjml = default_body_mjml at seed
-- time) by construction and removes the byte-duplication risk of two
-- parallel literal lists.
--
-- Open questions tracked in the story (not blocking this seed):
--   Q1: magic_link_recovery body shape — currently CTA-only. If E1.S2 needs
--       inline codes (mirror sendNewRecoveryCodesEmail), extend
--       VariablesPayload there and write a follow-up UPDATE migration.
--   Q2: reservation_confirmation uses slot_date/slot_time/cancel_link which
--       are NOT yet in VariablesPayload. E1.S2 should extend VariablesPayload;
--       until then renderEmail will leave the unknown placeholders empty.
--   Q3: NULL logo_url at factory — S2's healthcheck must handle the NULL
--       case gracefully (skip header logo block, not fail).

INSERT INTO email_templates (template_key, body_mjml, default_body_mjml)
SELECT template_key, body, body
FROM (VALUES
    -- invitation (variables: event_name, event_description, magic_link, expiration_date)
    (
        'invitation',
        $mjml$<mj-section background-color="#f9f9f9" padding="20px" border-radius="0 0 8px 8px">
  <mj-column>
    <mj-text font-size="20px" font-weight="bold" padding-bottom="16px">Invitation à {{event_name}}</mj-text>
    <mj-text padding-bottom="8px">Bonjour,</mj-text>
    <mj-text padding-bottom="8px">{{event_description}}</mj-text>
    <mj-text padding-bottom="8px">Pour accéder au calendrier et réserver votre créneau, cliquez sur le bouton ci-dessous :</mj-text>
    <mj-button href="{{magic_link}}" font-weight="bold" padding="20px 0">Réserver mon créneau</mj-button>
    <mj-text color="#999999" font-size="13px" align="center" padding-top="0">Ce lien expire le {{expiration_date}}.</mj-text>
  </mj-column>
</mj-section>$mjml$
    ),
    -- magic_link_login (variables: magic_link, expiration_date)
    (
        'magic_link_login',
        $mjml$<mj-section padding="20px">
  <mj-column>
    <mj-text padding-bottom="8px">Bonjour,</mj-text>
    <mj-text padding-bottom="8px">Voici votre lien de connexion à votre espace TimePick :</mj-text>
    <mj-button href="{{magic_link}}" font-weight="bold" padding="20px 0">Accéder à mon espace</mj-button>
    <mj-text color="#999999" font-size="13px" align="center" padding-top="0">Ce lien expire le {{expiration_date}}.</mj-text>
  </mj-column>
</mj-section>$mjml$
    ),
    -- magic_link_recovery (variables: magic_link, expiration_date)
    (
        'magic_link_recovery',
        $mjml$<mj-section padding="20px">
  <mj-column>
    <mj-text padding-bottom="8px">Bonjour,</mj-text>
    <mj-text padding-bottom="8px">Vous avez demandé l'accès à vos codes de récupération TimePick. Cliquez sur le bouton ci-dessous pour les consulter :</mj-text>
    <mj-button href="{{magic_link}}" font-weight="bold" padding="20px 0">Consulter mes codes</mj-button>
    <mj-text color="#999999" font-size="13px" align="center" padding-top="0">Ce lien expire le {{expiration_date}}.</mj-text>
    <mj-text color="#999999" font-size="12px" padding-top="8px">Pour votre sécurité, ne partagez jamais ces codes.</mj-text>
  </mj-column>
</mj-section>$mjml$
    ),
    -- reservation_confirmation (variables: event_name, slot_date, slot_time, cancel_link)
    (
        'reservation_confirmation',
        $mjml$<mj-section padding="20px">
  <mj-column>
    <mj-text padding-bottom="8px">Bonjour,</mj-text>
    <mj-text padding-bottom="8px">Votre réservation pour <strong>{{event_name}}</strong> est confirmée.</mj-text>
    <mj-text padding-bottom="8px">Créneau : <strong>{{slot_date}} {{slot_time}}</strong>.</mj-text>
    <mj-button href="{{cancel_link}}" font-weight="bold" padding="20px 0">Annuler ma réservation</mj-button>
    <mj-text color="#999999" font-size="13px" align="center" padding-top="0">À très bientôt !</mj-text>
  </mj-column>
</mj-section>$mjml$
    )
) AS t(template_key, body)
ON CONFLICT (template_key) DO NOTHING;

-- ============================================
-- End of Migration 006
-- ============================================
