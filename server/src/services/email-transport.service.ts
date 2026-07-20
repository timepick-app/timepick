import nodemailer from 'nodemailer';
import { getSmtpSettings } from '../db/settings.db';
import { getEmailProviderConfig, type EmailProvider } from '../db/email-provider.db';
import { createApiTransport } from './email-transport';
import type { Transporter } from 'nodemailer';

/**
 * Append `ctx=admin` to a URL using the URL parser. Idempotent (re-applying
 * yields the same result) — preserves fragments, existing query params, and
 * URL encoding. See tech-spec "emergency-login-contextual-reveal" F2/F3.
 *
 * Resilient: on a parse failure (relative path, malformed URL, exotic scheme)
 * returns the original link unchanged and logs the failure. An email with a
 * missing admin hint is strictly better than a 500 that prevents delivery
 * entirely (post-adversarial F9/F11).
 */
export function withAdminCtx(link: string): string {
  try {
    const u = new URL(link);
    u.searchParams.set('ctx', 'admin');
    return u.toString();
  } catch (err) {
    console.error('[EmailService] withAdminCtx: unable to parse link, using as-is:', err)
    return link
  }
}

// ---------------------------------------------------------------------------
// Transport cache — simple explicit-invalidation model
// ---------------------------------------------------------------------------

let cachedTransporter: Transporter | null = null;
let cachedFromAddress: string | null = null;
let transportHealthy: boolean | null = null;
let encryptionKeyMismatch = false;

/** Étiquette de la source du dernier transport construit par buildTransport(). */
export type EmailTransportSource = 'db' | 'env' | 'fallback';
let transportSource: EmailTransportSource | null = null;

/**
 * True when the last SMTP settings read failed to decrypt the stored password
 * with the current `ENCRYPTION_KEY` (GCM auth failure) — distinct from "no SMTP
 * config at all". Cleared on the next successful `getSmtpSettings()` read.
 */
export function getEncryptionKeyMismatch(): boolean {
  return encryptionKeyMismatch
}

/**
 * Active probe of the current transport. Races verify() against a timeout
 * (default 10s for admin/status callers; the setup wizard passes a shorter one).
 * Updates transportHealthy cache. Returns false if no transport can be built.
 */
export async function checkSmtpConnection(timeoutMs = 10_000): Promise<boolean> {
  const transporter = cachedTransporter ?? await buildTransport()
  if (!transporter) {
    transportHealthy = false
    return false
  }
  const check = transporter.verify().then(() => true).catch(() => false)
  const timeout = new Promise<false>(resolve => setTimeout(() => resolve(false), timeoutMs))
  const result = await Promise.race([check, timeout])
  transportHealthy = result
  return result
}

/**
 * Setup-wizard delivery signal: can the server actually send email right now?
 * Thin wrapper over checkSmtpConnection() with a short probe timeout — the
 * wizard is interactive, so we don't block it on the 10s admin/status deadline.
 * buildTransport() already encodes both regimes: production without DB SMTP →
 * null → false; dev/test → effective transport (DB/env/local interceptor) → real
 * reachability probe. NB: inherits checkSmtpConnection's transportHealthy
 * side-effect, benign at setup time (no admin UI reads it yet).
 */
export async function isEmailDeliverable(): Promise<boolean> {
  return checkSmtpConnection(2_500)
}

/**
 * Source du dernier transport construit — 'db' (app_config), 'env' (SMTP_* du
 * .env, dev/test) ou 'fallback' (127.0.0.1:1025, dev/test). null si aucun
 * transport (prod sans config) ou cache invalidé sans rebuild. Best-effort :
 * rafraîchie à chaque buildTransport(). Consommée par le wizard pour préciser
 * POURQUOI l'étape SMTP est sautable.
 */
export function getEmailTransportSource(): EmailTransportSource | null {
  return transportSource
}

/**
 * Heuristic: does this error look like an AES-GCM decrypt/auth failure (wrong
 * `ENCRYPTION_KEY`) rather than some other SMTP-settings read failure? Matches
 * Node's `crypto` error messages for a bad auth tag / corrupt ciphertext.
 */
function looksLikeDecryptFailure(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /unable to authenticate|bad decrypt|Unsupported state|wrong final block length/i.test(message)
}

/**
 * Build a fresh nodemailer transport using cascade resolution:
 * 1. DB (app_config) → highest priority
 * 2. .env (SMTP_*) → fallback
 * 3. Env-aware fallback: null in production, local SMTP interceptor (127.0.0.1:1025) in dev/test
 *
 * Chantier C — dispatch provider (E3, insertion AVANT le try SMTP historique
 * ci-dessous) : `email_provider !== 'smtp'` avec une clé API stockée →
 * court-circuite la cascade et construit le transport HTTP (Resend/Brevo).
 * Sans clé → log + cascade SMTP inchangée. `providerKeyMismatch` bloque le
 * reset de `encryptionKeyMismatch` par le try SMTP qui suit quand LA CLÉ
 * PROVIDER (pas le mot de passe SMTP) est indéchiffrable — seul delta
 * autorisé dans le chemin SMTP existant (cf. contrat §5).
 */
async function buildTransport(): Promise<Transporter | null> {
  let providerKeyMismatch = false
  try {
    const { provider, apiKey }: { provider: EmailProvider; apiKey: string } = await getEmailProviderConfig()
    if (provider !== 'smtp') {
      if (apiKey) {
        encryptionKeyMismatch = false
        transportSource = 'db'
        return nodemailer.createTransport(createApiTransport(provider, apiKey))
      }
      console.error(`[EmailService] email_provider=${provider} sans clé API — cascade SMTP utilisée`)
    }
  } catch (error) {
    if (looksLikeDecryptFailure(error)) {
      providerKeyMismatch = true
      encryptionKeyMismatch = true
      console.error('[EmailService] ENCRYPTION_KEY mismatch — la clé API stockée est indéchiffrable avec la clé courante. Restaurez la clé de chiffrement sauvegardée ou ressaisissez la clé API dans Réglages → Email (runbook B).')
    } else {
      console.error('[EmailService] Failed to read email provider config:', error)
    }
  }

  try {
    const dbSettings = await getSmtpSettings();
    if (!providerKeyMismatch) encryptionKeyMismatch = false;

    if (dbSettings.smtpHost) {
      transportSource = 'db';
      return nodemailer.createTransport({
        host: dbSettings.smtpHost,
        port: parseInt(dbSettings.smtpPort, 10) || 587,
        secure: dbSettings.smtpSecure,
        pool: true,
        socketTimeout: 300_000,
        ...(dbSettings.smtpUser ? { auth: { user: dbSettings.smtpUser, pass: dbSettings.smtpPassword } } : {}),
      });
    }
  } catch (error) {
    if (looksLikeDecryptFailure(error)) {
      encryptionKeyMismatch = true;
      console.error(
        '[EmailService] ENCRYPTION_KEY mismatch — the stored SMTP password cannot be decrypted with the current key. ' +
          'Restore your backed-up encryption key (env var or server/data/encryption.key) or re-enter the SMTP password in Settings → Email.',
      );
    } else {
      console.error('[EmailService] Failed to read SMTP settings:', error);
    }
  }

  // Production : la DB est la source unique. Pas de fallback env/legacy.
  if (process.env.NODE_ENV === 'production') {
    console.error('[EmailService] No SMTP config found in production. Emails will not be sent.')
    transportSource = null
    return null
  }

  // Dev/test uniquement : fallback env (SMTP_*) puis intercepteur SMTP local (127.0.0.1:1025).
  if (process.env.SMTP_HOST) {
    transportSource = 'env';
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      pool: true,
      socketTimeout: 300_000,
      ...(process.env.SMTP_USER ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || '' } } : {}),
    });
  }

  // Dev/test: fallback to a local SMTP interceptor (e.g. Mailpit) on 127.0.0.1:1025
  transportSource = 'fallback';
  return nodemailer.createTransport({
    host: '127.0.0.1',
    port: 1025,
    secure: false,
    ignoreTLS: true,
  });
}

/**
 * Backward-compat wrapper used by existing tests. Throws when no transport
 * is available, preserving the pre-refactor contract.
 */
export async function createSmtpTransport(): Promise<Transporter> {
  const t = await buildTransport()
  if (!t) throw new Error('[EmailService] No SMTP transport available')
  return t
}

/**
 * Gets the cached transporter, verifying on first use.
 * Returns null when verification fails (callers must handle no-transport case).
 */
export async function getTransporter(): Promise<Transporter | null> {
  if (cachedTransporter && transportHealthy === true) return cachedTransporter
  if (cachedTransporter && transportHealthy === null) {
    try {
      await cachedTransporter.verify()
      transportHealthy = true
      return cachedTransporter
    } catch {
      transportHealthy = false
      try { cachedTransporter.close() } catch { /* ignore */ }
      cachedTransporter = null
    }
  }

  // transportHealthy === false with a stale cached transporter → rebuild
  if (cachedTransporter) {
    try { cachedTransporter.close() } catch { /* ignore */ }
    cachedTransporter = null
  }

  const t = await buildTransport()
  if (!t) { transportHealthy = false; return null }

  try {
    await t.verify()
    transportHealthy = true
    cachedTransporter = t
    return cachedTransporter
  } catch {
    transportHealthy = false
    try { t.close() } catch { /* ignore */ }
    return null
  }
}

/**
 * Invalidate the transport cache. Called by settings controller
 * after admin saves new SMTP settings or clears config.
 */
export function invalidateTransportCache(): void {
  if (cachedTransporter) {
    try { cachedTransporter.close() } catch { /* ignore close errors */ }
  }
  cachedTransporter = null;
  cachedFromAddress = null;
  transportHealthy = null;
  transportSource = null;
}

/**
 * Returns the cached transport health status without triggering a probe.
 * null = never verified, true = verified ok, false = verification failed.
 */
export function getTransportStatus(): { healthy: boolean | null } {
  return { healthy: transportHealthy }
}

export interface SmtpTestParams {
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUser?: string
  smtpPassword?: string
  smtpFromName?: string
  smtpFromEmail?: string
}

/** Teste une connexion SMTP avec des paramètres ad-hoc et envoie à `recipient`
 *  le corps (html + text) fourni par l'orchestrateur. Ne lève jamais :
 *  retourne { success, message }. */
export async function sendSmtpTest(
  params: SmtpTestParams,
  recipient: string,
  body: { html: string; text: string },
): Promise<{ success: boolean; message: string }> {
  const transport = nodemailer.createTransport({
    host: params.smtpHost,
    port: params.smtpPort,
    secure: params.smtpSecure,
    auth: params.smtpUser ? { user: params.smtpUser, pass: params.smtpPassword || '' } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
  })
  try {
    await transport.verify()
    await transport.sendMail({
      from: `"${params.smtpFromName || 'TimePick'}" <${params.smtpFromEmail || recipient}>`,
      to: recipient,
      subject: 'Test SMTP - TimePick',
      html: body.html,
      text: body.text,
    })
    return { success: true, message: 'Connexion réussie' }
  } catch (err) {
    return { success: false, message: `Erreur: ${err instanceof Error ? err.message : 'Erreur inconnue'}` }
  } finally {
    transport.close()
  }
}

export interface ProviderTestParams {
  provider: 'resend'
  apiKey: string
  fromName?: string
  fromEmail?: string
}

/** Teste un provider API email (Resend) ad-hoc et envoie à `recipient` le
 *  corps (html + text) fourni par l'orchestrateur. Miroir de sendSmtpTest
 *  pour le transport HTTP : verify() (GET /domains authentifié) PUIS un
 *  vrai envoi. Ne lève jamais : retourne { success, message }. */
export async function sendProviderTest(
  params: ProviderTestParams,
  recipient: string,
  body: { html: string; text: string },
): Promise<{ success: boolean; message: string }> {
  let transport: Transporter | undefined
  try {
    transport = nodemailer.createTransport(createApiTransport(params.provider, params.apiKey))
    await transport.verify()
    await transport.sendMail({
      from: `"${params.fromName || 'TimePick'}" <${params.fromEmail || recipient}>`,
      to: recipient,
      subject: `Test ${params.provider === 'resend' ? 'Resend' : params.provider} - TimePick`,
      html: body.html,
      text: body.text,
    })
    return { success: true, message: 'Connexion réussie' }
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Erreur inconnue' }
  } finally {
    transport?.close()
  }
}

/**
 * Attempts to send via the given transporter. On connection errors (ECONNECTION,
 * ECONNRESET), invalidates the cache and retries once with a fresh transport.
 * Returns true on success, false on final failure.
 */
type MailOptions = Parameters<Transporter['sendMail']>[0]

export async function sendMailWithFallback(transporter: Transporter, options: MailOptions): Promise<boolean> {
  try {
    await transporter.sendMail(options)
    return true
  } catch (error: unknown) {
    const e = error as { code?: string }
    if (e.code === 'ECONNECTION' || e.code === 'ECONNRESET') {
      invalidateTransportCache()
      const fresh = await getTransporter()
      if (!fresh) return false
      try {
        await fresh.sendMail(options)
        return true
      } catch (retryErr) {
        console.error('[EmailService] sendMail retry failed:', { to: options.to, error: retryErr })
        return false
      }
    }
    console.error('[EmailService] sendMail error:', { to: options.to, error })
    return false
  }
}

// ---------------------------------------------------------------------------
// Configurable sender address
// ---------------------------------------------------------------------------

/**
 * Resolves the "from" address for emails:
 * 1. DB settings (smtp_from_name + smtp_from_email)
 * 2. .env (SMTP_FROM_NAME + SMTP_FROM_EMAIL or EMAIL_FROM)
 * 3. Default: '"TimePick" <noreply@example.com>'
 */
export async function getFromAddress(): Promise<string> {
  if (cachedFromAddress !== null) return cachedFromAddress;

  try {
    const settings = await getSmtpSettings();
    if (settings.smtpFromEmail) {
      const name = (settings.smtpFromName || 'TimePick').replace(/"/g, '\\"');
      cachedFromAddress = `"${name}" <${settings.smtpFromEmail}>`;
      return cachedFromAddress;
    }
  } catch { /* fall through */ }

  // Production : retourner le défaut sans exposer les vars d'env.
  if (process.env.NODE_ENV === 'production') {
    cachedFromAddress = '"TimePick" <noreply@example.com>';
    return cachedFromAddress;
  }

  if (process.env.SMTP_FROM_EMAIL) {
    const name = (process.env.SMTP_FROM_NAME || 'TimePick').replace(/"/g, '\\"');
    cachedFromAddress = `"${name}" <${process.env.SMTP_FROM_EMAIL}>`;
    return cachedFromAddress;
  }
  if (process.env.EMAIL_FROM) {
    cachedFromAddress = process.env.EMAIL_FROM;
    return cachedFromAddress;
  }

  cachedFromAddress = '"TimePick" <noreply@example.com>';
  return cachedFromAddress;
}
