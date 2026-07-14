-- ============================================
-- TimePick — Coque commune « carte » : modèle d'usine
-- ============================================
-- Plan: validé en session 2026-06-08 (« définir le modèle d'usine selon les
--       valeurs de design enregistrées »). Capture l'état de design que l'admin
--       a composé dans l'éditeur (GrapesJS) comme défaut d'installation.
-- Created: 2026-06-08
-- Purpose:
--   (1) Sème les 3 parts γ de la coque commune au niveau de l'owner partagé
--       `template[invitation]` (cf. COMMON_SHELL_OWNER, shellLegRouting.ts) :
--         - header           : carte blanche, fine bordure gris clair #e5e7eb
--                              sur les 4 côtés, coins arrondis HAUT (10px 10px 0 0),
--                              titre « TimePick » noir centré.
--         - content-wrapper  : bas de carte blanc, bordure gris clair #e5e7eb
--                              gauche/bas/droite, coins arrondis BAS (0 0 10px 10px).
--         - mj-body          : fond de page quasi-blanc #fafafa + padding
--                              vertical 30px (la carte « flotte » sur la page).
--       Via promotion γ (cf. la politique de personnalisation de la coque email, § « Promotion γ »), ces rows
--       deviennent le défaut inter-modèles pour TOUS les emails transactionnels
--       (invitation, magic link login/recovery, confirmation, annulation).
--   (2) Met à jour le corps d'invitation `email_templates.invitation` au corps
--       enregistré (entouré des marqueurs <!-- BODY:START/END -->, sans fond ni
--       border-radius — l'encadrement vit désormais sur la carte). On gèle la
--       valeur usine (default_body_mjml) ET on aligne le courant (body_mjml)
--       UNIQUEMENT s'il n'a pas divergé du gel (first-write-wins).
--
-- Reversibility: rollback script retiré — politique forward-only.
--                Urgence : git revert du SQL + correctif SQL manuel / restauration backup.
-- ============================================
-- Maintenance notes (READ before editing):
--
--   1. Le tuple unique (owner_kind, owner_id, part_kind) est garanti par le
--      UNIQUE INDEX shell_parts_owner_part_unique (cf. 009). Le ON CONFLICT
--      cible explicitement ces 3 colonnes ; ne PAS le réduire à un ON CONFLICT
--      DO NOTHING bare (porterait sur n'importe quelle contrainte unique).
--
--   2. ON CONFLICT DO NOTHING = first-write-wins : si l'admin a déjà customisé
--      une de ces rows via le PUT shell-parts, le seed N'ÉCRASE PAS sa valeur.
--      Symétrie exacte avec le rollback (DELETE conditionnel par match factory).
--
--   3. SSOT — les 3 littéraux MJML ci-dessous sont dupliqués byte-exact dans
--      les constantes TS INVITATION_FACTORY_HEADER_MJML /
--      INVITATION_FACTORY_CONTENT_WRAPPER_MJML / INVITATION_FACTORY_MJBODY_MJML
--      (server/src/services/shell-parts.service.ts), consommées par le rollback
--      018 et les tests baselines. Le SQL ne peut pas importer le TS au runtime
--      du runner ; toute évolution doit mettre à jour LES DEUX endroits.
--
--   4. Corps d'invitation : l'UPDATE body_mjml conditionnel (= default_body_mjml
--      AVANT son propre UPDATE) ne touche que les installs encore au défaut
--      usine. Toute customisation admin du corps survit. Ordre impératif :
--      body_mjml AVANT default_body_mjml (le prédicat compare l'ancien gel).
-- ============================================

-- (1) Coque commune « carte » — owner partagé template[invitation].
INSERT INTO shell_parts (owner_kind, owner_id, part_kind, content_mjml)
VALUES
  ('template', 'invitation', 'header', $h$<mj-section background-color="#ffffff" padding="20px" border-radius="10px 10px 0px 0px" border-right="1px solid #e5e7eb" border-left="1px solid #e5e7eb" border-top="1px solid #e5e7eb" border-bottom="1px solid #e5e7eb" padding-top="10px" padding-bottom="10px" data-part-kind="header"><mj-column><mj-text color="#000000" font-size="22px" font-weight="bold" align="center">TimePick</mj-text></mj-column></mj-section>$h$),
  ('template', 'invitation', 'content-wrapper', $c$<mj-section background-color="#ffffff" border-radius="0px 0px 10px 10px" border-right="1px solid #e5e7eb" border-bottom="1px solid #e5e7eb" border-left="1px solid #e5e7eb"></mj-section>$c$),
  ('template', 'invitation', 'mj-body', $m$<mj-body background-color="#fafafa" padding-top="30px" padding-bottom="30px"></mj-body>$m$)
ON CONFLICT (owner_kind, owner_id, part_kind) DO NOTHING;

-- (2a) Corps d'invitation — courant (body_mjml) : aligné sur le nouveau gel
--      UNIQUEMENT s'il vaut encore l'ancien gel (admin n'a pas divergé).
--      DOIT s'exécuter AVANT l'UPDATE de default_body_mjml ci-dessous.
UPDATE email_templates
SET body_mjml = $body$<!-- BODY:START -->
<mj-section padding="20px" data-part-kind="body"><mj-column><mj-text font-size="20px" font-weight="bold" padding-bottom="16px">Invitation à {{event_name}}</mj-text><mj-text padding-bottom="8px">Bonjour,</mj-text><mj-text padding-bottom="8px">{{event_description}}</mj-text><mj-text padding-bottom="8px">Pour accéder au calendrier et réserver votre créneau, cliquez sur le bouton ci-dessous :</mj-text><mj-button href="{{magic_link}}" font-weight="bold" padding="20px 0">Réserver mon créneau</mj-button><mj-text color="#999999" align="center" padding-top="0">Ce lien expire le {{expiration_date}}.</mj-text></mj-column></mj-section>
<!-- BODY:END -->$body$
WHERE template_key = 'invitation'
  AND body_mjml = default_body_mjml;

-- (2b) Corps d'invitation — gel usine (default_body_mjml) : nouvelle valeur.
UPDATE email_templates
SET default_body_mjml = $body$<!-- BODY:START -->
<mj-section padding="20px" data-part-kind="body"><mj-column><mj-text font-size="20px" font-weight="bold" padding-bottom="16px">Invitation à {{event_name}}</mj-text><mj-text padding-bottom="8px">Bonjour,</mj-text><mj-text padding-bottom="8px">{{event_description}}</mj-text><mj-text padding-bottom="8px">Pour accéder au calendrier et réserver votre créneau, cliquez sur le bouton ci-dessous :</mj-text><mj-button href="{{magic_link}}" font-weight="bold" padding="20px 0">Réserver mon créneau</mj-button><mj-text color="#999999" align="center" padding-top="0">Ce lien expire le {{expiration_date}}.</mj-text></mj-column></mj-section>
<!-- BODY:END -->$body$
WHERE template_key = 'invitation';
