-- ============================================
-- TimePick - Email Templates : bouton CTA « Choisir un nouveau créneau »
-- ============================================
-- Created: 2026-06-17
-- Purpose: Remplace la phrase passive « Veuillez consulter le calendrier pour
--          choisir un autre créneau disponible. » dans le bloc figé du template
--          `cancellation_confirmation` par un bouton CTA pointant vers la page
--          publique du même événement (`{{calendar_url}}`), pour inciter le
--          membre à re-réserver directement depuis l'email.
--
--   Avant : <mj-text padding-bottom="8px">Veuillez consulter le calendrier pour choisir un autre créneau disponible.</mj-text>
--
--   Après : <mj-button href="{{calendar_url}}" font-weight="bold" padding="20px 0">Choisir un nouveau créneau</mj-button>
--
--   Plain REPLACE (pas de CASE/WHEN) : la ligne cible est dans la zone figée,
--   donc identique dans le corps personnalisé et le corps factory — même
--   justification que la migration 031.
--
-- Reversibility: rollback script retiré — politique forward-only.
--                Urgence : git revert du SQL + correctif SQL manuel / restauration backup.
--
-- SSOT — Le skeleton TS SYSTEM_TEMPLATE_SKELETONS (`cancellation_confirmation`,
--         champ `afterIntroBeforeSig`) dans
--         `server/src/services/email-templates.service.ts` a été mis à jour en
--         synchro, ainsi que la constante SYSTEM_FIXED_MIDDLE dans
--         `client/src/components/admin/email-editor/systemCanvas.ts`.
-- ============================================

UPDATE email_templates
SET
  body_mjml = REPLACE(
    body_mjml,
    '<mj-text padding-bottom="8px">Veuillez consulter le calendrier pour choisir un autre créneau disponible.</mj-text>',
    '<mj-button href="{{calendar_url}}" font-weight="bold" padding="20px 0">Choisir un nouveau créneau</mj-button>'
  ),
  default_body_mjml = REPLACE(
    default_body_mjml,
    '<mj-text padding-bottom="8px">Veuillez consulter le calendrier pour choisir un autre créneau disponible.</mj-text>',
    '<mj-button href="{{calendar_url}}" font-weight="bold" padding="20px 0">Choisir un nouveau créneau</mj-button>'
  )
WHERE template_key = 'cancellation_confirmation';

-- ============================================
-- End of Migration 032
-- ============================================
