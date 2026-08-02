-- Objet des e-mails modifiable, sur les trois niveaux.
--
-- CHOIX DE STOCKAGE : la base ne porte QUE la personnalisation. Les objets
-- d'usine restent dans le code (`factorySubject`, switch exhaustif sur
-- TemplateKey), contrairement au corps qui est stocké en double
-- (`body_mjml` + `default_body_mjml`, migration 006) pour pouvoir restaurer
-- l'usine sans aller la rechercher sur disque. Un objet fait 40 caractères et
-- sa valeur d'usine est déjà dans le code : la dupliquer en base imposerait
-- deux colonnes de plus, un semis, un rattrapage des 9 lignes existantes
-- (`ON CONFLICT DO NOTHING` n'alimente pas une colonne ajoutée après coup) et
-- l'élargissement de la contrainte CHECK sur template_key — tout cela pour
-- une donnée déjà disponible sur place.
--
-- Conséquences directes de ce choix, à ne pas défaire :
--   * NULL n'est pas « pas encore rempli », c'est « pas de personnalisation » ;
--   * « Revenir au modèle par défaut » = effacer la personnalisation ;
--   * slot_modification, hors périmètre, continue de lire l'usine sans que
--     rien de particulier soit prévu pour lui ;
--   * le contrôle à la compilation qu'un nouveau modèle a un objet est
--     conservé : c'est le switch exhaustif qui le porte.
--
-- Résolution à l'envoi, dans cet ordre :
--   events.invitation_subject → email_templates.subject → objet d'usine.
-- Objet résolu vide après interpolation et nettoyage ⇒ repli sur l'usine, donc
-- un e-mail sans objet est impossible quoi que contienne la base.

ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS subject_admin TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS invitation_subject TEXT;

COMMENT ON COLUMN email_templates.subject IS
  'Objet personnalisé du modèle. NULL = objet d''usine (registre factorySubject dans le code). Jamais semé.';

COMMENT ON COLUMN email_templates.subject_admin IS
  'Variante administrateur de l''objet personnalisé. Utilisée par magic_link_login seul (deux objets d''usine selon le drapeau is_admin). NULL = objet d''usine.';

COMMENT ON COLUMN events.invitation_subject IS
  'Objet de l''invitation surchargé pour cet événement. NULL = hérite de email_templates.subject, qui lui-même retombe sur l''usine si NULL.';
