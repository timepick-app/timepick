-- ============================================
-- TimePick - Additif profil membre : profession + informations
-- ============================================
-- Created: 2026-06-12
-- Purpose: ajoute deux colonnes nullable à la table users pour le profil membre
--          (cas d'usage : association de parents d'élèves) :
--            - profession VARCHAR(150) : métier, aide au staffing des activités.
--            - informations TEXT       : notes libres (disponibilités, etc.).
--          Strictement additif : aucune colonne existante touchée, pas de
--          backfill, compatible avec les lignes existantes (valeurs NULL).
--
-- Idempotence: ADD COLUMN IF NOT EXISTS (idiome maison, cf. migration 015).
--              Requis car le bootstrap de test (src/__tests__/bootstrap.sql)
--              ET scripts/init-db.ts créent déjà ces colonnes sur une base
--              fraîche ; cette migration ne doit pas échouer dans ce cas.
-- ============================================

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS profession VARCHAR(150),
    ADD COLUMN IF NOT EXISTS informations TEXT;

COMMENT ON COLUMN users.profession IS 'Métier du membre (nullable, max 150). Aide au staffing des activités.';
COMMENT ON COLUMN users.informations IS 'Notes libres sur le membre (nullable, fourre-tout assumé : disponibilités, compétences…).';

-- ============================================
-- End of Migration 019
-- ============================================
