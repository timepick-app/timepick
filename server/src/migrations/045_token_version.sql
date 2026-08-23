-- Révocation minimale de session (F-085, pentest 2026-08-19).
--
-- Il n'existait aucun état côté serveur liant un JWT de session à son émission
-- réelle : un token volé restait valide jusqu'à `exp`, sans logout ni rotation
-- possible. `token_version` est un compteur par utilisateur, embarqué dans le
-- claim `tv` de chaque token de session (login/verify/refresh/test-login/
-- emergency-login — jamais les magic links, qui restent verrouillés par
-- `magic_link_tokens`). `requireAuth` compare `tv` du token à la valeur DB
-- courante : un mismatch invalide le token immédiatement (`SESSION_INVALID`),
-- sans attendre son expiration naturelle.
--
-- `POST /api/auth/logout` incrémente ce compteur : tous les tokens émis avant
-- l'appel deviennent instantanément inutilisables, y compris pour rafraîchir
-- (le refresh ré-émet avec le `tv` courant, il ne fait pas tourner la version).
--
-- Défaut 0 : un token SANS claim `tv` (émis avant ce correctif, ou provenant
-- d'un helper de test qui ne le pose pas) est traité comme `tv=0` côté
-- vérification — compatible avec tout utilisateur qui ne s'est jamais
-- déconnecté (valeur DB par défaut également 0), et rejeté dès le premier
-- logout (la valeur DB passe à 1, un token sans claim ne matche plus).
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN users.token_version IS
  'Compteur de révocation de session. Incrémenté par POST /api/auth/logout ; comparé au claim JWT `tv` par requireAuth (mismatch = 401 SESSION_INVALID).';
