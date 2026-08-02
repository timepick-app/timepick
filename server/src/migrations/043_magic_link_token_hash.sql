-- ============================================
-- TimePick - Magic links : empreinte au lieu du jeton en clair
-- ============================================
-- Created: 2026-07-31
--
-- Purpose: `magic_link_tokens.token` portait le JWT complet, en clair (migration
--          042). Une fuite de base livrait donc tous les liens ENCORE EN ATTENTE
--          (consumed_at IS NULL, non expirés) : chacun ouvre une session, avec un
--          TTL membre de 7 jours par défaut. C'était le seul identifiant vivant
--          stocké en clair du dépôt — le mot de passe SMTP est chiffré, les codes
--          de secours sont hachés en bcrypt.
--
--          Après cette migration la base ne porte plus qu'une empreinte sha256 :
--          elle suffit à retrouver la ligne d'un lien présenté, jamais à
--          reconstituer un lien.
--
-- Pourquoi sha256 nu, sans sel ni bcrypt : le secret protégé n'est pas un mot de
--          passe humain mais un JWT signé HMAC-SHA256 — plus de 128 bits
--          d'entropie dans la seule signature. Aucune attaque par dictionnaire
--          n'est possible, donc ni sel ni facteur de coût n'ajouteraient quoi que
--          ce soit ; un hachage lent, lui, pèserait sur le chemin de connexion.
--          Le `crypto` de Node suffit côté applicatif, pgcrypto n'est pas requis
--          ici (`sha256(bytea)` est natif depuis PostgreSQL 11, le projet exige 16+).
--
-- Reversibility: politique forward-only, aucun script de rollback. Cette migration
--                est de surcroît irréversible par nature : le clair est détruit.
--                Conséquence acceptée — les liens en attente restent valides (ils
--                sont convertis en place, cf. étape 2), rien n'est invalidé.
--
-- Note append-only: cette migration ne modifie jamais 001.
-- ============================================
-- Maintenance notes (READ before editing):
--
--   1. La conversion des lignes existantes DOIT rester dans la même garde que le
--      renommage. Rejouée seule, elle hacherait des empreintes déjà hachées et
--      tuerait silencieusement tous les liens en attente.
--
--   2. `encode(sha256(token::bytea), 'hex')` produit exactement ce que calcule
--      `magicLinkTokenHash()` (auth.service.ts) :
--      `createHash('sha256').update(token).digest('hex')`. Le JWT est de l'ASCII
--      pur (base64url + points), donc `::bytea` et l'encodage utf8 de Node
--      donnent la même suite d'octets. Toute divergence ici rendrait les liens
--      en attente inconsommables sans le moindre message d'erreur.
--
--   3. La note 1 de la migration 042 (« stocker haché serait un durcissement
--      réel… autre chantier ») est levée par ce fichier. Sa note 2 (pas de purge)
--      tient toujours.
-- ============================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'magic_link_tokens' AND column_name = 'token'
    ) THEN
        -- Étape 1 : le nom dit ce que la colonne porte.
        ALTER TABLE magic_link_tokens RENAME COLUMN token TO token_hash;

        -- Étape 2 : conversion en place des liens déjà émis. Les liens en attente
        -- continuent de fonctionner — la vérification cherche désormais par
        -- empreinte, et c'est l'empreinte qui est maintenant en base.
        UPDATE magic_link_tokens SET token_hash = encode(sha256(token_hash::bytea), 'hex');

        -- Étape 3 : l'index unique suit le nom de sa colonne (créé par la
        -- contrainte UNIQUE de 042, donc nommé d'après l'ancienne colonne).
        IF EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'magic_link_tokens_token_key'
        ) THEN
            ALTER TABLE magic_link_tokens
                RENAME CONSTRAINT magic_link_tokens_token_key TO magic_link_tokens_token_hash_key;
        END IF;
    END IF;
END $$;

COMMENT ON COLUMN magic_link_tokens.token_hash IS 'Empreinte sha256 (hex) du JWT du lien magique — jamais le jeton lui-même. UNIQUE : sert aussi d''index de recherche à la vérification. Une fuite de cette table ne livre aucun lien utilisable.';

-- ============================================
-- End of Migration 043
-- ============================================
