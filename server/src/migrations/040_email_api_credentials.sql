-- Chantier email-providers (B1) — modèle d'identifiants multi-champ (contrat §2.2).
-- email_api_credentials : objet JSON {champ: valeur} sérialisé en TEXT, remplace
-- à terme le mono-champ email_api_key (CONSERVÉ, cf. reprise + rollback ci-dessous).
-- Les champs `secret` du fournisseur courant sont chiffrés individuellement
-- (AES-256-GCM, encryption.service, même ENCRYPTION_KEY que smtp_password /
-- email_api_key — aucune nouvelle crypto) ; les non-secrets restent en clair.
-- '' = absente.
INSERT INTO app_config (key, value) VALUES
    ('email_api_credentials', '')
ON CONFLICT (key) DO NOTHING;

-- Reprise resend : les installs déjà en provider='resend' avec une email_api_key
-- posée (non vide, non sentinelle '****') migrent CETTE MÊME VALEUR CHIFFRÉE vers
-- email_api_credentials = {"apiKey": "<valeur>"}. Copie brute — le format
-- encrypt() = base64(iv‖ciphertext‖tag) est stable et directement réutilisable
-- sous la nouvelle clé JSON — AUCUN round-trip crypto (pas de decrypt+reencrypt),
-- confirmé en revue technique.
-- Idempotente : la garde `email_api_credentials = ''` évite d'écraser une
-- config déjà migrée (ou déjà posée en multi-champ par une réexécution
-- ultérieure). email_api_key EST CONSERVÉ (non supprimé) — rollback à portée
-- limitée aux installs resend pré-040 (cf. contrat §2.2/§7.4).
UPDATE app_config
SET value = json_build_object('apiKey', (SELECT value FROM app_config WHERE key = 'email_api_key'))::text,
    updated_at = NOW()
WHERE key = 'email_api_credentials'
  AND value = ''
  AND (SELECT value FROM app_config WHERE key = 'email_provider') = 'resend'
  AND (SELECT value FROM app_config WHERE key = 'email_api_key') NOT IN ('', '****');
