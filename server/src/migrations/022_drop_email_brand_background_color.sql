-- ============================================
-- TimePick - Retrait de la colonne background_color (token de marque vestigial)
-- ============================================
-- Created: 2026-06-15
-- Purpose: la colonne email_brand_settings.background_color etait semi-vestigiale.
--          Non editable par l'admin (le menu « Identite visuelle » l'exclut
--          explicitement) et masquee en production par la coque commune « carte »
--          (migration 018 : shell_parts(template/invitation/mj-body) = #fefefe)
--          qui ecrase systematiquement ce repli a la resolution. Le vrai controle
--          du fond de l'e-mail est le <mj-body> « Cadre » de l'editeur MJML, ecrit
--          dans shell_parts(mj-body). Le repli runtime devient la constante
--          HARDCODED_MJ_BODY_ATTRS.backgroundColor (#ffffff) dans
--          shell-resolver.service.ts. Valeur figee a #ffffff (defaut 006, jamais
--          modifiee faute d'UI) => aucun changement de comportement observable.
--
-- Reversibility: rollback script retiré — politique forward-only.
--                Urgence : git revert du SQL + correctif SQL manuel / restauration backup.
-- ============================================
-- Maintenance notes (READ before editing):
--
--   1. DROP COLUMN IF EXISTS rend le retrait idempotent (idiome maison 016).
--   2. DROP COLUMN prend un verrou ACCESS EXCLUSIVE bref ; la table est un
--      singleton (1 row), aucun impact pratique de verrou prolonge.
--   3. Migrations append-only : ne JAMAIS editer 006 ; ce retrait passe par 022.
-- ============================================

ALTER TABLE email_brand_settings
    DROP COLUMN IF EXISTS background_color;

-- ============================================
-- End of Migration 022
-- ============================================
