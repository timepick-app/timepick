-- ============================================
-- TimePick - Email Templates: extend template_key + seed slot_modification
-- ============================================
-- Created: 2026-06-16
-- Purpose: ajoute 'slot_modification' comme 7ᵉ valeur autorisée de
--          email_templates.template_key (CHECK constraint), puis seed le row
--          factory avec body_mjml + default_body_mjml. Le service
--          SlotNotificationService (à créer dans le même chantier) consomme
--          renderEmail({ templateKey: 'slot_modification', ... }) pour notifier
--          les inscrits d'un créneau lorsque son horaire (start_time/end_time)
--          ou sa description sont modifiés par un admin.
--
--          CORPS DYNAMIQUE : ce template utilise la variable {{changes_blocks}}
--          qui est un bloc HTML pré-assemblé côté service (conditions sur les
--          champs modifiés via computeSlotDiff). Contrairement aux autres
--          templates, le body_mjml n'est PAS exposé dans l'UI d'édition
--          Paramètres (décision V8) — aucun marqueur INTRO/SIG, et aucune
--          duplication dans un skeleton TS (SYSTEM_TEMPLATE_SKELETONS).
--          resolveBody lit body_mjml directement depuis la row email_templates
--          WHERE template_key='slot_modification'.
--
--          DDL + DML combinés dans un seul fichier : aucune séparation
--          utile (le seed est conditionné à l'existence du templateKey
--          autorisé par la CHECK constraint étendue).
--
-- Reversibility: rollback script retiré — politique forward-only.
--                Urgence : git revert du SQL + correctif SQL manuel / restauration backup.
--
-- Backfill: aucun. Les 6 rows existantes (invitation, magic_link_login,
--           magic_link_recovery, reservation_confirmation,
--           cancellation_confirmation, account_created) restent intactes,
--           leurs body_mjml ne sont pas touchés.
-- ============================================
-- Maintenance notes (READ before editing):
--
--   1. La forme DROP/ADD CONSTRAINT est requise — un ALTER TABLE ne peut
--      pas modifier en place un CHECK existant en PostgreSQL. Pattern
--      documenté dans 009 § Maintenance notes (3), appliqué à l'identique
--      dans 010, 011, 013, 023 puis ici.
--
--   2. Les 6 valeurs existantes (invitation, magic_link_login,
--      magic_link_recovery, reservation_confirmation,
--      cancellation_confirmation, account_created) restent conformes à la
--      nouvelle contrainte : aucune row existante n'est modifiée par
--      l'élargissement de l'enum. Idempotent côté rows.
--
--   3. Ce template n'est PAS exposé dans l'UI Paramètres > Emails (décision
--      V8). Ne pas l'ajouter à SYSTEM_TEMPLATE_SKELETONS ni à
--      emailSubtabs.constants.ts. Le body_mjml est un échafaudage mince
--      avec corps dynamique : {{changes_blocks}} est assemblé côté service
--      par SlotNotificationService en fonction des champs modifiés.
--
--   4. Variables MJML attendues côté renderEmail : user_name (prénom),
--      event_name, changes_blocks (HTML composite), calendar_url (URL
--      absolue obligatoire — le sanitizer SAFE_URI strippe les href relatifs).
--      calendar_url = ${APP_URL}/calendrier.
--
--   5. Aucun marker INTRO:START/END ni SIG:START/END — ce template a un corps
--      dynamique et n'est pas éditable via l'UI. Contrairement aux migrations
--      007, 013, 023, pas de duplication dans un skeleton TS.
-- ============================================

-- Étape 1 : élargir la CHECK constraint à 7 valeurs.
ALTER TABLE email_templates
    DROP CONSTRAINT IF EXISTS email_templates_template_key_check;

ALTER TABLE email_templates
    ADD CONSTRAINT email_templates_template_key_check
        CHECK (template_key IN (
            'invitation',
            'magic_link_login',
            'magic_link_recovery',
            'reservation_confirmation',
            'cancellation_confirmation',
            'account_created',
            'slot_modification'
        ));

COMMENT ON COLUMN email_templates.template_key IS 'Discriminator: invitation | magic_link_login | magic_link_recovery | reservation_confirmation | cancellation_confirmation | account_created | slot_modification. CHECK constraint guards against typos — extending requires a new migration that ALTERs the constraint.';

-- Étape 2 : seed factory body_mjml pour slot_modification.
-- Idempotent via ON CONFLICT (template_key) DO NOTHING — pattern 006.
INSERT INTO email_templates (template_key, body_mjml, default_body_mjml)
SELECT template_key, body, body
FROM (VALUES
    (
        'slot_modification',
        $mjml$<mj-section padding="20px">
  <mj-column>
    <mj-text font-size="18px" font-weight="bold" padding-bottom="8px">Votre créneau a été modifié</mj-text>
    <mj-text padding-bottom="12px">Bonjour {{user_name}}, le créneau « {{event_name}} » auquel vous êtes inscrit·e a été modifié.</mj-text>
    <mj-text>{{changes_blocks}}</mj-text>
    <mj-button href="{{calendar_url}}" font-weight="bold" padding="20px 0">Gérer ma réservation</mj-button>
  </mj-column>
</mj-section>$mjml$
    )
) AS t(template_key, body)
ON CONFLICT (template_key) DO NOTHING;

-- ============================================
-- End of Migration 025
-- ============================================
