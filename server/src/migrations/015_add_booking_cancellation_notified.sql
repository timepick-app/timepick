-- ============================================
-- TimePick - Marqueur de notification d'annulation par réservation
-- ============================================
-- Created: 2026-05-31
-- Purpose: rend fiable la notification d'annulation de créneau. À l'annulation
--          d'un créneau réservé (soft-delete, migration 014), les emails partent
--          en Promise.allSettled après commit ; une panne SMTP les fait tous
--          échouer sans trace durable. Cette colonne horodate, par réservation,
--          l'envoi RÉUSSI de la notification d'annulation. Une réservation
--          « en attente » = créneau cancelled_at IS NOT NULL ET
--          cancellation_notified_at IS NULL → alimente les surfaces admin de
--          renvoi (carte Tableau de bord + section onglet Emails).
--          cf. slot.service.cancelSlot + cancellation-notification.service.
--
-- Backfill: les réservations dont le créneau est DÉJÀ annulé au moment de la
--           migration sont marquées notified_at = slots.cancelled_at. Raison :
--           éviter que des annulations historiques (pré-déploiement) ne remontent
--           rétroactivement comme « en attente ». Seuls les NOUVEAUX échecs
--           (post-déploiement) doivent apparaître. Pré-launch : volume faible.
--
-- Reversibility: rollback script retiré — politique forward-only.
--                Urgence : git revert du SQL + correctif SQL manuel / restauration backup.
-- ============================================
-- Maintenance notes (READ before editing):
--
--   1. ADD COLUMN IF NOT EXISTS rend l'ajout idempotent (idiome maison 014).
--
--   2. Le backfill est borné aux créneaux annulés (s.cancelled_at IS NOT NULL)
--      ET aux réservations non encore marquées (b.cancellation_notified_at IS
--      NULL) → re-jouable sans écraser un marqueur déjà posé.
--
--   3. Index PARTIEL (WHERE cancellation_notified_at IS NULL) : indexe les
--      réservations encore non notifiées — la lecture « en attente » filtre sur
--      slots.cancelled_at IS NOT NULL côté join, mais ce partial garde l'index
--      compact côté bookings. À régénérer si la définition « en attente » change.
-- ============================================

-- Étape 1 : colonne marqueur (idempotent).
ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS cancellation_notified_at TIMESTAMPTZ NULL;

-- Étape 2 : backfill des annulations historiques (voir note Backfill).
UPDATE bookings b
   SET cancellation_notified_at = s.cancelled_at
  FROM slots s
 WHERE b.slot_id = s.id
   AND s.cancelled_at IS NOT NULL
   AND b.cancellation_notified_at IS NULL;

-- Étape 3 : index partiel sur les réservations non notifiées.
CREATE INDEX IF NOT EXISTS idx_bookings_cancellation_notified_at
    ON bookings(cancellation_notified_at)
    WHERE cancellation_notified_at IS NULL;

COMMENT ON COLUMN bookings.cancellation_notified_at IS 'Horodatage de l''envoi RÉUSSI de la notification d''annulation. NULL = non notifié. « En attente » = créneau annulé (slots.cancelled_at IS NOT NULL) ET cette colonne NULL.';

-- ============================================
-- End of Migration 015
-- ============================================
