-- ============================================
-- TimePick — Rattrapage forward : coque commune « carte » d'invitation
-- ============================================
-- Contexte : la migration 018 (018_seed_common_card_shell.sql) a été éditée
--            EN PLACE cette session pour éclaircir le modèle d'usine de la
--            coque commune d'invitation (3 parts γ de template[invitation]) :
--              - bordures header / content-wrapper : #18181b → #e5e7eb
--              - fond mj-body                      : #f3f3f3 → #fefefe
--            Or le runner de migrations filtre par version (table
--            schema_migrations) : une DB ayant déjà appliqué l'ANCIENNE 018
--            ne la rejoue jamais. Les rows shell_parts y restent donc périmées
--            → faux positif isInvitationShellCustomized (bouton « Restaurer »
--            bloqué à l'état actif) + bordures sombres au rendu des emails.
--
-- Rôle de cette migration : rattraper ces installs déjà bootées. Elle UPDATE
--            les 3 parts γ (template[invitation]) des ANCIENNES valeurs vers
--            les NOUVELLES, CONDITIONNÉE par un match BYTE-EXACT sur l'ancienne
--            valeur dans le WHERE. Conséquences :
--              - row encore à l'ANCIENNE valeur → migrée vers la NOUVELLE ;
--              - row déjà à la NOUVELLE valeur   → no-op (le WHERE ne matche pas) ;
--              - row personnalisée par l'admin   → no-op (préservée : ni ancienne
--                ni nouvelle valeur).
--            Idempotente par construction. Forward-only.
--
-- Source des valeurs :
--   - NOUVELLES : working tree de 018 (byte-identiques aux constantes TS
--     INVITATION_FACTORY_HEADER_MJML / INVITATION_FACTORY_CONTENT_WRAPPER_MJML
--     / INVITATION_FACTORY_MJBODY_MJML dans shell-parts.service.ts — SSOT).
--   - ANCIENNES : `git show 7955621e^:server/src/migrations/018_seed_common_card_shell.sql`
--     (littéraux avec #18181b / #f3f3f3 antérieurs à l'édition en place).
-- ============================================

-- (1) header — bordures #18181b → #e5e7eb (carte blanche, coins hauts arrondis).
UPDATE shell_parts
SET content_mjml = $h$<mj-section background-color="#ffffff" padding="20px" border-radius="10px 10px 0px 0px" border-right="1px solid #e5e7eb" border-left="1px solid #e5e7eb" border-top="1px solid #e5e7eb" border-bottom="1px solid #e5e7eb" padding-top="10px" padding-bottom="10px" data-part-kind="header"><mj-column><mj-text color="#000000" font-size="22px" font-weight="bold" align="center">TimePick</mj-text></mj-column></mj-section>$h$
WHERE owner_kind = 'template'
  AND owner_id = 'invitation'
  AND part_kind = 'header'
  AND content_mjml = $h$<mj-section background-color="#ffffff" padding="20px" border-radius="10px 10px 0px 0px" border-right="1px solid #18181b" border-left="1px solid #18181b" border-top="1px solid #18181b" border-bottom="1px solid #18181b" padding-top="10px" padding-bottom="10px" data-part-kind="header"><mj-column><mj-text color="#000000" font-size="22px" font-weight="bold" align="center">TimePick</mj-text></mj-column></mj-section>$h$;

-- (2) content-wrapper — bordures #18181b → #e5e7eb (bas de carte, coins bas arrondis).
UPDATE shell_parts
SET content_mjml = $c$<mj-section background-color="#ffffff" border-radius="0px 0px 10px 10px" border-right="1px solid #e5e7eb" border-bottom="1px solid #e5e7eb" border-left="1px solid #e5e7eb"></mj-section>$c$
WHERE owner_kind = 'template'
  AND owner_id = 'invitation'
  AND part_kind = 'content-wrapper'
  AND content_mjml = $c$<mj-section background-color="#ffffff" border-radius="0px 0px 10px 10px" border-right="1px solid #18181b" border-bottom="1px solid #18181b" border-left="1px solid #18181b"></mj-section>$c$;

-- (3) mj-body — fond #f3f3f3 → #fefefe (fond de page quasi-blanc).
UPDATE shell_parts
SET content_mjml = $m$<mj-body background-color="#fefefe" padding-top="30px" padding-bottom="30px"></mj-body>$m$
WHERE owner_kind = 'template'
  AND owner_id = 'invitation'
  AND part_kind = 'mj-body'
  AND content_mjml = $m$<mj-body background-color="#f3f3f3" padding-top="30px" padding-bottom="30px"></mj-body>$m$;
