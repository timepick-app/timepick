-- ============================================
-- TimePick - Email Templates : salutation dans la zone intro éditable
-- ============================================
-- Created: 2026-06-17
-- Purpose: Déplace « Bonjour {{user_first_name}}, » du bloc figé situé avant
--          <!-- INTRO:START --> vers le début du contenu de la zone intro pour
--          les 7 templates 2-zones système. La salutation devient ainsi la 1ʳᵉ
--          ligne éditable de la zone intro, séparée du corps par une ligne vide.
--
--   Avant : <mj-text padding-bottom="16px">Bonjour {{user_first_name}},</mj-text>
--           <!-- INTRO:START -->
--           <mj-text padding-bottom="8px">corps intro...</mj-text>
--
--   Après : <!-- INTRO:START -->
--           <mj-text padding-bottom="8px">Bonjour {{user_first_name}},<br/><br/>corps intro...</mj-text>
--
--   Un seul REPLACE par colonne couvre body_mjml ET default_body_mjml. Le bloc
--   salutation était figé (non personnalisable), donc identique dans les corps
--   personnalisés et les corps factory.
--
--   NE touche PAS 'invitation' ni 'slot_modification' (pas de zone 2-zones).
--
-- Reversibility: rollback script retiré — politique forward-only.
--                Urgence : git revert du SQL + correctif SQL manuel / restauration backup.
--
-- SSOT — Les skeletons TS SYSTEM_TEMPLATE_SKELETONS dans
--         `server/src/services/email-templates.service.ts` ont été mis à jour
--         en synchro : le champ `before` ne contient plus le bloc salutation.
--         Les défauts d'intro (valeur de body_mjml/default_body_mjml ci-dessous)
--         commencent maintenant par « Bonjour {{user_first_name}},<br/><br/> ».
-- ============================================

-- -----------------------------------------------
-- (1) magic_link_login
-- -----------------------------------------------
UPDATE email_templates
SET
  body_mjml = REPLACE(
    body_mjml,
    '<mj-text padding-bottom="16px">Bonjour {{user_first_name}},</mj-text>'
      || E'\n    ' || '<!-- INTRO:START -->'
      || E'\n    ' || '<mj-text padding-bottom="8px">',
    '<!-- INTRO:START -->'
      || E'\n    ' || '<mj-text padding-bottom="8px">Bonjour {{user_first_name}},<br/><br/>'
  ),
  default_body_mjml = REPLACE(
    default_body_mjml,
    '<mj-text padding-bottom="16px">Bonjour {{user_first_name}},</mj-text>'
      || E'\n    ' || '<!-- INTRO:START -->'
      || E'\n    ' || '<mj-text padding-bottom="8px">',
    '<!-- INTRO:START -->'
      || E'\n    ' || '<mj-text padding-bottom="8px">Bonjour {{user_first_name}},<br/><br/>'
  )
WHERE template_key = 'magic_link_login';

-- -----------------------------------------------
-- (2) reservation_confirmation
-- -----------------------------------------------
UPDATE email_templates
SET
  body_mjml = REPLACE(
    body_mjml,
    '<mj-text padding-bottom="16px">Bonjour {{user_first_name}},</mj-text>'
      || E'\n    ' || '<!-- INTRO:START -->'
      || E'\n    ' || '<mj-text padding-bottom="8px">',
    '<!-- INTRO:START -->'
      || E'\n    ' || '<mj-text padding-bottom="8px">Bonjour {{user_first_name}},<br/><br/>'
  ),
  default_body_mjml = REPLACE(
    default_body_mjml,
    '<mj-text padding-bottom="16px">Bonjour {{user_first_name}},</mj-text>'
      || E'\n    ' || '<!-- INTRO:START -->'
      || E'\n    ' || '<mj-text padding-bottom="8px">',
    '<!-- INTRO:START -->'
      || E'\n    ' || '<mj-text padding-bottom="8px">Bonjour {{user_first_name}},<br/><br/>'
  )
WHERE template_key = 'reservation_confirmation';

-- -----------------------------------------------
-- (3) account_created
-- -----------------------------------------------
UPDATE email_templates
SET
  body_mjml = REPLACE(
    body_mjml,
    '<mj-text padding-bottom="16px">Bonjour {{user_first_name}},</mj-text>'
      || E'\n    ' || '<!-- INTRO:START -->'
      || E'\n    ' || '<mj-text padding-bottom="8px">',
    '<!-- INTRO:START -->'
      || E'\n    ' || '<mj-text padding-bottom="8px">Bonjour {{user_first_name}},<br/><br/>'
  ),
  default_body_mjml = REPLACE(
    default_body_mjml,
    '<mj-text padding-bottom="16px">Bonjour {{user_first_name}},</mj-text>'
      || E'\n    ' || '<!-- INTRO:START -->'
      || E'\n    ' || '<mj-text padding-bottom="8px">',
    '<!-- INTRO:START -->'
      || E'\n    ' || '<mj-text padding-bottom="8px">Bonjour {{user_first_name}},<br/><br/>'
  )
WHERE template_key = 'account_created';

-- -----------------------------------------------
-- (4) role_promoted
-- -----------------------------------------------
UPDATE email_templates
SET
  body_mjml = REPLACE(
    body_mjml,
    '<mj-text padding-bottom="16px">Bonjour {{user_first_name}},</mj-text>'
      || E'\n    ' || '<!-- INTRO:START -->'
      || E'\n    ' || '<mj-text padding-bottom="8px">',
    '<!-- INTRO:START -->'
      || E'\n    ' || '<mj-text padding-bottom="8px">Bonjour {{user_first_name}},<br/><br/>'
  ),
  default_body_mjml = REPLACE(
    default_body_mjml,
    '<mj-text padding-bottom="16px">Bonjour {{user_first_name}},</mj-text>'
      || E'\n    ' || '<!-- INTRO:START -->'
      || E'\n    ' || '<mj-text padding-bottom="8px">',
    '<!-- INTRO:START -->'
      || E'\n    ' || '<mj-text padding-bottom="8px">Bonjour {{user_first_name}},<br/><br/>'
  )
WHERE template_key = 'role_promoted';

-- -----------------------------------------------
-- (5) role_demoted
-- -----------------------------------------------
UPDATE email_templates
SET
  body_mjml = REPLACE(
    body_mjml,
    '<mj-text padding-bottom="16px">Bonjour {{user_first_name}},</mj-text>'
      || E'\n    ' || '<!-- INTRO:START -->'
      || E'\n    ' || '<mj-text padding-bottom="8px">',
    '<!-- INTRO:START -->'
      || E'\n    ' || '<mj-text padding-bottom="8px">Bonjour {{user_first_name}},<br/><br/>'
  ),
  default_body_mjml = REPLACE(
    default_body_mjml,
    '<mj-text padding-bottom="16px">Bonjour {{user_first_name}},</mj-text>'
      || E'\n    ' || '<!-- INTRO:START -->'
      || E'\n    ' || '<mj-text padding-bottom="8px">',
    '<!-- INTRO:START -->'
      || E'\n    ' || '<mj-text padding-bottom="8px">Bonjour {{user_first_name}},<br/><br/>'
  )
WHERE template_key = 'role_demoted';

-- -----------------------------------------------
-- (6) cancellation_confirmation
-- -----------------------------------------------
UPDATE email_templates
SET
  body_mjml = REPLACE(
    body_mjml,
    '<mj-text padding-bottom="16px">Bonjour {{user_first_name}},</mj-text>'
      || E'\n    ' || '<!-- INTRO:START -->'
      || E'\n    ' || '<mj-text padding-bottom="8px">',
    '<!-- INTRO:START -->'
      || E'\n    ' || '<mj-text padding-bottom="8px">Bonjour {{user_first_name}},<br/><br/>'
  ),
  default_body_mjml = REPLACE(
    default_body_mjml,
    '<mj-text padding-bottom="16px">Bonjour {{user_first_name}},</mj-text>'
      || E'\n    ' || '<!-- INTRO:START -->'
      || E'\n    ' || '<mj-text padding-bottom="8px">',
    '<!-- INTRO:START -->'
      || E'\n    ' || '<mj-text padding-bottom="8px">Bonjour {{user_first_name}},<br/><br/>'
  )
WHERE template_key = 'cancellation_confirmation';

-- -----------------------------------------------
-- (7) unregistration_confirmation
-- -----------------------------------------------
UPDATE email_templates
SET
  body_mjml = REPLACE(
    body_mjml,
    '<mj-text padding-bottom="16px">Bonjour {{user_first_name}},</mj-text>'
      || E'\n    ' || '<!-- INTRO:START -->'
      || E'\n    ' || '<mj-text padding-bottom="8px">',
    '<!-- INTRO:START -->'
      || E'\n    ' || '<mj-text padding-bottom="8px">Bonjour {{user_first_name}},<br/><br/>'
  ),
  default_body_mjml = REPLACE(
    default_body_mjml,
    '<mj-text padding-bottom="16px">Bonjour {{user_first_name}},</mj-text>'
      || E'\n    ' || '<!-- INTRO:START -->'
      || E'\n    ' || '<mj-text padding-bottom="8px">',
    '<!-- INTRO:START -->'
      || E'\n    ' || '<mj-text padding-bottom="8px">Bonjour {{user_first_name}},<br/><br/>'
  )
WHERE template_key = 'unregistration_confirmation';

-- ============================================
-- End of Migration 031
-- ============================================
