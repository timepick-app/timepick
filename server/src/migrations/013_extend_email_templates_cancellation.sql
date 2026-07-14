-- ============================================
-- TimePick - Email Templates: extend template_key + seed cancellation_confirmation
-- ============================================
-- Created: 2026-05-26
-- Purpose: ajoute 'cancellation_confirmation' comme 5ᵉ valeur autorisée de
--          email_templates.template_key (CHECK constraint), puis seed le row
--          factory avec body_mjml + default_body_mjml. La fonction
--          sendSlotCancellationEmail (server/src/services/email.service.ts)
--          est refactorée dans le même chantier pour consommer
--          renderEmail({ templateKey: 'cancellation_confirmation', ... })
--          au lieu d'émettre du HTML inline, ce qui aligne le mail
--          d'annulation sur le shell standard (header noir, content-wrapper
--          #f9f9f9, footer brand) — cf. la politique de personnalisation des
--          enveloppes email.
--
--          DDL + DML combinés dans un seul fichier : aucune séparation
--          utile (le seed est conditionné à l'existence du templateKey
--          autorisé par la CHECK constraint étendue).
--
-- Reversibility: rollback script retiré — politique forward-only.
--                Urgence : git revert du SQL + correctif SQL manuel / restauration backup.
--
-- Backfill: aucun. Les 4 rows existantes (invitation, magic_link_login,
--           magic_link_recovery, reservation_confirmation) restent intactes,
--           leurs body_mjml ne sont pas touchés.
-- ============================================
-- Maintenance notes (READ before editing):
--
--   1. La forme DROP/ADD CONSTRAINT est requise — un ALTER TABLE ne peut
--      pas modifier en place un CHECK existant en PostgreSQL. Pattern
--      documenté dans 009 § Maintenance notes (3), appliqué à l'identique
--      dans 010, 011 puis ici.
--
--   2. Les 4 valeurs existantes (invitation, magic_link_login,
--      magic_link_recovery, reservation_confirmation) restent conformes à
--      la nouvelle contrainte : aucune row existante n'est modifiée par
--      l'élargissement de l'enum. Idempotent côté rows.
--
--   3. SSOT — La valeur factory ci-dessous est dupliquée dans la constante
--      TS `CANCELLATION_FACTORY_BODY_MJML` exportée par
--      `server/src/services/email.service.ts` (ou un module dédié si la
--      duplication grandit). Toute évolution doit mettre à jour LES DEUX
--      endroits en synchro byte-exact (le rollback 013 et les tests
--      consomment la constante TS). Le SQL ne peut pas importer le module
--      TS au runtime du runner de migrations ; la duplication est
--      volontaire et tracée. Pattern miroir 012.
--
--   4. Variables MJML attendues côté renderEmail : event_name, user_name,
--      slot_date, slot_time, cancellation_reason. Cette dernière est
--      pré-formattée côté service (HTML `<strong>Motif :</strong> ${reason}`
--      ou chaîne vide) — le moteur d'interpolation Mustache-like ne supporte
--      pas les blocs conditionnels. Cf. Design Notes du spec.
--
--   5. Markers INTRO:START/END et SIG:START/END présents par parité avec
--      la migration 007 sur les 3 modèles système (magic_link_login,
--      magic_link_recovery, reservation_confirmation). Ils permettent au
--      projector E1.S2 d'extraire l'intro et la signature séparément pour
--      l'UI d'édition future.
-- ============================================

-- Étape 1 : élargir la CHECK constraint à 5 valeurs.
ALTER TABLE email_templates
    DROP CONSTRAINT IF EXISTS email_templates_template_key_check;

ALTER TABLE email_templates
    ADD CONSTRAINT email_templates_template_key_check
        CHECK (template_key IN (
            'invitation',
            'magic_link_login',
            'magic_link_recovery',
            'reservation_confirmation',
            'cancellation_confirmation'
        ));

COMMENT ON COLUMN email_templates.template_key IS 'Discriminator: invitation | magic_link_login | magic_link_recovery | reservation_confirmation | cancellation_confirmation. CHECK constraint guards against typos — extending requires a new migration that ALTERs the constraint.';

-- Étape 2 : seed factory body_mjml pour cancellation_confirmation.
-- Idempotent via ON CONFLICT (template_key) DO NOTHING — pattern 006.
INSERT INTO email_templates (template_key, body_mjml, default_body_mjml)
SELECT template_key, body, body
FROM (VALUES
    (
        'cancellation_confirmation',
        $mjml$<mj-section padding="20px">
  <mj-column>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">Bonjour <strong>{{user_name}}</strong>,</mj-text>
    <mj-text padding-bottom="8px">Nous vous informons que le créneau de participation suivant a été annulé :</mj-text>
    <!-- INTRO:END -->
    <mj-text padding-bottom="4px"><strong>Événement :</strong> {{event_name}}</mj-text>
    <mj-text padding-bottom="4px"><strong>Date :</strong> {{slot_date}}</mj-text>
    <mj-text padding-bottom="8px"><strong>Horaires :</strong> {{slot_time}}</mj-text>
    <mj-text padding-bottom="8px">{{cancellation_reason}}</mj-text>
    <mj-text padding-bottom="8px">Veuillez consulter le calendrier pour choisir un autre créneau disponible.</mj-text>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" padding-top="0">Cordialement,<br/><strong>L'équipe d'organisation</strong></mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>$mjml$
    )
) AS t(template_key, body)
ON CONFLICT (template_key) DO NOTHING;

-- ============================================
-- End of Migration 013
-- ============================================
