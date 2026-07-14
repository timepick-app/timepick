-- Add SMTP configuration keys to app_config
INSERT INTO app_config (key, value) VALUES
    ('smtp_host', ''),
    ('smtp_port', ''),
    ('smtp_secure', 'false'),
    ('smtp_user', ''),
    ('smtp_password', ''),
    ('smtp_from_name', 'TimePick'),
    ('smtp_from_email', '')
ON CONFLICT (key) DO NOTHING;
