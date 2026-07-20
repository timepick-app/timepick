-- Chantier C — transport email pluggable (smtp | resend | brevo).
-- Seed idempotent : email_provider='smtp' par défaut → les installs existantes
-- ne voient AUCUN changement de comportement (SMTP reste le défaut absolu).
-- email_api_key : clé API provider HTTP, chiffrée AES-256-GCM par
-- encryption.service (même ENCRYPTION_KEY que smtp_password). '' = absente.
INSERT INTO app_config (key, value) VALUES
    ('email_provider', 'smtp'),
    ('email_api_key', '')
ON CONFLICT (key) DO NOTHING;
