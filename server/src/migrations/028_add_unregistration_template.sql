-- ============================================
-- TimePick - Email Templates: extend template_key + seed unregistration_confirmation
-- ============================================
-- Created: 2026-06-16
-- Purpose: ajoute 'unregistration_confirmation' comme 9ᵉ valeur autorisée de
--          email_templates.template_key (CHECK constraint), puis seed le row
--          factory avec body_mjml + default_body_mjml. La fonction
--          sendUnregistrationEmail (server/src/services/email.service.ts)
--          consomme renderEmail({ templateKey: 'unregistration_confirmation', ... })
--          pour confirmer au membre sa désinscription VOLONTAIRE d'un créneau
--          (chemin cancelReservation / cancelReservationBySlot dans
--          reservation.service.ts). Distinct de 'cancellation_confirmation'
--          (annulation admin) qui reste inchangé.
--
--          DDL + DML combinés dans un seul fichier : aucune séparation utile
--          (le seed est conditionné à l'existence du templateKey autorisé par
--          la CHECK constraint élargie).
--
-- Reversibility: rollback script retiré — politique forward-only.
--                Urgence : git revert du SQL + correctif SQL manuel / restauration backup.
--
-- Backfill: aucun. Les 8 rows existantes restent intactes,
--           leurs body_mjml ne sont pas touchés.
-- ============================================
-- Maintenance notes (READ before editing):
--
--   1. La forme DROP/ADD CONSTRAINT est requise — un ALTER TABLE ne peut
--      pas modifier en place un CHECK existant en PostgreSQL. Pattern
--      documenté dans 009 § Maintenance notes (3), appliqué à l'identique
--      dans 010, 011, 013, 023, 025, 026 puis ici.
--
--   2. Les 8 valeurs existantes (post-027 : invitation, magic_link_login,
--      reservation_confirmation, cancellation_confirmation, account_created,
--      slot_modification, role_promoted, role_demoted) restent conformes à la
--      nouvelle contrainte : aucune row existante n'est modifiée par
--      l'élargissement de l'enum. Idempotent côté rows existantes.
--
--   3. SSOT — La valeur factory ci-dessous est dupliquée dans la constante
--      TS du skeleton SYSTEM_TEMPLATE_SKELETONS['unregistration_confirmation']
--      dans `server/src/services/email-templates.service.ts`. Toute évolution
--      doit mettre à jour LES DEUX endroits en synchro byte-exact
--      (les fragments structurels before/afterIntroBeforeSig/after du skeleton
--      doivent matcher le body SQL). Le SQL ne peut pas importer le module TS
--      au runtime du runner ; la duplication est volontaire et tracée.
--      Pattern miroir 013/023/026.
--
--   4. Variables MJML attendues côté renderEmail :
--      user_name, event_name, slot_date, slot_time.
--      AUCUNE variable cancellation_reason (absent volontairement — désinscription
--      volontaire du membre, aucune raison n'est applicable).
--
--   5. Markers INTRO:START/END et SIG:START/END présents par parité avec les
--      migrations 007/013/023/025/026. Ils permettent au projector d'extraire
--      l'intro et la signature séparément pour l'UI d'édition.
-- ============================================

-- Étape 1 : élargir la CHECK constraint à 9 valeurs.
ALTER TABLE email_templates
    DROP CONSTRAINT IF EXISTS email_templates_template_key_check;

ALTER TABLE email_templates
    ADD CONSTRAINT email_templates_template_key_check
        CHECK (template_key IN (
            'invitation',
            'magic_link_login',
            'reservation_confirmation',
            'cancellation_confirmation',
            'account_created',
            'slot_modification',
            'role_promoted',
            'role_demoted',
            'unregistration_confirmation'
        ));

COMMENT ON COLUMN email_templates.template_key IS 'Discriminator: invitation | magic_link_login | reservation_confirmation | cancellation_confirmation | account_created | slot_modification | role_promoted | role_demoted | unregistration_confirmation. CHECK constraint guards against typos — extending requires a new migration that ALTERs the constraint.';

-- Étape 2 : seed factory body_mjml pour unregistration_confirmation.
-- Idempotent via ON CONFLICT (template_key) DO NOTHING — pattern 006/023.
INSERT INTO email_templates (template_key, body_mjml, default_body_mjml)
SELECT template_key, body, body
FROM (VALUES
    (
        'unregistration_confirmation',
        $mjml$<mj-section padding="20px">
  <mj-column>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">Bonjour {{user_name}}, nous vous confirmons votre désinscription du créneau de participation suivant :</mj-text>
    <!-- INTRO:END -->
    <mj-text padding-bottom="4px"><strong>Événement :</strong> {{event_name}}</mj-text>
    <mj-text padding-bottom="4px"><strong>Date :</strong> {{slot_date}}</mj-text>
    <mj-text padding-bottom="8px"><strong>Horaires :</strong> {{slot_time}}</mj-text>
    <mj-text padding-bottom="8px">Vous pouvez vous réinscrire à tout moment depuis le calendrier si vous changez d'avis.</mj-text>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" padding-top="0">Cordialement, L'équipe d'organisation</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>$mjml$
    )
) AS t(template_key, body)
ON CONFLICT (template_key) DO NOTHING;

-- ============================================
-- End of Migration 028
-- ============================================
