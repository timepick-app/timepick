-- ============================================
-- TimePick - Email Templates: extend template_key + seed account_created
-- ============================================
-- Created: 2026-06-15
-- Purpose: ajoute 'account_created' comme 6ᵉ valeur autorisée de
--          email_templates.template_key (CHECK constraint), puis seed le row
--          factory avec body_mjml + default_body_mjml. La fonction
--          sendWelcomeInvitation (server/src/services/email.service.ts)
--          est refactorée dans le même chantier pour consommer
--          renderEmail({ templateKey: 'account_created', ... })
--          au lieu d'émettre du HTML inline « APE Scheduler » hardcodé,
--          ce qui aligne l'email de bienvenue sur le shell standard
--          (header noir, content-wrapper #f9f9f9, footer brand) — cf. la
--          politique de personnalisation de la coque email.
--
--          DDL + DML combinés dans un seul fichier : aucune séparation
--          utile (le seed est conditionné à l'existence du templateKey
--          autorisé par la CHECK constraint étendue).
--
-- Reversibility: rollback script retiré — politique forward-only.
--                Urgence : git revert du SQL + correctif SQL manuel / restauration backup.
--
-- Backfill: aucun. Les 5 rows existantes (invitation, magic_link_login,
--           magic_link_recovery, reservation_confirmation,
--           cancellation_confirmation) restent intactes,
--           leurs body_mjml ne sont pas touchés.
-- ============================================
-- Maintenance notes (READ before editing):
--
--   1. La forme DROP/ADD CONSTRAINT est requise — un ALTER TABLE ne peut
--      pas modifier en place un CHECK existant en PostgreSQL. Pattern
--      documenté dans 009 § Maintenance notes (3), appliqué à l'identique
--      dans 010, 011, 013 puis ici.
--
--   2. Les 5 valeurs existantes (invitation, magic_link_login,
--      magic_link_recovery, reservation_confirmation,
--      cancellation_confirmation) restent conformes à la nouvelle contrainte :
--      aucune row existante n'est modifiée par l'élargissement de l'enum.
--      Idempotent côté rows.
--
--   3. SSOT — La valeur factory ci-dessous est dupliquée dans les constantes
--      TS du skeleton SYSTEM_TEMPLATE_SKELETONS['account_created'] dans
--      `server/src/services/email-templates.service.ts`. Toute évolution
--      doit mettre à jour LES DEUX endroits en synchro byte-exact
--      (le rollback 023 et les tests consomment la constante TS). Le SQL
--      ne peut pas importer le module TS au runtime du runner de migrations ;
--      la duplication est volontaire et tracée. Pattern miroir 012/013.
--
--   4. Variables MJML attendues côté renderEmail : user_name, login_url.
--      user_name est optionnel (peut être vide). login_url est calculé
--      côté service (avec ctx=admin si admin) — jamais fourni par
--      l'utilisateur final.
--
--   5. Markers INTRO:START/END et SIG:START/END présents par parité avec
--      les migrations 007 et 013 (magic_link_login, magic_link_recovery,
--      reservation_confirmation, cancellation_confirmation). Ils permettent
--      au projector E1.S2 d'extraire l'intro et la signature séparément
--      pour l'UI d'édition.
-- ============================================

-- Étape 1 : élargir la CHECK constraint à 6 valeurs.
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
            'account_created'
        ));

COMMENT ON COLUMN email_templates.template_key IS 'Discriminator: invitation | magic_link_login | magic_link_recovery | reservation_confirmation | cancellation_confirmation | account_created. CHECK constraint guards against typos — extending requires a new migration that ALTERs the constraint.';

-- Étape 2 : seed factory body_mjml pour account_created.
-- Idempotent via ON CONFLICT (template_key) DO NOTHING — pattern 006.
INSERT INTO email_templates (template_key, body_mjml, default_body_mjml)
SELECT template_key, body, body
FROM (VALUES
    (
        'account_created',
        $mjml$<mj-section padding="20px">
  <mj-column>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">Bonjour {{user_name}}, votre compte vient d'être créé. Cliquez sur le bouton ci-dessous pour vous connecter à votre espace.</mj-text>
    <!-- INTRO:END -->
    <mj-button href="{{login_url}}" font-weight="bold" padding="20px 0">Accéder à mon espace</mj-button>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" align="center" padding-top="0">Saisissez votre adresse email pour recevoir un lien de connexion sécurisé. À bientôt !</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>$mjml$
    )
) AS t(template_key, body)
ON CONFLICT (template_key) DO NOTHING;

-- ============================================
-- End of Migration 023
-- ============================================
