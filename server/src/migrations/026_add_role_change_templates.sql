-- ============================================
-- TimePick - Email Templates: extend template_key + seed role_promoted / role_demoted
-- ============================================
-- Created: 2026-06-16
-- Purpose: ajoute 'role_promoted' et 'role_demoted' comme valeurs autorisées
--          de email_templates.template_key (CHECK constraint), puis seed les
--          deux rows factory (body_mjml + default_body_mjml). Ces templates
--          notifient un membre d'un changement de rôle (promotion Membre →
--          Administrateur / rétrogradation Administrateur → Membre) émis depuis
--          la modale admin. La fonction sendRoleChangedEmail
--          (server/src/services/email.service.ts) les consomme via
--          renderEmail({ templateKey, ... }) — base visuelle identique à
--          'account_created' (shell standard, cf. la politique de personnalisation de la coque email),
--          rédactionnel distinct.
--
--          DDL + DML combinés dans un seul fichier : aucune séparation utile
--          (le seed est conditionné à l'existence des templateKey autorisés par
--          la CHECK constraint élargie).
--
-- Reversibility: rollback script retiré — politique forward-only.
--                Urgence : git revert du SQL + correctif SQL manuel / restauration backup.
--
-- Backfill: aucun. Les rows existantes ne sont pas touchées.
-- ============================================
-- Maintenance notes (READ before editing):
--
--   1. La forme DROP/ADD CONSTRAINT est requise — un ALTER TABLE ne peut
--      pas modifier en place un CHECK existant en PostgreSQL. Pattern
--      documenté dans 009 § Maintenance notes (3), appliqué à l'identique
--      dans 010, 011, 013, 023 puis ici.
--
--   2. ⚠️ CONCURRENCE — 'slot_modification' est listé dans la CHECK ci-dessous
--      bien qu'il N'EXISTE PAS dans cette branche : il appartient au chantier
--      concurrent (migration 025, non committée au moment de l'écriture de 026).
--      Le numéro 026 est choisi car 025 est réservée. Le runner de migrations
--      (server/src/migrate.ts) tolère les trous (applique tout NNN_*.sql non
--      appliqué en ordre lexical), donc un 026 sans 025 local fonctionne. Au
--      merge (025 appliquée avant 026), énumérer 'slot_modification' garantit
--      que 026 ne retire pas la valeur de l'ensemble autorisé et ne casse pas
--      le template du chantier concurrent.
--
--   3. SSOT — Les valeurs factory ci-dessous sont dupliquées dans les
--      constantes TS du skeleton SYSTEM_TEMPLATE_SKELETONS['role_promoted'] et
--      ['role_demoted'] dans `server/src/services/email-templates.service.ts`.
--      Toute évolution doit mettre à jour LES DEUX endroits en synchro
--      byte-exact (les fragments structurels before/afterIntroBeforeSig/after
--      du skeleton doivent matcher le body SQL). Le SQL ne peut pas importer le
--      module TS au runtime du runner ; la duplication est volontaire et tracée.
--      Pattern miroir 012/013/023.
--
--   4. Variables MJML attendues côté renderEmail : user_name, login_url.
--      user_name est optionnel (peut être vide). login_url est calculé côté
--      service (avec ctx=admin pour role_promoted) — jamais fourni par
--      l'utilisateur final.
--
--   5. Markers INTRO:START/END et SIG:START/END présents par parité avec les
--      migrations 007/013/023. Ils permettent au projector d'extraire l'intro
--      et la signature séparément pour l'UI d'édition.
-- ============================================

-- Étape 1 : élargir la CHECK constraint à 9 valeurs (dont slot_modification, cf. note 2).
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
            'slot_modification',
            'role_promoted',
            'role_demoted'
        ));

COMMENT ON COLUMN email_templates.template_key IS 'Discriminator: invitation | magic_link_login | magic_link_recovery | reservation_confirmation | cancellation_confirmation | account_created | slot_modification | role_promoted | role_demoted. CHECK constraint guards against typos — extending requires a new migration that ALTERs the constraint.';

-- Étape 2 : seed factory body_mjml pour role_promoted et role_demoted.
-- Idempotent via ON CONFLICT (template_key) DO NOTHING — pattern 006/023.
INSERT INTO email_templates (template_key, body_mjml, default_body_mjml)
SELECT template_key, body, body
FROM (VALUES
    (
        'role_promoted',
        $mjml$<mj-section padding="20px">
  <mj-column>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">Bonjour {{user_name}}, votre accès sur TimePick a été mis à jour. Vous êtes désormais Administrateur : vous pouvez gérer les membres, les événements et les paramètres.</mj-text>
    <!-- INTRO:END -->
    <mj-button href="{{login_url}}" font-weight="bold" padding="20px 0">Accéder à TimePick</mj-button>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" align="center" padding-top="0">Connectez-vous avec votre adresse email pour retrouver votre espace. À bientôt !</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>$mjml$
    ),
    (
        'role_demoted',
        $mjml$<mj-section padding="20px">
  <mj-column>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">Bonjour {{user_name}}, votre accès sur TimePick a été ajusté. Vous êtes désormais Membre : vous continuez à accéder à vos événements et à votre profil ; les fonctions d'administration ne sont plus disponibles.</mj-text>
    <!-- INTRO:END -->
    <mj-button href="{{login_url}}" font-weight="bold" padding="20px 0">Accéder à TimePick</mj-button>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" align="center" padding-top="0">Connectez-vous avec votre adresse email pour retrouver votre espace. À bientôt !</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>$mjml$
    )
) AS t(template_key, body)
ON CONFLICT (template_key) DO NOTHING;

-- ============================================
-- End of Migration 026
-- ============================================
