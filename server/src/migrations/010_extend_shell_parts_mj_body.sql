-- ============================================
-- TimePick - Shell Parts: extend part_kind for 'mj-body'
-- ============================================
-- Created: 2026-05-22
-- Purpose: étend la CHECK constraint shell_parts_part_kind_check pour
--          accepter la valeur 'mj-body' en plus des 3 sections existantes
--          (header, body, footer). Permet de stocker les attributs
--          (background-color, padding-top, padding-bottom) du `<mj-body>`
--          racine dans le même schéma cascade event → template → brand,
--          sans table dédiée ni colonne JSON.
--
-- Reversibility: rollback script retiré — politique forward-only.
--                Urgence : git revert du SQL + correctif SQL manuel / restauration backup.
--
-- Backfill policy: AUCUN. Les rows mj-body existent uniquement après une
--                  édition admin via le Style Manager GrapesJS. Le résolveur
--                  retombe sur des défauts hardcodés (#ffffff, 0, 0) tant
--                  qu'aucune surcharge n'a été créée à aucun des 3 niveaux.
-- ============================================
-- Maintenance notes (READ before editing):
--
--   1. La forme DROP/ADD CONSTRAINT est requise — un ALTER TABLE ne peut
--      pas modifier en place un CHECK existant en PostgreSQL. Le pattern
--      est documenté dans 009_create_shell_parts.sql § Maintenance notes
--      point 3.
--
--   2. Les rows existantes (part_kind IN 'header'|'body'|'footer') restent
--      conformes à la nouvelle contrainte : aucun UPDATE de données, juste
--      un élargissement de l'enum. Idempotent côté rows.
--
--   3. Si une migration ultérieure ajoute un 5ᵉ part_kind (peu probable —
--      la policy fige 3 sections), suivre le même pattern DROP/ADD ici, pas
--      une amendation in-place de ce fichier (la nouvelle valeur ne s'appliquerait
--      pas sur les DB déjà migrées).
-- ============================================

ALTER TABLE shell_parts
    DROP CONSTRAINT IF EXISTS shell_parts_part_kind_check;

ALTER TABLE shell_parts
    ADD CONSTRAINT shell_parts_part_kind_check
        CHECK (part_kind IN ('header', 'body', 'footer', 'mj-body'));

COMMENT ON COLUMN shell_parts.part_kind IS 'Shell block kind: header, body, footer, or mj-body. Les 3 sections (header/body/footer) hébergent du contenu MJML <mj-section>. La valeur ''mj-body'' stocke uniquement les attributs (background-color, padding-top, padding-bottom) du <mj-body> racine via un fragment vide-de-contenu.';
