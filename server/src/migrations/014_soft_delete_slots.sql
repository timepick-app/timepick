-- ============================================
-- TimePick - Soft-delete des créneaux annulés
-- ============================================
-- Created: 2026-05-30
-- Purpose: passe la suppression d'un créneau de DELETE (irréversible, cascade
--          sur bookings) à un soft-delete inconditionnel. Deux colonnes :
--            - cancelled_at : horodatage de l'annulation (NULL = actif).
--            - cancellation_reason : motif optionnel saisi par l'admin.
--          Les bookings sont préservés ; les vues calendrier reportent le
--          créneau annulé aux inscrits (second canal de découverte indépendant
--          du SMTP). cf. slot.service.cancelSlot + filtrage des lectures.
--
-- Backfill: aucun (pré-launch, aucun slot legacy en production).
--
-- Reversibility: rollback script retiré — politique forward-only.
--                Urgence : git revert du SQL + correctif SQL manuel / restauration backup.
-- ============================================
-- Maintenance notes (READ before editing):
--
--   1. ADD COLUMN IF NOT EXISTS rend l'ajout des colonnes idempotent. PostgreSQL
--      n'offre pas d'ADD CONSTRAINT IF NOT EXISTS pour un CHECK ; on suit donc
--      l'idiome maison (009/010/011/013) : DROP CONSTRAINT IF EXISTS puis
--      ADD CONSTRAINT, ce qui rend la migration re-jouable sans erreur.
--
--   2. La borne 500 du motif est défendue ici par un CHECK SQL (et non plus le
--      seul maxLength front, contournable par appel API direct). Toute évolution
--      doit rester synchrone avec CANCELLATION_REASON_MAX côté client
--      (SlotDeleteDialog) et le validateur serveur.
--
--   3. Index PARTIEL (WHERE cancelled_at IS NOT NULL) : seules les rows annulées
--      sont indexées — peu nombreuses, l'index reste compact. Sert le filtrage
--      « inscrit voit ses créneaux annulés » sans pénaliser les lectures actives.
-- ============================================

-- Étape 1 : colonnes soft-delete (idempotent).
ALTER TABLE slots
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS cancellation_reason TEXT NULL;

-- Étape 2 : borne de longueur du motif (idiome DROP/ADD pour idempotence).
ALTER TABLE slots
    DROP CONSTRAINT IF EXISTS slots_cancellation_reason_length;

ALTER TABLE slots
    ADD CONSTRAINT slots_cancellation_reason_length
        CHECK (cancellation_reason IS NULL OR char_length(cancellation_reason) <= 500);

-- Étape 3 : index partiel sur les créneaux annulés.
CREATE INDEX IF NOT EXISTS idx_slots_cancelled_at ON slots(cancelled_at)
    WHERE cancelled_at IS NOT NULL;

COMMENT ON COLUMN slots.cancelled_at IS 'Horodatage de l''annulation. NULL = créneau actif.';
COMMENT ON COLUMN slots.cancellation_reason IS 'Motif d''annulation saisi par l''admin (optionnel, max 500 caractères — borné par CHECK slots_cancellation_reason_length).';

-- ============================================
-- End of Migration 014
-- ============================================
