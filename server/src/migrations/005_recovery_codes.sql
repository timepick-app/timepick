-- ============================================
-- TimePick - Admin Emergency Recovery Codes
-- ============================================
-- Story: Admin Emergency Recovery Codes
-- Created: 2026-04-19
-- Purpose: Enable admin account recovery when SMTP is unavailable via
--          one-time recovery codes stored as bcrypt hashes.
-- ============================================

-- ============================================
-- TABLE: admin_recovery_codes
-- ============================================
CREATE TABLE IF NOT EXISTS admin_recovery_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID NOT NULL,
    code_hash TEXT NOT NULL,
    code_index SMALLINT NOT NULL,
    used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_recovery_codes_admin
        FOREIGN KEY (admin_id)
        REFERENCES users(id)
        ON DELETE CASCADE,
    CONSTRAINT admin_recovery_codes_index_range
        CHECK (code_index >= 1 AND code_index <= 8)
);

CREATE INDEX IF NOT EXISTS idx_admin_recovery_codes_admin_id
    ON admin_recovery_codes(admin_id);

COMMENT ON TABLE admin_recovery_codes IS 'One-time recovery codes for admin emergency login (bcrypt-hashed).';
COMMENT ON COLUMN admin_recovery_codes.code_hash IS 'bcrypt hash of the plaintext code — never store plaintext.';
COMMENT ON COLUMN admin_recovery_codes.code_index IS 'Position 1-8 of the code within the batch (for UX reference).';
COMMENT ON COLUMN admin_recovery_codes.used_at IS 'NULL = unused; timestamp = consumed or invalidated.';
COMMENT ON COLUMN admin_recovery_codes.expires_at IS 'UTC timestamp after which the code is no longer valid.';

-- ============================================
-- TABLE: recovery_audit_log
-- ============================================
CREATE TABLE IF NOT EXISTS recovery_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID,
    ip_address INET,
    user_agent TEXT,
    result VARCHAR(30) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_recovery_audit_admin
        FOREIGN KEY (admin_id)
        REFERENCES users(id)
        ON DELETE SET NULL,
    CONSTRAINT recovery_audit_log_result_check
        CHECK (result IN ('success', 'invalid_code', 'account_locked', 'expired', 'unknown_account'))
);

CREATE INDEX IF NOT EXISTS idx_recovery_audit_log_admin_created
    ON recovery_audit_log(admin_id, created_at DESC);

COMMENT ON TABLE recovery_audit_log IS 'Audit trail of every emergency-login attempt (success + failure).';

-- ============================================
-- TABLE: users - Additional Columns
-- ============================================
ALTER TABLE users
ADD COLUMN IF NOT EXISTS recovery_codes_dismissed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_recovery_resend_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_emergency_login_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_emergency_login_ip INET,
ADD COLUMN IF NOT EXISTS emergency_login_notified BOOLEAN NOT NULL DEFAULT true;

-- Backfill guard: if the column pre-existed with the incorrect DEFAULT false,
-- migrate any un-touched rows to the new semantic (true = no pending alert).
-- Safe to run repeatedly: only rows that have never seen an emergency login
-- get flipped. Rows with last_emergency_login_at IS NOT NULL are left alone —
-- their flag is legitimately false while the admin has an unacknowledged
-- emergency-login event to dismiss.
UPDATE users
SET emergency_login_notified = true
WHERE emergency_login_notified = false
  AND last_emergency_login_at IS NULL;

COMMENT ON COLUMN users.recovery_codes_dismissed_at IS 'Last time admin dismissed a recovery-codes banner.';
COMMENT ON COLUMN users.last_recovery_resend_at IS 'Last time recovery codes were generated (24h rate-limit source of truth).';
COMMENT ON COLUMN users.last_emergency_login_at IS 'Last time admin authenticated via emergency recovery code.';
COMMENT ON COLUMN users.last_emergency_login_ip IS 'IP address of the last emergency login.';
COMMENT ON COLUMN users.emergency_login_notified IS 'false = admin has unacknowledged emergency login (banner must show).';

-- ============================================
-- End of Migration 005
-- ============================================
