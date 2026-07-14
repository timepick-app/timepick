-- ============================================
-- TimePick - Index transversaux pour « Mon agenda » (/me/slots, /me/available-slots)
-- ============================================
-- Created: 2026-06-19
-- Purpose: ajoute 2 index PARTIELS composites/mono-colonne sur `slots` pour
--          accélérer les lectures transversales de l'espace membre :
--            - idx_slots_event_id_start_time : composite (event_id, start_time)
--              PARTIEL (cancelled_at IS NULL) — couvre le LATERAL de getMyEvents
--              (MIN/MAX sur les créneaux actifs) ET le ORDER BY start_time ASC
--              des requêtes `upcoming`/`past` de /me/slots sur les créneaux actifs.
--              L'index existant idx_slots_event_id (single-colonne, non-partiel)
--              reste en place (consommé par d'autres requêtes legacy).
--            - idx_slots_end_time : mono-colonne PARTIEL (cancelled_at IS NULL) —
--              couvre le WHERE s.end_time < NOW() du total_realized_hours
--              (aucun index sur end_time n'existait auparavant).
--
-- Backfill: aucun (pré-launch, aucun slot legacy en production).
--
-- Reversibility: rollback script retiré — politique forward-only.
--                Urgence : git revert du SQL + correctif SQL manuel / restauration backup.
-- ============================================
-- Maintenance notes (READ before editing):
--
--   1. CREATE INDEX IF NOT EXISTS : la migration est idempotente (re-jouable
--      sans erreur). CONCURRENTLY n'est PAS utilisé car (a) le runner de
--      migration encapsule chaque fichier dans une transaction, incompatible
--      avec CONCURRENTLY, et (b) la table `slots` reste de petite taille en
--      pré-launch (la fenêtre de blocage d'écriture est négligeable).
--
--   2. Index PARTIEL (WHERE cancelled_at IS NULL) : seules les rows actives
--      sont indexées — la grande majorité. Les slots annulés (peu nombreux,
--      cf. migration 014) sont exclus, l'index reste compact. Idiome établi
--      par migration 014 (idx_slots_cancelled_at).
--
--   3. Index 3 `idx_bookings_slot_id_user_id` OMIS (décision AR9) : la
--      contrainte `unique_booking UNIQUE (slot_id, user_id)` (migration 001,
--      ligne 230) crée déjà un index B-tree implicite ÉQUIVALENT. Les deux
--      mènent avec `slot_id` : le planner l'utilise aussi bien pour
--      `WHERE slot_id = X` (sous-requête NOT EXISTS de available-slots) que
--      pour la paire `(slot_id, user_id)`. Ajouter un index explicite
--      redondant gonflerait l'espace disque et le coût d'écriture sans
--      bénéfice — le gate EXPLAIN ANALYZE (T17) confirme l'usage de
--      l'implicite. Si une future requête menait avec `user_id` seule (cas
--      couvert par idx_bookings_user_id existant), réévaluer alors.
-- ============================================

-- Étape 1 : index composite partiel (event_id, start_time) — LATERAL getMyEvents
--           + ORDER BY start_time de /me/slots upcoming & past.
CREATE INDEX IF NOT EXISTS idx_slots_event_id_start_time
    ON slots(event_id, start_time)
    WHERE cancelled_at IS NULL;

-- Étape 2 : index partiel sur end_time — filtre s.end_time < NOW() du total_realized_hours.
CREATE INDEX IF NOT EXISTS idx_slots_end_time
    ON slots(end_time)
    WHERE cancelled_at IS NULL;

-- ============================================
-- End of Migration 035
-- ============================================
