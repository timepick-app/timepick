-- ============================================
-- TimePick - Contrainte NOT NULL sur users.first_name
-- ============================================
-- Created: 2026-06-17
-- Purpose: durcit la colonne `first_name` de la table `users` en ajoutant
--          une contrainte NOT NULL. La colonne est nullable depuis la migration
--          020_split_full_name.sql (ajout initial) ; les données de production
--          et de test ont désormais toutes un prénom renseigné (seed S2 + B5).
--
--          INTENTION DÉLIBÉRÉE : la migration échoue franchement si un NULL
--          existe encore (PostgreSQL refuse l'ALTER s'il reste des NULL dans
--          la colonne). Aucun backfill silencieux. Comportement voulu : forcer
--          la détection d'éventuelles lignes orphelines avant de poser la
--          contrainte plutôt que les masquer avec une valeur par défaut.
--
-- Reversibility: rollback script retiré — politique forward-only.
--                Urgence : git revert du SQL + correctif SQL manuel / restauration backup.
-- ============================================

ALTER TABLE users ALTER COLUMN first_name SET NOT NULL;

-- ============================================
-- End of Migration 030
-- ============================================
