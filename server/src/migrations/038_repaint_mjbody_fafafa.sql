-- ============================================
-- TimePick — Rattrapage forward : fond de page email #fefefe → #fafafa
-- ============================================
-- Contexte : la SSOT du fond de page email (MJ_BODY_BACKGROUND_COLOR dans
--            shared/src/constants/email.ts) passe de #fefefe à #fafafa, et la
--            migration 018 a été éditée EN PLACE cette session pour aligner son
--            littéral $m$ du seed factory (template[invitation]/mj-body).
--            Or le runner de migrations filtre par version (table
--            schema_migrations) : une DB ayant déjà appliqué l'ANCIENNE 018
--            ne la rejoue jamais. La row shell_parts(template, invitation,
--            mj-body) y reste à #fefefe → rendu périmé.
--
-- Rôle de cette migration : rattraper ces installs déjà bootées. Elle UPDATE
--            la part mj-body (template[invitation]) de l'ANCIENNE valeur (#fefefe)
--            vers la NOUVELLE (#fafafa), CONDITIONNÉE par un match BYTE-EXACT sur
--            l'ancienne valeur dans le WHERE. Conséquences :
--              - row encore à #fefefe → migrée vers #fafafa ;
--              - row déjà à #fafafa    → no-op (le WHERE ne matche pas) ;
--              - row personnalisée     → no-op (préservée).
--            Idempotente par construction. Forward-only.
-- ============================================

-- mj-body — fond de page #fefefe → #fafafa.
UPDATE shell_parts
SET content_mjml = $m$<mj-body background-color="#fafafa" padding-top="30px" padding-bottom="30px"></mj-body>$m$
WHERE owner_kind = 'template'
  AND owner_id = 'invitation'
  AND part_kind = 'mj-body'
  AND content_mjml = $m$<mj-body background-color="#fefefe" padding-top="30px" padding-bottom="30px"></mj-body>$m$;
