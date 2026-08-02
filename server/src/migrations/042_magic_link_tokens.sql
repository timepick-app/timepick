-- ============================================
-- TimePick - Magic links à usage unique : table de jetons
-- ============================================
-- Created: 2026-07-31
-- Context: CRITICAL-002
--
-- Purpose: un lien magique était rejouable autant de fois qu'on le cliquait
--          jusqu'à son `exp`. La colonne `users.magic_link_token` existait bien,
--          mais AUCUN code de production ne la lisait : la passer à NULL après
--          usage aurait été un no-op. Cette migration installe le support d'une
--          vraie consommation — une ligne par lien émis, consommée une seule fois.
--
-- Pourquoi une TABLE et pas la colonne existante :
--          `users.magic_link_token` est une colonne UNIQUE par utilisateur, donc
--          chaque émission écrase la précédente. Or plusieurs liens vivants pour
--          un même membre est le cas NOMINAL du produit : `event_users` est M:N,
--          le TTL d'invitation est fixe (`userTTL`, 7 j par défaut) et indépendant
--          de la date de l'événement, et `resendUnanswered` réémet précisément
--          vers des membres qui détiennent encore un lien vivant non cliqué. Avec
--          une colonne unique, une invitation à l'événement B tuerait sans un mot
--          le lien de l'événement A.
--
-- Reversibility: politique forward-only, aucun script de rollback.
--                Urgence : git revert du SQL + restauration backup.
--
-- Note append-only: cette migration ne modifie jamais 001.
-- ============================================
-- Maintenance notes (READ before editing):
--
--   1. `token` porte le JWT complet, comme le faisait la colonne remplacée. Le
--      stocker haché serait un durcissement réel (une fuite de base ne livrerait
--      plus de liens utilisables) mais c'est un autre chantier : il rendrait
--      indécodables les assertions existantes de auth-login.test.ts, qui lisent
--      le payload du jeton stocké. Périmètre fermé, cf. plan § A6.
--
--   2. Pas de purge automatique des lignes expirées ou consommées. Volumétrie
--      attendue : un enregistrement par lien émis, soit quelques milliers par an
--      pour une association. Le jour où cela pèse, une purge périodique
--      `DELETE FROM magic_link_tokens WHERE expires_at < NOW() - INTERVAL '30 days'`
--      suffit — ne pas la mettre sur le chemin critique de connexion.
--
--   3. Le lien bootstrap du premier administrateur n'a PAS de ligne ici, et ne
--      peut pas en avoir : setup.service.ts signe son JWT alors que le compte
--      n'existe pas encore (aucun user_id à référencer). L'exemption est écrite
--      explicitement dans auth.controller.ts (branche `payload.bootstrap`).
-- ============================================

-- Étape 1 : la table de jetons. Une ligne par lien émis.
CREATE TABLE IF NOT EXISTS magic_link_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    consumed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE magic_link_tokens IS 'Un enregistrement par lien magique émis. La consommation est un UPDATE conditionnel sur consumed_at IS NULL : atomique, donc deux clics simultanés sur le même lien n''ouvrent qu''une seule session.';
COMMENT ON COLUMN magic_link_tokens.token IS 'JWT complet du lien magique. UNIQUE : sert aussi d''index de recherche à la vérification.';
COMMENT ON COLUMN magic_link_tokens.expires_at IS 'Miroir du claim exp du JWT. Redondant avec la signature (jwt.verify rejette déjà un jeton expiré) mais indispensable à une purge lisible sans décoder chaque ligne.';
COMMENT ON COLUMN magic_link_tokens.consumed_at IS 'NULL tant que le lien n''a pas servi. Non NULL = lien déjà utilisé, rejeté par POST /api/auth/verify.';

-- FK sans index = seq scan sur cette table à chaque suppression d'utilisateur
-- (admin qui supprime un membre, nettoyage des tests). Une ligne pour l'éviter.
CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_user_id ON magic_link_tokens(user_id);

-- Étape 2 : retirer les colonnes remplacées. Elles n'ont jamais été lues par du
-- code de production (seulement écrites en trois endroits et relues par des
-- tests) : rien à migrer, aucun jeton en vol à préserver. Le projet est pré-V1,
-- aucune compatibilité descendante à tenir.
ALTER TABLE users
    DROP COLUMN IF EXISTS magic_link_token,
    DROP COLUMN IF EXISTS token_expires_at;

-- ============================================
-- End of Migration 042
-- ============================================
