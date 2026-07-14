-- ============================================
-- TimePick - Email Templates : retrait du nom « TimePick » des rédactionnels et boutons
-- ============================================
-- Created: 2026-06-17
-- Purpose: Le nom de l'application ne doit plus être cité dans le contenu
--          éditorial ni les libellés de boutons des modèles (il reste dans
--          l'en-tête/coque comme titre de marque). 5 occurrences :
--            - magic_link_login : intro « …votre espace TimePick : » → « …votre espace : »
--            - role_promoted    : intro « votre accès sur TimePick a été mis à jour. » → « votre accès a été mis à jour. » + aération
--            - role_demoted     : intro « votre accès sur TimePick a été ajusté. » → « votre accès a été ajusté. » + aération
--            - role_promoted/role_demoted : bouton « Accéder à TimePick » → « Accéder à mon espace »
--          L'aération ajoute un <br/><br/> après la 1ʳᵉ phrase des intros role.
--
--   Plain REPLACE sur body_mjml ET default_body_mjml. Les intros sont en zone
--   éditable : un REPLACE de la sous-chaîne exacte retire « TimePick » des corps
--   factory ET des corps personnalisés qui auraient conservé la phrase (no-op si
--   l'admin l'a réécrite). Les libellés de boutons sont en zone figée (skeleton
--   SSOT). Pattern forward-only, comme migrations 031/032/033.
--
-- Reversibility: rollback script retiré — politique forward-only.
--                Urgence : git revert du SQL + correctif SQL manuel / restauration backup.
--
-- SSOT — Les libellés de boutons role_promoted/role_demoted sont mis à jour en
--         synchro dans SYSTEM_TEMPLATE_SKELETONS (`email-templates.service.ts`)
--         et SYSTEM_FIXED_MIDDLE (`client/.../systemCanvas.ts`). Les intros
--         éditoriales n'existent qu'en base (zone {{introText}}).
-- ============================================

-- (1) magic_link_login : intro
UPDATE email_templates
SET
  body_mjml = REPLACE(body_mjml, 'voici votre lien de connexion à votre espace TimePick :', 'voici votre lien de connexion à votre espace :'),
  default_body_mjml = REPLACE(default_body_mjml, 'voici votre lien de connexion à votre espace TimePick :', 'voici votre lien de connexion à votre espace :')
WHERE template_key = 'magic_link_login';

-- (2) role_promoted : intro (retrait TimePick + aération) + bouton
UPDATE email_templates
SET
  body_mjml = REPLACE(
    REPLACE(
      body_mjml,
      'votre accès sur TimePick a été mis à jour. Vous êtes désormais Administrateur',
      'votre accès a été mis à jour.<br/><br/>Vous êtes désormais Administrateur'
    ),
    '>Accéder à TimePick</mj-button>',
    '>Accéder à mon espace</mj-button>'
  ),
  default_body_mjml = REPLACE(
    REPLACE(
      default_body_mjml,
      'votre accès sur TimePick a été mis à jour. Vous êtes désormais Administrateur',
      'votre accès a été mis à jour.<br/><br/>Vous êtes désormais Administrateur'
    ),
    '>Accéder à TimePick</mj-button>',
    '>Accéder à mon espace</mj-button>'
  )
WHERE template_key = 'role_promoted';

-- (3) role_demoted : intro (retrait TimePick + aération) + bouton
UPDATE email_templates
SET
  body_mjml = REPLACE(
    REPLACE(
      body_mjml,
      'votre accès sur TimePick a été ajusté. Vous êtes désormais Membre',
      'votre accès a été ajusté.<br/><br/>Vous êtes désormais Membre'
    ),
    '>Accéder à TimePick</mj-button>',
    '>Accéder à mon espace</mj-button>'
  ),
  default_body_mjml = REPLACE(
    REPLACE(
      default_body_mjml,
      'votre accès sur TimePick a été ajusté. Vous êtes désormais Membre',
      'votre accès a été ajusté.<br/><br/>Vous êtes désormais Membre'
    ),
    '>Accéder à TimePick</mj-button>',
    '>Accéder à mon espace</mj-button>'
  )
WHERE template_key = 'role_demoted';

-- ============================================
-- End of Migration 034
-- ============================================
