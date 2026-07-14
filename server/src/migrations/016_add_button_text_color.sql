-- ============================================
-- TimePick - Couleur de texte des boutons (token de marque)
-- ============================================
-- Created: 2026-06-05
-- Purpose: complète le modèle de marque email. La couleur du LABEL des boutons
--          était codée en dur `#ffffff` à deux endroits (client bodyExtraction
--          + serveur render-email buildShell) — invisible et configurable nulle
--          part. Si la couleur primaire devient claire, le label blanc devient
--          illisible sans recours admin. Cette colonne rend le token explicite
--          et persistant ; client et serveur lisent la même valeur (parité
--          triviale, aucun algo de contraste dupliqué). Défaut `#ffffff` =
--          comportement historique inchangé pour les installs existantes.
--
-- Reversibility: rollback script retiré — politique forward-only.
--                Urgence : git revert du SQL + correctif SQL manuel / restauration backup.
-- ============================================
-- Maintenance notes (READ before editing):
--
--   1. ADD COLUMN IF NOT EXISTS rend l'ajout idempotent (idiome maison 014/015).
--   2. La singleton row id=1 est peuplée automatiquement par DEFAULT '#ffffff'.
--   3. VARCHAR(7) = même type/longueur que primary_color / background_color.
-- ============================================

ALTER TABLE email_brand_settings
    ADD COLUMN IF NOT EXISTS button_text_color VARCHAR(7) NOT NULL DEFAULT '#ffffff';

COMMENT ON COLUMN email_brand_settings.button_text_color IS 'Button label (text) color as hex #RRGGBB. Default #ffffff (legacy hardcoded value). Injected at runtime by renderEmail() / wrapBodyForEditing() — do not inline in seed bodies.';

-- ============================================
-- End of Migration 016
-- ============================================
