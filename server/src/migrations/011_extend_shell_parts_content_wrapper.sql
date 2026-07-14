-- ============================================
-- TimePick - Shell Parts: extend part_kind for 'content-wrapper'
-- ============================================
-- Created: 2026-05-25
-- Purpose: étend la CHECK constraint shell_parts_part_kind_check pour
--          accepter la valeur 'content-wrapper' en plus des 4 valeurs
--          existantes (header, body, footer, mj-body). 'content-wrapper'
--          est un artefact transversal hors-bloc d'encadrement visuel du
--          contenu du corps, propagé en cascade γ depuis le gabarit
--          d'invitation (cf. la politique de personnalisation des enveloppes
--          email, section « Le content-wrapper transversal (hors-bloc) »).
--
--          L2 est un enabler data-layer SANS effet utilisateur visible :
--          ni render-email, ni UI éditeur ne consomment encore la valeur
--          résolue. Ces parties sont L3 (defer plan-5b-defer-a-L3).
--
-- Reversibility: rollback script retiré — politique forward-only.
--                Urgence : git revert du SQL + correctif SQL manuel / restauration backup.
--
-- Backfill policy: AUCUN. Conforme à la policy frozen et au scope strict L2
--                  (« Pas de migration de données »). Le déplacement de
--                  background-color="#f9f9f9" du body invitation vers une row
--                  content-wrapper est explicitement L3 (couplé à l'arrivée
--                  du wrapping render qui consomme la row).
-- ============================================
-- Maintenance notes (READ before editing):
--
--   1. La forme DROP/ADD CONSTRAINT est requise — un ALTER TABLE ne peut
--      pas modifier en place un CHECK existant en PostgreSQL. Pattern
--      documenté dans 009_create_shell_parts.sql § Maintenance notes (3)
--      et appliqué à l'identique dans 010 puis ici.
--
--   2. Les rows existantes (part_kind IN 'header'|'body'|'footer'|'mj-body')
--      restent conformes à la nouvelle contrainte : aucun UPDATE de données,
--      juste un élargissement de l'enum. Idempotent côté rows.
--
--   3. L'introduction de tout nouvel artefact transversal hors-bloc futur
--      (5ᵉ axe γ) exige son propre amendement explicite à la politique de
--      personnalisation des enveloppes email (clause § « Évolution future possible »).
--      Ne pas amender ce fichier en place ; créer une nouvelle migration.
-- ============================================

ALTER TABLE shell_parts
    DROP CONSTRAINT IF EXISTS shell_parts_part_kind_check;

ALTER TABLE shell_parts
    ADD CONSTRAINT shell_parts_part_kind_check
        CHECK (part_kind IN ('header', 'body', 'footer', 'mj-body', 'content-wrapper'));

COMMENT ON COLUMN shell_parts.part_kind IS 'Shell block kind: header, body, footer, mj-body, or content-wrapper. Les 3 sections (header/body/footer) hébergent du contenu MJML <mj-section>. La valeur ''mj-body'' stocke uniquement les attributs (background-color, padding-top, padding-bottom) du <mj-body> racine via un fragment vide-de-contenu. La valeur ''content-wrapper'' (Plan 5b defer-A L2, 2026-05-25) stocke les attributs d''un wrapper transversal hors-bloc (background-color, padding*, border-radius) appliqué autour du contenu du corps au render — cf. la politique de personnalisation de la coque email, section « Le content-wrapper transversal (hors-bloc) ».';
