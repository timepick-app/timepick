-- ============================================
-- TimePick - Email Templates: normalisation salutation + variable prénom
-- ============================================
-- Created: 2026-06-16
--   1. Ajouter un bloc de salutation littérale « Bonjour {{user_first_name}}, » hors zone
--      éditable (avant <!-- INTRO:START --> pour les 7 templates 2-zones ; juste après le
--      titre existant pour invitation et slot_modification).
--   2. Supprimer le préfixe « Bonjour, » ou « Bonjour {{user_name}}, » de la
--      1ère phrase du corps éditable (la casse d'origine est conservée).
--   3. Remplacer tout {{user_name}} résiduel par {{user_first_name}}.
--   4. reservation_confirmation : remplacer le bouton mort {{cancel_link}}/
--      « Annuler ma réservation » par {{calendar_url}}/ « Gérer ma réservation ».
--
--   Seul default_body_mjml est toujours mis à jour (factory). body_mjml ne
--   reçoit la restructuration complète QUE si body_mjml = default_body_mjml
--   (corps non personnalisé). Pour les corps personnalisés (≠ default), un
--   UPDATE séparé remplace uniquement les tokens {{user_name}} et {{cancel_link}}
--   sans toucher la structure HTML.
--
-- Reversibility: rollback script retiré — politique forward-only.
--                Urgence : git revert du SQL + correctif SQL manuel / restauration backup.
--
-- SSOT — Les 7 nouveaux corps 2-zones ci-dessous sont dupliqués dans la
--         constante TS SYSTEM_TEMPLATE_SKELETONS de
--         `server/src/services/email-templates.service.ts`. Toute évolution
--         ultérieure doit mettre à jour LES DEUX endroits en synchro byte-exact.
--         Le SQL ne peut pas importer le module TS au runtime du runner de
--         migrations ; la duplication est volontaire et tracée.
--         invitation et slot_modification n'ont pas de skeleton TS (GrapesJS /
--         hors éditeur 2-zones) : seul le SQL fait foi pour ces deux templates.
-- ============================================
-- Maintenance notes (READ before editing):
--
--   1. Ordre des opérations : d'abord les 9 UPDATEs structurels (un par
--      template), puis l'UPDATE de sécurité token pour corps personnalisés.
--      Ne pas inverser l'ordre.
--   2. Le CASE WHEN body_mjml = default_body_mjml évalue les VALEURS AVANT
--      la mise à jour (PostgreSQL évalue le SET en lisant les colonnes telles
--      qu'elles étaient avant la transaction). L'idempotence en découle :
--      une 2ᵉ exécution trouve body_mjml = nouveau default → CASE THEN →
--      réaffecte le même corps → no-op.
--   3. Pour ajouter un 10ᵉ template : ajouter un bloc UPDATE ci-dessous +
--      l'ajouter dans la liste IN du dernier UPDATE de sécurité.
-- ============================================

-- -----------------------------------------------
-- (1) magic_link_login
-- -----------------------------------------------
UPDATE email_templates
SET
  body_mjml = CASE WHEN body_mjml = default_body_mjml THEN $mjml$<mj-section padding="20px">
  <mj-column>
    <mj-text padding-bottom="16px">Bonjour {{user_first_name}},</mj-text>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">voici votre lien de connexion à votre espace TimePick :</mj-text>
    <!-- INTRO:END -->
    <mj-button href="{{magic_link}}" font-weight="bold" padding="20px 0">Accéder à mon espace</mj-button>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" align="center" padding-top="0">Ce lien expire le {{expiration_date}}.</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>$mjml$ ELSE body_mjml END,
  default_body_mjml = $mjml$<mj-section padding="20px">
  <mj-column>
    <mj-text padding-bottom="16px">Bonjour {{user_first_name}},</mj-text>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">voici votre lien de connexion à votre espace TimePick :</mj-text>
    <!-- INTRO:END -->
    <mj-button href="{{magic_link}}" font-weight="bold" padding="20px 0">Accéder à mon espace</mj-button>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" align="center" padding-top="0">Ce lien expire le {{expiration_date}}.</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>$mjml$
WHERE template_key = 'magic_link_login';

-- -----------------------------------------------
-- (2) reservation_confirmation
--     + correctif bouton : {{cancel_link}}/Annuler → {{calendar_url}}/Gérer
-- -----------------------------------------------
UPDATE email_templates
SET
  body_mjml = CASE WHEN body_mjml = default_body_mjml THEN $mjml$<mj-section padding="20px">
  <mj-column>
    <mj-text padding-bottom="16px">Bonjour {{user_first_name}},</mj-text>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">votre réservation pour {{event_name}} est confirmée. Créneau : {{slot_date}} {{slot_time}}.</mj-text>
    <!-- INTRO:END -->
    <mj-button href="{{calendar_url}}" font-weight="bold" padding="20px 0">Gérer ma réservation</mj-button>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" align="center" padding-top="0">À très bientôt !</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>$mjml$ ELSE body_mjml END,
  default_body_mjml = $mjml$<mj-section padding="20px">
  <mj-column>
    <mj-text padding-bottom="16px">Bonjour {{user_first_name}},</mj-text>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">votre réservation pour {{event_name}} est confirmée. Créneau : {{slot_date}} {{slot_time}}.</mj-text>
    <!-- INTRO:END -->
    <mj-button href="{{calendar_url}}" font-weight="bold" padding="20px 0">Gérer ma réservation</mj-button>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" align="center" padding-top="0">À très bientôt !</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>$mjml$
WHERE template_key = 'reservation_confirmation';

-- -----------------------------------------------
-- (3) account_created
-- -----------------------------------------------
UPDATE email_templates
SET
  body_mjml = CASE WHEN body_mjml = default_body_mjml THEN $mjml$<mj-section padding="20px">
  <mj-column>
    <mj-text padding-bottom="16px">Bonjour {{user_first_name}},</mj-text>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">votre compte vient d'être créé. Cliquez sur le bouton ci-dessous pour vous connecter à votre espace.</mj-text>
    <!-- INTRO:END -->
    <mj-button href="{{login_url}}" font-weight="bold" padding="20px 0">Accéder à mon espace</mj-button>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" align="center" padding-top="0">Saisissez votre adresse email pour recevoir un lien de connexion sécurisé. À bientôt !</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>$mjml$ ELSE body_mjml END,
  default_body_mjml = $mjml$<mj-section padding="20px">
  <mj-column>
    <mj-text padding-bottom="16px">Bonjour {{user_first_name}},</mj-text>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">votre compte vient d'être créé. Cliquez sur le bouton ci-dessous pour vous connecter à votre espace.</mj-text>
    <!-- INTRO:END -->
    <mj-button href="{{login_url}}" font-weight="bold" padding="20px 0">Accéder à mon espace</mj-button>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" align="center" padding-top="0">Saisissez votre adresse email pour recevoir un lien de connexion sécurisé. À bientôt !</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>$mjml$
WHERE template_key = 'account_created';

-- -----------------------------------------------
-- (4) role_promoted
-- -----------------------------------------------
UPDATE email_templates
SET
  body_mjml = CASE WHEN body_mjml = default_body_mjml THEN $mjml$<mj-section padding="20px">
  <mj-column>
    <mj-text padding-bottom="16px">Bonjour {{user_first_name}},</mj-text>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">votre accès sur TimePick a été mis à jour. Vous êtes désormais Administrateur : vous pouvez gérer les membres, les événements et les paramètres.</mj-text>
    <!-- INTRO:END -->
    <mj-button href="{{login_url}}" font-weight="bold" padding="20px 0">Accéder à TimePick</mj-button>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" align="center" padding-top="0">Connectez-vous avec votre adresse email pour retrouver votre espace. À bientôt !</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>$mjml$ ELSE body_mjml END,
  default_body_mjml = $mjml$<mj-section padding="20px">
  <mj-column>
    <mj-text padding-bottom="16px">Bonjour {{user_first_name}},</mj-text>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">votre accès sur TimePick a été mis à jour. Vous êtes désormais Administrateur : vous pouvez gérer les membres, les événements et les paramètres.</mj-text>
    <!-- INTRO:END -->
    <mj-button href="{{login_url}}" font-weight="bold" padding="20px 0">Accéder à TimePick</mj-button>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" align="center" padding-top="0">Connectez-vous avec votre adresse email pour retrouver votre espace. À bientôt !</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>$mjml$
WHERE template_key = 'role_promoted';

-- -----------------------------------------------
-- (5) role_demoted
-- -----------------------------------------------
UPDATE email_templates
SET
  body_mjml = CASE WHEN body_mjml = default_body_mjml THEN $mjml$<mj-section padding="20px">
  <mj-column>
    <mj-text padding-bottom="16px">Bonjour {{user_first_name}},</mj-text>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">votre accès sur TimePick a été ajusté. Vous êtes désormais Membre : vous continuez à accéder à vos événements et à votre profil ; les fonctions d'administration ne sont plus disponibles.</mj-text>
    <!-- INTRO:END -->
    <mj-button href="{{login_url}}" font-weight="bold" padding="20px 0">Accéder à TimePick</mj-button>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" align="center" padding-top="0">Connectez-vous avec votre adresse email pour retrouver votre espace. À bientôt !</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>$mjml$ ELSE body_mjml END,
  default_body_mjml = $mjml$<mj-section padding="20px">
  <mj-column>
    <mj-text padding-bottom="16px">Bonjour {{user_first_name}},</mj-text>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">votre accès sur TimePick a été ajusté. Vous êtes désormais Membre : vous continuez à accéder à vos événements et à votre profil ; les fonctions d'administration ne sont plus disponibles.</mj-text>
    <!-- INTRO:END -->
    <mj-button href="{{login_url}}" font-weight="bold" padding="20px 0">Accéder à TimePick</mj-button>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" align="center" padding-top="0">Connectez-vous avec votre adresse email pour retrouver votre espace. À bientôt !</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>$mjml$
WHERE template_key = 'role_demoted';

-- -----------------------------------------------
-- (6) cancellation_confirmation
-- -----------------------------------------------
UPDATE email_templates
SET
  body_mjml = CASE WHEN body_mjml = default_body_mjml THEN $mjml$<mj-section padding="20px">
  <mj-column>
    <mj-text padding-bottom="16px">Bonjour {{user_first_name}},</mj-text>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">nous vous informons que le créneau de participation suivant a été annulé :</mj-text>
    <!-- INTRO:END -->
    <mj-text padding-bottom="4px"><strong>Événement :</strong> {{event_name}}</mj-text>
    <mj-text padding-bottom="4px"><strong>Date :</strong> {{slot_date}}</mj-text>
    <mj-text padding-bottom="8px"><strong>Horaires :</strong> {{slot_time}}</mj-text>
    <mj-text padding-bottom="8px">{{cancellation_reason}}</mj-text>
    <mj-text padding-bottom="8px">Veuillez consulter le calendrier pour choisir un autre créneau disponible.</mj-text>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" padding-top="0">Cordialement, L'équipe d'organisation</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>$mjml$ ELSE body_mjml END,
  default_body_mjml = $mjml$<mj-section padding="20px">
  <mj-column>
    <mj-text padding-bottom="16px">Bonjour {{user_first_name}},</mj-text>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">nous vous informons que le créneau de participation suivant a été annulé :</mj-text>
    <!-- INTRO:END -->
    <mj-text padding-bottom="4px"><strong>Événement :</strong> {{event_name}}</mj-text>
    <mj-text padding-bottom="4px"><strong>Date :</strong> {{slot_date}}</mj-text>
    <mj-text padding-bottom="8px"><strong>Horaires :</strong> {{slot_time}}</mj-text>
    <mj-text padding-bottom="8px">{{cancellation_reason}}</mj-text>
    <mj-text padding-bottom="8px">Veuillez consulter le calendrier pour choisir un autre créneau disponible.</mj-text>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" padding-top="0">Cordialement, L'équipe d'organisation</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>$mjml$
WHERE template_key = 'cancellation_confirmation';

-- -----------------------------------------------
-- (7) unregistration_confirmation
-- -----------------------------------------------
UPDATE email_templates
SET
  body_mjml = CASE WHEN body_mjml = default_body_mjml THEN $mjml$<mj-section padding="20px">
  <mj-column>
    <mj-text padding-bottom="16px">Bonjour {{user_first_name}},</mj-text>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">nous vous confirmons votre désinscription du créneau de participation suivant :</mj-text>
    <!-- INTRO:END -->
    <mj-text padding-bottom="4px"><strong>Événement :</strong> {{event_name}}</mj-text>
    <mj-text padding-bottom="4px"><strong>Date :</strong> {{slot_date}}</mj-text>
    <mj-text padding-bottom="8px"><strong>Horaires :</strong> {{slot_time}}</mj-text>
    <mj-text padding-bottom="8px">Vous pouvez vous réinscrire à tout moment depuis le calendrier si vous changez d'avis.</mj-text>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" padding-top="0">Cordialement, L'équipe d'organisation</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>$mjml$ ELSE body_mjml END,
  default_body_mjml = $mjml$<mj-section padding="20px">
  <mj-column>
    <mj-text padding-bottom="16px">Bonjour {{user_first_name}},</mj-text>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">nous vous confirmons votre désinscription du créneau de participation suivant :</mj-text>
    <!-- INTRO:END -->
    <mj-text padding-bottom="4px"><strong>Événement :</strong> {{event_name}}</mj-text>
    <mj-text padding-bottom="4px"><strong>Date :</strong> {{slot_date}}</mj-text>
    <mj-text padding-bottom="8px"><strong>Horaires :</strong> {{slot_time}}</mj-text>
    <mj-text padding-bottom="8px">Vous pouvez vous réinscrire à tout moment depuis le calendrier si vous changez d'avis.</mj-text>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" padding-top="0">Cordialement, L'équipe d'organisation</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>$mjml$
WHERE template_key = 'unregistration_confirmation';

-- -----------------------------------------------
-- (8) invitation
--     Remplace <mj-text padding-bottom="8px">Bonjour,</mj-text>
--     par <mj-text padding-bottom="16px">Bonjour {{user_first_name}},</mj-text>
-- -----------------------------------------------
UPDATE email_templates
SET
  body_mjml = CASE WHEN body_mjml = default_body_mjml THEN $mjml$<!-- BODY:START -->
<mj-section padding="20px" data-part-kind="body"><mj-column><mj-text font-size="20px" font-weight="bold" padding-bottom="16px">Invitation à {{event_name}}</mj-text><mj-text padding-bottom="16px">Bonjour {{user_first_name}},</mj-text><mj-text padding-bottom="8px">{{event_description}}</mj-text><mj-text padding-bottom="8px">Pour accéder au calendrier et réserver votre créneau, cliquez sur le bouton ci-dessous :</mj-text><mj-button href="{{magic_link}}" font-weight="bold" padding="20px 0">Réserver mon créneau</mj-button><mj-text color="#999999" align="center" padding-top="0">Ce lien expire le {{expiration_date}}.</mj-text></mj-column></mj-section>
<!-- BODY:END -->$mjml$ ELSE body_mjml END,
  default_body_mjml = $mjml$<!-- BODY:START -->
<mj-section padding="20px" data-part-kind="body"><mj-column><mj-text font-size="20px" font-weight="bold" padding-bottom="16px">Invitation à {{event_name}}</mj-text><mj-text padding-bottom="16px">Bonjour {{user_first_name}},</mj-text><mj-text padding-bottom="8px">{{event_description}}</mj-text><mj-text padding-bottom="8px">Pour accéder au calendrier et réserver votre créneau, cliquez sur le bouton ci-dessous :</mj-text><mj-button href="{{magic_link}}" font-weight="bold" padding="20px 0">Réserver mon créneau</mj-button><mj-text color="#999999" align="center" padding-top="0">Ce lien expire le {{expiration_date}}.</mj-text></mj-column></mj-section>
<!-- BODY:END -->$mjml$
WHERE template_key = 'invitation';

-- -----------------------------------------------
-- (9) slot_modification
--     Insère Bonjour {{user_first_name}}, après le titre ; retire « Bonjour {{user_name}}, »
-- -----------------------------------------------
UPDATE email_templates
SET
  body_mjml = CASE WHEN body_mjml = default_body_mjml THEN $mjml$<mj-section padding="20px">
  <mj-column>
    <mj-text font-size="18px" font-weight="bold" padding-bottom="8px">Votre créneau a été modifié</mj-text>
    <mj-text padding-bottom="16px">Bonjour {{user_first_name}},</mj-text>
    <mj-text padding-bottom="12px">le créneau « {{event_name}} » auquel vous êtes inscrit·e a été modifié.</mj-text>
    <mj-text>{{changes_blocks}}</mj-text>
    <mj-button href="{{calendar_url}}" font-weight="bold" padding="20px 0">Gérer ma réservation</mj-button>
  </mj-column>
</mj-section>$mjml$ ELSE body_mjml END,
  default_body_mjml = $mjml$<mj-section padding="20px">
  <mj-column>
    <mj-text font-size="18px" font-weight="bold" padding-bottom="8px">Votre créneau a été modifié</mj-text>
    <mj-text padding-bottom="16px">Bonjour {{user_first_name}},</mj-text>
    <mj-text padding-bottom="12px">le créneau « {{event_name}} » auquel vous êtes inscrit·e a été modifié.</mj-text>
    <mj-text>{{changes_blocks}}</mj-text>
    <mj-button href="{{calendar_url}}" font-weight="bold" padding="20px 0">Gérer ma réservation</mj-button>
  </mj-column>
</mj-section>$mjml$
WHERE template_key = 'slot_modification';

-- -----------------------------------------------
-- Sécurité token — corps PERSONNALISÉS (body_mjml ≠ default après 029)
-- Remplace {{user_name}} → {{user_first_name}} et {{cancel_link}} →
-- {{calendar_url}} sans toucher la structure HTML (utile si un admin a
-- personnalisé le corps AVANT la migration 029 et que sa version contient
-- encore les anciens tokens).
-- -----------------------------------------------
UPDATE email_templates
SET body_mjml = REPLACE(
                  REPLACE(body_mjml, '{{user_name}}', '{{user_first_name}}'),
                  '{{cancel_link}}', '{{calendar_url}}'
                )
WHERE template_key IN (
    'invitation',
    'magic_link_login',
    'reservation_confirmation',
    'cancellation_confirmation',
    'account_created',
    'slot_modification',
    'role_promoted',
    'role_demoted',
    'unregistration_confirmation'
  )
  AND body_mjml != default_body_mjml;

-- ============================================
-- End of Migration 029
-- ============================================
