-- ============================================
-- TimePick - Email Templates : bouton CTA « Voir les créneaux disponibles »
-- ============================================
-- Created: 2026-06-17
-- Purpose: Remplace la phrase passive « Vous pouvez vous réinscrire à tout
--          moment depuis le calendrier si vous changez d'avis. » dans le bloc
--          figé du template `unregistration_confirmation` par un bouton CTA
--          pointant vers la page publique du même événement (`{{calendar_url}}`),
--          pour permettre au membre désinscrit de se réinscrire directement
--          depuis l'email. Homogène avec `cancellation_confirmation` (mig. 032).
--
--   Avant : <mj-text padding-bottom="8px">Vous pouvez vous réinscrire à tout moment depuis le calendrier si vous changez d'avis.</mj-text>
--
--   Après : <mj-button href="{{calendar_url}}" font-weight="bold" padding="20px 0">Voir les créneaux disponibles</mj-button>
--
--   Plain REPLACE (pas de CASE/WHEN) : la ligne cible est dans la zone figée,
--   donc identique dans le corps personnalisé et le corps factory — même
--   justification que les migrations 031/032. L'apostrophe de « d'avis » est
--   doublée ('') dans le littéral SQL.
--
-- Reversibility: rollback script retiré — politique forward-only.
--                Urgence : git revert du SQL + correctif SQL manuel / restauration backup.
--
-- SSOT — Le skeleton TS SYSTEM_TEMPLATE_SKELETONS (`unregistration_confirmation`,
--         champ `afterIntroBeforeSig`) dans
--         `server/src/services/email-templates.service.ts` a été mis à jour en
--         synchro, ainsi que la constante SYSTEM_FIXED_MIDDLE dans
--         `client/src/components/admin/email-editor/systemCanvas.ts`.
-- ============================================

UPDATE email_templates
SET
  body_mjml = REPLACE(
    body_mjml,
    '<mj-text padding-bottom="8px">Vous pouvez vous réinscrire à tout moment depuis le calendrier si vous changez d''avis.</mj-text>',
    '<mj-button href="{{calendar_url}}" font-weight="bold" padding="20px 0">Voir les créneaux disponibles</mj-button>'
  ),
  default_body_mjml = REPLACE(
    default_body_mjml,
    '<mj-text padding-bottom="8px">Vous pouvez vous réinscrire à tout moment depuis le calendrier si vous changez d''avis.</mj-text>',
    '<mj-button href="{{calendar_url}}" font-weight="bold" padding="20px 0">Voir les créneaux disponibles</mj-button>'
  )
WHERE template_key = 'unregistration_confirmation';

-- ============================================
-- End of Migration 033
-- ============================================
