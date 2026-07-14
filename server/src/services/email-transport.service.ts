import nodemailer from 'nodemailer';
import { getSmtpSettings } from '../db/settings.db';
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

/**
 * Active probe of the current transport. Races verify() against a 10s timeout.
 * Updates transportHealthy cache. Returns false if no transport can be built.
 */
export async function checkSmtpConnection(): Promise<boolean> {
  const transporter = cachedTransporter ?? await buildTransport()
  if (!transporter) {
    transportHealthy = false
    return false
  }
  const check = transporter.verify().then(() => true).catch(() => false)
  const timeout = new Promise<false>(resolve => setTimeout(() => resolve(false), 10_000))
  const result = await Promise.race([check, timeout])
  transportHealthy = result
  return result
}

/**
 * Build a fresh nodemailer transport using cascade resolution:
 * 1. DB (app_config) → highest priority
 * 2. .env (SMTP_*) → fallback
 * 3. Legacy .env (EMAIL_HOST) → backward compat
 * 4. Env-aware fallback: null in production, MailHog in dev/test
 */
async function buildTransport(): Promise<Transporter | null> {
  try {
    const dbSettings = await getSmtpSettings();

    if (dbSettings.smtpHost) {
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
    console.error('[EmailService] Failed to read SMTP settings:', error);
  }

  // Production : la DB est la source unique. Pas de fallback env/legacy.
  if (process.env.NODE_ENV === 'production') {
    console.error('[EmailService] No SMTP config found in production. Emails will not be sent.')
    return null
  }

  // Dev/test uniquement : fallback env puis legacy puis MailHog.
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      pool: true,
      socketTimeout: 300_000,
      ...(process.env.SMTP_USER ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || '' } } : {}),
    });
  }

  if (process.env.EMAIL_HOST) {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT || '1025', 10),
      secure: false,
      pool: true,
      socketTimeout: 300_000,
      ignoreTLS: true,
    });
  }

  // Dev/test: MailHog fallback
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
