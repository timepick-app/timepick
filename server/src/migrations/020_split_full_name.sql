-- ============================================
-- TimePick - Split du nom membre : full_name → first_name + last_name
-- ============================================
-- Created: 2026-06-12
-- Purpose: scinde la colonne `full_name` en deux colonnes distinctes pour le
--          profil membre :
--            - first_name TEXT : prénom (requis au niveau applicatif via Zod,
--                                 nullable en DB pour absorber les lignes
--                                 existantes avant le re-seed S6).
--            - last_name  TEXT : nom (nullable — mononymes).
--          PAS de backfill : toutes les lignes existantes sont des données de
--          test purgées + re-seedées en S6 (cf. Epic, décision 6). Les lignes
--          pré-existantes héritent donc de first_name/last_name = NULL.
--
-- Idempotence: ADD COLUMN IF NOT EXISTS / DROP COLUMN IF EXISTS (idiome maison,
--              cf. migrations 015 et 019). Requis car le bootstrap de test
--              (src/__tests__/bootstrap.sql) ET scripts/init-db.ts créent déjà
--              first_name/last_name (et n'ont plus full_name) sur une base
--              fraîche ; cette migration ne doit pas échouer dans ce cas.
-- ============================================

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS first_name TEXT,
    ADD COLUMN IF NOT EXISTS last_name TEXT,
    DROP COLUMN IF EXISTS full_name;

COMMENT ON COLUMN users.first_name IS 'Prénom du membre (requis applicativement via Zod, nullable en DB jusqu''au re-seed S6).';
COMMENT ON COLUMN users.last_name IS 'Nom du membre (nullable — mononymes).';

-- ============================================
-- End of Migration 020
-- ============================================
