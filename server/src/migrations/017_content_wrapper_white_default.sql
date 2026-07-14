-- ============================================
-- TimePick — Carte de corps commune : fond usine blanc + corps invitation sans fond
-- ============================================
-- Created: 2026-06-08
-- Purpose:
--   (1) Migre le défaut usine de la carte (content-wrapper brand) de #f9f9f9
--       (semé par migration 012) à #ffffff. N'écrase QUE la row factory
--       inchangée (match exact de l'ancienne valeur) — toute customisation
--       admin (autre content_mjml) survit (first-write-wins, symétrie avec
--       l'ON CONFLICT DO NOTHING de 012).
--   (2) Retire le fond gris #f9f9f9 du <mj-section> du corps d'invitation
--       (le contenu devient transparent → la carte blanche commune transparaît
--        dessous). Met à jour default_body_mjml (factory gelé) ET body_mjml
--       (courant) ; ce dernier via REPLACE qui est no-op si l'admin a déjà
--       customisé la section (first-write-wins). Les 3 corps système (006)
--       n'ont aucun background-color → rien à migrer pour eux.
-- Reversibility: rollback script retiré — politique forward-only.
--                Urgence : git revert du SQL + correctif SQL manuel / restauration backup.
-- Idempotence: les UPDATE conditionnels (WHERE = ancienne valeur / REPLACE de
--   la sous-chaîne factory) sont strictement no-op à la seconde exécution.
-- SSOT: la valeur #ffffff de (1) est dupliquée dans la constante TS
--   BRAND_FACTORY_CONTENT_WRAPPER_MJML (server/src/services/shell-parts.service.ts).
--   Garder les deux en synchro byte-exact (le SQL ne peut pas importer le TS).
-- ============================================

-- (1) Carte brand : #f9f9f9 → #ffffff (uniquement si encore au défaut usine 012).
UPDATE shell_parts
SET content_mjml = '<mj-section background-color="#ffffff"></mj-section>'
WHERE owner_kind = 'brand'
  AND owner_id = '1'
  AND part_kind = 'content-wrapper'
  AND content_mjml = '<mj-section background-color="#f9f9f9"></mj-section>';

-- (2a) Corps d'invitation — factory gelé (default_body_mjml) : retire le fond gris
--      de la section externe (conserve padding + border-radius existants).
UPDATE email_templates
SET default_body_mjml = REPLACE(
      default_body_mjml,
      '<mj-section background-color="#f9f9f9" padding="20px" border-radius="0 0 8px 8px">',
      '<mj-section padding="20px" border-radius="0 0 8px 8px">'
    )
WHERE template_key = 'invitation';

-- (2b) Corps d'invitation — courant (body_mjml) : idem. Le REPLACE est no-op si
--      l'admin a déjà customisé cette section (first-write-wins) — la sous-chaîne
--      factory exacte n'y est alors plus présente.
UPDATE email_templates
SET body_mjml = REPLACE(
      body_mjml,
      '<mj-section background-color="#f9f9f9" padding="20px" border-radius="0 0 8px 8px">',
      '<mj-section padding="20px" border-radius="0 0 8px 8px">'
    )
WHERE template_key = 'invitation';
