-- ============================================
-- TimePick - Email Templates System Markers
-- ============================================
-- Story: E2.S2 / 23.2 — API REST email-templates
-- Created: 2026-05-01
-- Purpose: Add INTRO:START/END and SIG:START/END MJML comment markers to
--          the three system template bodies (magic_link_login,
--          magic_link_recovery, reservation_confirmation). The markers wrap
--          a single <mj-text> each so the parser/composer pair in
--          email-templates.service.ts can extract and replace introText /
--          signatureText without touching the surrounding skeleton.
--
--          The invitation row is NOT touched (its body is edited as raw MJML
--          via the GrapesJS editor in E2.S3/S4).
--
-- Strategy: Option B+ from OPEN-Q-1 — no schema change, no new columns.
--           The markers are HTML comments that survive mjml→HTML compilation
--           as inert HTML comments. renderEmail() is NOT modified (AC15).
--
-- Idempotency: each UPDATE guards on
--      position('INTRO:START' in body_mjml) = 0
--   so re-running on an already-marked DB is a no-op.
--
-- Reversibility: rollback script retiré — politique forward-only.
--                Urgence : git revert du SQL + correctif SQL manuel / restauration backup.
-- ============================================

-- magic_link_login: collapse the two leading <mj-text> ("Bonjour," + "Voici
-- votre lien…") into one INTRO block, wrap the footer in SIG markers.
UPDATE email_templates
   SET body_mjml = $mjml$<mj-section padding="20px">
  <mj-column>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">Bonjour, voici votre lien de connexion à votre espace TimePick :</mj-text>
    <!-- INTRO:END -->
    <mj-button href="{{magic_link}}" font-weight="bold" padding="20px 0">Accéder à mon espace</mj-button>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" align="center" padding-top="0">Ce lien expire le {{expiration_date}}.</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>$mjml$,
       default_body_mjml = $mjml$<mj-section padding="20px">
  <mj-column>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">Bonjour, voici votre lien de connexion à votre espace TimePick :</mj-text>
    <!-- INTRO:END -->
    <mj-button href="{{magic_link}}" font-weight="bold" padding="20px 0">Accéder à mon espace</mj-button>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" align="center" padding-top="0">Ce lien expire le {{expiration_date}}.</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>$mjml$
 WHERE template_key = 'magic_link_login'
   AND position('INTRO:START' in body_mjml) = 0;

-- magic_link_recovery: collapse the two leading <mj-text> blocks, merge the
-- two trailing <mj-text> (expiry + security warning) into a single SIG block.
UPDATE email_templates
   SET body_mjml = $mjml$<mj-section padding="20px">
  <mj-column>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">Bonjour, vous avez demandé l'accès à vos codes de récupération TimePick. Cliquez sur le bouton ci-dessous pour les consulter :</mj-text>
    <!-- INTRO:END -->
    <mj-button href="{{magic_link}}" font-weight="bold" padding="20px 0">Consulter mes codes</mj-button>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" align="center" padding-top="0">Ce lien expire le {{expiration_date}}. Pour votre sécurité, ne partagez jamais ces codes.</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>$mjml$,
       default_body_mjml = $mjml$<mj-section padding="20px">
  <mj-column>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">Bonjour, vous avez demandé l'accès à vos codes de récupération TimePick. Cliquez sur le bouton ci-dessous pour les consulter :</mj-text>
    <!-- INTRO:END -->
    <mj-button href="{{magic_link}}" font-weight="bold" padding="20px 0">Consulter mes codes</mj-button>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" align="center" padding-top="0">Ce lien expire le {{expiration_date}}. Pour votre sécurité, ne partagez jamais ces codes.</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>$mjml$
 WHERE template_key = 'magic_link_recovery'
   AND position('INTRO:START' in body_mjml) = 0;

-- reservation_confirmation: collapse the three leading <mj-text> blocks
-- (Bonjour + confirmation + créneau) into one INTRO, wrap footer in SIG.
UPDATE email_templates
   SET body_mjml = $mjml$<mj-section padding="20px">
  <mj-column>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">Bonjour, votre réservation pour {{event_name}} est confirmée. Créneau : {{slot_date}} {{slot_time}}.</mj-text>
    <!-- INTRO:END -->
    <mj-button href="{{cancel_link}}" font-weight="bold" padding="20px 0">Annuler ma réservation</mj-button>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" align="center" padding-top="0">À très bientôt !</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>$mjml$,
       default_body_mjml = $mjml$<mj-section padding="20px">
  <mj-column>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">Bonjour, votre réservation pour {{event_name}} est confirmée. Créneau : {{slot_date}} {{slot_time}}.</mj-text>
    <!-- INTRO:END -->
    <mj-button href="{{cancel_link}}" font-weight="bold" padding="20px 0">Annuler ma réservation</mj-button>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" align="center" padding-top="0">À très bientôt !</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>$mjml$
 WHERE template_key = 'reservation_confirmation'
   AND position('INTRO:START' in body_mjml) = 0;

-- ============================================
-- End of Migration 007
-- ============================================
