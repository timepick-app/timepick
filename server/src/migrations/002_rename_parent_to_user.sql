-- ============================================
-- Migration 002: Rename 'parent' role to 'user'
-- ============================================
-- This migration updates the role enum in the users table
-- from 'parent' to 'user' for consistency with terminology
--
-- Created: 2026-02-02
-- Quick Task: 002-rename-parent-to-user
-- ============================================

-- Step 1: Update existing data - change all 'parent' roles to 'user'
-- This is safe to run multiple times (only affects 'parent' values)
UPDATE users SET role = 'user' WHERE role = 'parent';

-- Step 2: Update the table schema to change the default and CHECK constraint
-- First, drop the existing CHECK constraint (may not exist if already run)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- Then, add the new CHECK constraint with 'user' instead of 'parent'
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('user', 'admin'));

-- Step 3: Update the default value for new records
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user';

-- ============================================
-- Verification
-- ============================================
-- Run this query to verify the migration completed successfully:
-- SELECT DISTINCT role FROM users ORDER BY role;
-- Expected output: 'admin' and 'user' (no 'parent')
