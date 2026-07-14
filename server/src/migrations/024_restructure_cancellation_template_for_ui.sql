-- ============================================
-- TimePick - Email Templates: restructurer le body cancellation_confirmation pour l'éditeur UI 2-zones
-- ============================================
-- Created: 2026-06-16
-- Purpose: restructure le body_mjml (et default_body_mjml) de la row
--          'cancellation_confirmation' pour le rendre compatible avec
--          l'éditeur système 2-zones (intro + signature) de Paramètres >
--          Modèles d'emails. La row et la CHECK constraint existent depuis
--          la migration 013 — seul le contenu des colonnes body_mjml et
--          default_body_mjml change.
--
--          Changements visuels assumés (voir contrat) :
--            • INTRO : 2 mj-text fusionnés en 1 (gras {{user_name}} retiré) ;
--            • SIG   : formatage HTML inline (<br/><strong>) supprimé → texte
--                      simple compatible parse/compose round-trip.
--
--          PAS de modification de la CHECK constraint (cancellation_confirmation
--          est déjà une valeur autorisée depuis 013 et confirmée par 023).
--
-- Reversibility: rollback script retiré — politique forward-only.
--                Urgence : git revert du SQL + correctif SQL manuel / restauration backup.
--
-- SSOT — Le nouveau corps ci-dessous est dupliqué dans la constante TS
--         SYSTEM_TEMPLATE_SKELETONS['cancellation_confirmation'] dans
--         `server/src/services/email-templates.service.ts`. Toute évolution
--         doit mettre à jour LES DEUX endroits en synchro byte-exact. Le SQL
--         ne peut pas importer le module TS au runtime du runner de migrations ;
--         la duplication est volontaire et tracée. Pattern miroir 013/023.
-- ============================================

-- UPDATE idempotent : si l'admin a personnalisé body_mjml (≠ default), on le
-- préserve ; on rafraîchit toujours default_body_mjml vers le nouveau corps.
UPDATE email_templates
SET
  body_mjml = CASE WHEN body_mjml = default_body_mjml THEN $mjml$<mj-section padding="20px">
  <mj-column>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">Bonjour {{user_name}}, nous vous informons que le créneau de participation suivant a été annulé :</mj-text>
    <!-- INTRO:END -->
    <mj-text padding-bottom="4px"><strong>Événement :</strong> {{event_name}}</mj-text>
    <mj-text padding-bottom="4px"><strong>Date :</strong> {{slot_date}}</mj-text>
    <mj-text padding-bottom="8px"><strong>Horaires :</strong> {{slot_time}}</mj-text>
    <mj-text padding-bottom="8px">{{cancellation_reason}}</mj-text>
    <mj-text padding-bottom="8px">Veuillez consulter le calendrier pour choisir un autre créneau disponible.</mj-text>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" padding-top="0">Cordialement, L'équipe d'organisation</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>$mjml$ ELSE body_mjml END,
  default_body_mjml = $mjml$<mj-section padding="20px">
  <mj-column>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">Bonjour {{user_name}}, nous vous informons que le créneau de participation suivant a été annulé :</mj-text>
    <!-- INTRO:END -->
    <mj-text padding-bottom="4px"><strong>Événement :</strong> {{event_name}}</mj-text>
    <mj-text padding-bottom="4px"><strong>Date :</strong> {{slot_date}}</mj-text>
    <mj-text padding-bottom="8px"><strong>Horaires :</strong> {{slot_time}}</mj-text>
    <mj-text padding-bottom="8px">{{cancellation_reason}}</mj-text>
    <mj-text padding-bottom="8px">Veuillez consulter le calendrier pour choisir un autre créneau disponible.</mj-text>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" padding-top="0">Cordialement, L'équipe d'organisation</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>$mjml$
WHERE template_key = 'cancellation_confirmation';

-- ============================================
-- End of Migration 024
-- ============================================
