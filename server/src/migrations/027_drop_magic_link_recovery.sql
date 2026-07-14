-- ============================================
-- TimePick - Email Templates: shrink template_key CHECK (drop magic_link_recovery)
-- ============================================
-- Created: 2026-06-16
-- Purpose: retire 'magic_link_recovery' de l'ensemble autorisé de
--          email_templates.template_key ET supprime la row correspondante.
--          La fonctionnalité d'envoi d'email via ce template a été retirée
--          en Phase 1 du chantier « sécurisation codes de secours » (affichage
--          on-screen uniquement désormais) ; la row DB et l'entrée CHECK ne
--          servent plus aucun usage légitime.
--
--          Ordre OBLIGATOIRE : DELETE avant shrink CHECK.
--          Si la CHECK était modifiée en premier (DROP + ADD), la row encore
--          présente avec template_key='magic_link_recovery' violerait
--          immédiatement la nouvelle contrainte réduite. Supprimer d'abord
--          garantit un état propre avant le DDL.
--
-- Reversibility: rollback script retiré — politique forward-only.
--                Urgence : git revert du SQL + correctif SQL manuel / restauration backup.
--
-- Note append-only: cette migration ne modifie jamais 006/007/026.
-- ============================================
-- Maintenance notes (READ before editing):
--
--   1. ⚠️ CONCURRENCE — 'slot_modification' est conservé dans la CHECK
--      ci-dessous (chantier concurrent, migration 025 ; note identique à 026
--      § note 2). Ce retrait ne concerne que magic_link_recovery.
--
--   2. La forme DROP/ADD CONSTRAINT est requise — un ALTER TABLE ne peut pas
--      modifier en place un CHECK existant en PostgreSQL. Pattern documenté
--      dans 009 § Maintenance notes (3), appliqué à l'identique dans 010,
--      011, 013, 023, 026 puis ici.
--
--   3. SSOT — les registres TS (TEMPLATE_KEYS, SYSTEM_TEMPLATE_SKELETONS,
--      UI_RESETTABLE_TEMPLATE_KEYS, TEST_SEND_SUBJECTS) sont mis à jour en
--      synchrone dans le même chantier (Phase 3). Toute réintroduction future
--      de magic_link_recovery devra mettre à jour LES DEUX endroits
--      (SQL + TS) en même temps.
-- ============================================

-- Étape 1 : supprimer la row magic_link_recovery AVANT de rétrécir la CHECK.
DELETE FROM email_templates WHERE template_key = 'magic_link_recovery';

-- Étape 2 : rétrécir la CHECK constraint à 8 valeurs (sans magic_link_recovery).
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
            'role_demoted'
        ));

-- Étape 3 : mettre à jour le commentaire du discriminateur (retrait de magic_link_recovery).
COMMENT ON COLUMN email_templates.template_key IS 'Discriminator: invitation | magic_link_login | reservation_confirmation | cancellation_confirmation | account_created | slot_modification | role_promoted | role_demoted. CHECK constraint guards against typos — extending requires a new migration that ALTERs the constraint.';

-- ============================================
-- End of Migration 027
-- ============================================
