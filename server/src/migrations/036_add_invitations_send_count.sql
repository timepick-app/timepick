-- 036_add_invitations_send_count.sql
-- Ajoute le compteur d'envois (envoi initial + renvois) sur la table invitations.
-- Sert à afficher « envoyée N× » dans l'onglet « Invités » fusionné (Drawbridge #42/#43/#44).
-- Le 1er envoi reste dérivable de created_at (jamais touché par les upserts) ;
-- sent_at = dernier envoi ; send_count = nombre total d'envois.
-- Idempotent (ADD COLUMN IF NOT EXISTS). Forward-only (pas de rollback).

ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS send_count INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN invitations.send_count IS 'Nombre total d''envois de l''invitation (envoi initial + renvois). Incrémenté à chaque ON CONFLICT DO UPDATE (send/resend). created_at = 1er envoi, sent_at = dernier envoi.';
