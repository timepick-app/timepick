/**
 * Email brand factory defaults — the runtime source of truth consumed by the
 * `Réinitialiser le branding` admin action (`resetEmailBrandToFactory()`).
 *
 * Values mirror the seed in `server/src/migrations/006_email_refactoring.sql:127-129`.
 *
 * Any change here MUST be paired with a follow-up migration that re-seeds
 * existing installs; the migration 006 seed uses `ON CONFLICT (id) DO NOTHING`
 * so updated installs do NOT pick up new defaults automatically.
 *
 * The admin `Réinitialiser le branding` UI is the runtime recovery path —
 * `resetEmailBrandToFactory()` reads from this module, not from the SQL seed.
 */

import type { EmailBrandSettings } from '../db/email-brand-settings.db'

export type EmailBrandFactoryDefaults = Omit<EmailBrandSettings, 'updatedAt'>

export const EMAIL_BRAND_FACTORY_DEFAULTS = {
  logoUrl: null,
  primaryColor: '#18181b',
  buttonTextColor: '#ffffff',
  fontFamily: 'Inter, Arial, sans-serif',
  buttonBorderRadius: 4,
} as const satisfies EmailBrandFactoryDefaults
