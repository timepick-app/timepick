import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  renderEmail,
  TemplateNotFoundError,
  renderSmtpTestEmail,
  type TemplateKey,
} from './render-email.service';
import { type SlotDiff } from '../utils/slot-diff'
import { formatSlotEmailDate, formatSlotEmailTime } from '../utils/slotEmailFormat'
import { emailNameVariables } from '../utils/nameUtils'
import { frontendBaseUrl, memberEventUrl } from '../utils/frontendUrl'
import type { VariablesPayload } from './mjml-compile.service'
import {
  getTransporter,
  getFromAddress,
  withAdminCtx,
  sendMailWithFallback,
  sendSmtpTest,
  sendProviderTest,
  type SmtpTestParams,
  type ProviderTestParams,
} from './email-transport.service'

// ---------------------------------------------------------------------------
// Structured logging helper (AC5)
// ---------------------------------------------------------------------------

interface LogRenderEmailFailureParams {
  templateKey: TemplateKey
  eventId?: string
  slotId?: string
  error: unknown
  recipient?: string
}

function redactEmail(email: string): string {
  const atIdx = email.indexOf('@')
  if (atIdx === -1) return '***'
  const domain = email.slice(atIdx)
  const local = email.slice(0, atIdx)
  if (local.length <= 2) return `***${domain}`
  return `${local.slice(0, 2)}***${domain}`
}

function logRenderEmailFailure({ templateKey, eventId, slotId, error, recipient }: LogRenderEmailFailureParams): void {
  const errorName = error instanceof Error ? error.constructor.name : 'Unknown'
  const errorMessage = error instanceof Error ? error.message : String(error)
  console.error('[EmailService] renderEmail failed:', {
    templateKey,
    ...(eventId && { eventId }),
    ...(slotId && { slotId }),
    errorName,
    errorMessage,
    ...(recipient && { recipient: redactEmail(recipient) }),
  })
}

/**
 * Source UNIQUE des sujets d'email (prod ET test-send). Dérive le vrai sujet
 * depuis le templateKey + les variables déjà passées à renderEmail. Le test-send
 * (sendTemplateTestEmail) préfixe « [Test TimePick] » sur la sortie. Switch
 * exhaustif sans `default` : ajouter une clé sans son sujet = erreur TS.
 */
function buildSubject(templateKey: TemplateKey, vars: VariablesPayload): string {
  const eventName = vars.event_name ?? ''
  switch (templateKey) {
    case 'invitation':
      return `Inscription participation - ${eventName}`
    case 'reservation_confirmation':
      return `Confirmation de réservation - ${eventName}`
    case 'cancellation_confirmation':
      return `Créneau annulé - ${eventName}`
    case 'unregistration_confirmation':
      return `Désinscription confirmée - ${eventName}`
    case 'slot_modification':
      return `Créneau modifié - ${eventName}`
    case 'magic_link_login':
      return vars.is_admin === 'true'
        ? "Connexion à l'administration TimePick"
        : 'Connexion à TimePick'
    case 'account_created':
      return 'Bienvenue — votre compte a été créé'
    case 'role_promoted':
      return "TimePick — Vous avez maintenant accès à l'administration"
    case 'role_demoted':
      return 'TimePick — Mise à jour de votre accès'
  }
}

/**
 * Envoie un email de magic link aux administrateurs
 * @param email - Email de l'admin
 * @param link - Lien de connexion magique
 * @param ttlMinutes - Durée de validité en minutes (obsolète, conservé pour compatibilité)
 * @param expirationDate - Date d'expiration absolue (optionnel, calculé depuis ttlMinutes si non fourni)
 * @returns true si envoyé, false sinon
 */
export const sendAdminMagicLinkEmail = async (
  email: string,
  link: string,
  ttlMinutes: number = 1440,
  expirationDate: Date | undefined,
  isAdmin: true,
  firstName?: string | null,
  lastName?: string | null,
): Promise<boolean> => {
  const exp = expirationDate || new Date(Date.now() + ttlMinutes * 60 * 1000)
  const formattedExpiration = format(exp, "d MMMM yyyy 'a' HH'h'mm", { locale: fr })
  const linkWithCtx = isAdmin ? withAdminCtx(link) : link

  let html: string
  let text: string
  try {
    const rendered = await renderEmail({
      templateKey: 'magic_link_login',
      variables: { ...emailNameVariables(firstName, lastName), magic_link: linkWithCtx, expiration_date: formattedExpiration, is_admin: 'true' },
    })
    html = rendered.html
    text = rendered.text
  } catch (err) {
    logRenderEmailFailure({ templateKey: 'magic_link_login', error: err, recipient: email })
    return false
  }

  const transporter = await getTransporter()
  if (!transporter) {
    console.error('[EmailService] No SMTP transport — admin magic link not sent to', email)
    return false
  }

  const from = await getFromAddress()
  const sent = await sendMailWithFallback(transporter, {
    from,
    to: email,
    subject: buildSubject('magic_link_login', { is_admin: 'true' }),
    text,
    html,
  })
  if (sent && process.env.NODE_ENV !== 'production') console.log('[EmailService] Admin magic link sent to %s', email)
  return sent
}

/**
 * Envoie un email de magic link aux utilisateurs
 * @param email - Email de l'utilisateur
 * @param link - Lien de connexion magique
 * @param ttlMinutes - Durée de validité en minutes (obsolète, conservé pour compatibilité)
 * @param expirationDate - Date d'expiration absolue (optionnel, calculé depuis ttlMinutes si non fourni)
 * @returns true si envoyé, false sinon
 */
export const sendUserMagicLinkEmail = async (
  email: string,
  link: string,
  ttlMinutes: number = 30,
  expirationDate?: Date,
  firstName?: string | null,
  lastName?: string | null,
): Promise<boolean> => {
  const exp = expirationDate || new Date(Date.now() + ttlMinutes * 60 * 1000)
  const formattedExpiration = format(exp, "d MMMM yyyy 'a' HH'h'mm", { locale: fr })

  let html: string
  let text: string
  try {
    const rendered = await renderEmail({
      templateKey: 'magic_link_login',
      variables: { ...emailNameVariables(firstName, lastName), magic_link: link, expiration_date: formattedExpiration, is_admin: 'false' },
    })
    html = rendered.html
    text = rendered.text
  } catch (err) {
    logRenderEmailFailure({ templateKey: 'magic_link_login', error: err, recipient: email })
    return false
  }

  const transporter = await getTransporter()
  if (!transporter) {
    console.error('[EmailService] No SMTP transport — user magic link not sent to', email)
    return false
  }

  const from = await getFromAddress()
  const sent = await sendMailWithFallback(transporter, {
    from,
    to: email,
    subject: buildSubject('magic_link_login', { is_admin: 'false' }),
    text,
    html,
  })
  if (sent && process.env.NODE_ENV !== 'production') console.log('[EmailService] User magic link sent to %s', email)
  return sent
}

/**
 * Envoie un email de bienvenue lors de la création d'un profil membre.
 * Utilise le modèle système 'account_created' (brandé, éditable).
 */
export const sendWelcomeInvitation = async (
  email: string,
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  isAdmin: boolean
): Promise<boolean> => {
  const appUrl = frontendBaseUrl()
  const loginUrl = isAdmin ? withAdminCtx(`${appUrl}/login`) : `${appUrl}/login`

  let html: string
  let text: string
  try {
    const rendered = await renderEmail({
      templateKey: 'account_created',
      variables: {
        ...emailNameVariables(firstName, lastName),
        login_url: loginUrl,
      },
    })
    html = rendered.html
    text = rendered.text
  } catch (err) {
    logRenderEmailFailure({ templateKey: 'account_created', error: err, recipient: email })
    return false
  }

  const transporter = await getTransporter()
  if (!transporter) {
    console.error('[EmailService] No SMTP transport — welcome invitation not sent to', email)
    return false
  }

  const from = await getFromAddress()
  const sent = await sendMailWithFallback(transporter, {
    from,
    to: email,
    subject: buildSubject('account_created', {}),
    text,
    html,
  })
  if (sent && process.env.NODE_ENV !== 'production') console.log('[EmailService] Welcome invitation sent to %s', email)
  return sent
}

/**
 * Notifie un membre d'un changement de rôle (promotion Membre → Administrateur
 * ou rétrogradation Administrateur → Membre) émis depuis la modale admin.
 * Utilise les modèles système 'role_promoted' / 'role_demoted' (brandés,
 * éditables). Calqué sur sendWelcomeInvitation. Rédactionnel distinct de
 * l'email de bienvenue ; aucun lien/token d'activation (passwordless).
 */
export const sendRoleChangedEmail = async (
  email: string,
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  direction: 'promoted' | 'demoted',
  magicLink?: string
): Promise<boolean> => {
  const appUrl = frontendBaseUrl()
  const templateKey = direction === 'promoted' ? 'role_promoted' : 'role_demoted'
  // Promotion : lien auto-login (magic-link admin, TTL existant) si fourni, sinon
  // repli sur /login — avec ctx=admin dans les deux cas (cf. withAdminCtx).
  // Rétrogradation : /login nu (l'ex-admin redevient membre, pas de token).
  const loginUrl = direction === 'promoted'
    ? withAdminCtx(magicLink ?? `${appUrl}/login`)
    : `${appUrl}/login`

  let html: string
  let text: string
  try {
    const rendered = await renderEmail({
      templateKey,
      variables: {
        ...emailNameVariables(firstName, lastName),
        login_url: loginUrl,
      },
    })
    html = rendered.html
    text = rendered.text
  } catch (err) {
    logRenderEmailFailure({ templateKey, error: err, recipient: email })
    return false
  }

  const transporter = await getTransporter()
  if (!transporter) {
    console.error('[EmailService] No SMTP transport — role change notification not sent to', email)
    return false
  }

  const from = await getFromAddress()
  const sent = await sendMailWithFallback(transporter, {
    from,
    to: email,
    subject: buildSubject(templateKey, {}),
    text,
    html,
  })
  if (sent && process.env.NODE_ENV !== 'production') console.log('[EmailService] Role change notification (%s) sent to %s', direction, email)
  return sent
}

/**
 * Envoi une invitation à un événement de participation
 * @param email - Email du destinataire
 * @param eventData - Données de l'événement (id requis pour résolution du template via renderEmail)
 * @param magicLink - Lien magic link de connexion
 * @param expirationDate - Date d'expiration du lien (optionnel)
 * @returns true si envoyé, false sinon
 */
export const sendEventInvitation = async (
  email: string,
  eventData: {
    id: string
    name: string
    description?: string | null
  },
  magicLink: string,
  expirationDate?: Date,
  firstName?: string | null,
  lastName?: string | null,
): Promise<boolean> => {
  const formattedExpiration = expirationDate
    ? format(expirationDate, "d MMMM yyyy 'a' HH'h'mm", { locale: fr })
    : ''

  let html: string
  let text: string
  try {
    const rendered = await renderEmail({
      templateKey: 'invitation',
      eventId: eventData.id,
      variables: {
        ...emailNameVariables(firstName, lastName),
        event_name: eventData.name,
        event_description: eventData.description ?? '',
        magic_link: magicLink,
        expiration_date: formattedExpiration,
      },
    })
    html = rendered.html
    text = rendered.text
  } catch (err) {
    logRenderEmailFailure({ templateKey: 'invitation', eventId: eventData.id, error: err, recipient: email })
    return false
  }

  const transporter = await getTransporter()
  if (!transporter) {
    console.error('[EmailService] No SMTP transport — event invitation not sent to', email)
    return false
  }

  const from = await getFromAddress()
  const sent = await sendMailWithFallback(transporter, {
    from,
    to: email,
    subject: buildSubject('invitation', { event_name: eventData.name }),
    text,
    html,
  })
  if (sent && process.env.NODE_ENV !== 'production') console.log('[EmailService] Event invitation sent to %s', email)
  return sent
}

/**
 * Données pour l'email d'annulation de créneau
 */
export interface SlotCancellationEmailData {
  userEmail: string
  userFirstName: string | null | undefined
  userLastName?: string | null
  eventName: string
  slotDate: string
  slotTime: string
  /**
   * UUID de l'événement auquel appartient le créneau annulé.
   * Sert à construire `calendar_url` (route `/me/events/:uuid`) afin que le
   * destinataire puisse re-réserver directement depuis l'email.
   */
  eventId: string
  /**
   * Motif d'annulation optionnel saisi par l'admin via la modale de
   * suppression de créneau. Affiché entre les horaires et la ligne d'invitation
   * à reconsulter le calendrier. Absent (undefined / chaîne vide) côté
   * annulation par l'utilisateur lui-même (reservation.service.cancelBooking).
   */
  cancellationReason?: string
}

// Échappement HTML defense-in-depth avant insertion dans la variable
// `cancellation_reason` qui contient du markup (`<strong>Motif :</strong>`).
// DOMPurify sanitize l'output final, mais l'échappement explicite isole le
// texte utilisateur du wrapper HTML que le service injecte autour.
// Les retours à la ligne saisis par l'admin via le `<Textarea>` multiligne
// sont convertis en `<br>` pour préserver la mise en forme côté destinataire
// (sinon les `\n` bruts dans HTML deviennent des espaces — patch step-04).
function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\r?\n/g, '<br>')
}

export const sendSlotCancellationEmail = async (
  data: SlotCancellationEmailData
): Promise<boolean> => {
  const { userEmail, userFirstName, userLastName, eventName, slotDate, slotTime, eventId, cancellationReason } = data

  // Pré-format HTML : si motif fourni, on injecte `<strong>Motif :</strong>
  // {texte échappé}`. Sinon chaîne vide → le `<mj-text>` placeholder dans le
  // template factory rend un `<td>` vide (perte de 8px de padding vertical,
  // visuellement acceptable). Le moteur d'interpolation `substituteVariables`
  // ne supporte pas les blocs conditionnels — d'où ce pré-format côté caller.
  const cancellationReasonHtml = cancellationReason && cancellationReason.trim().length > 0
    ? `<strong>Motif :</strong> ${escapeHtmlText(cancellationReason.trim())}`
    : ''

  let html: string
  let text: string
  try {
    const rendered = await renderEmail({
      templateKey: 'cancellation_confirmation',
      variables: {
        ...emailNameVariables(userFirstName, userLastName),
        event_name: eventName,
        slot_date: slotDate,
        slot_time: slotTime,
        cancellation_reason: cancellationReasonHtml,
        calendar_url: memberEventUrl(eventId),
      },
    })
    html = rendered.html
    text = rendered.text
  } catch (err) {
    logRenderEmailFailure({ templateKey: 'cancellation_confirmation', error: err, recipient: userEmail })
    return false
  }

  const transporter = await getTransporter()
  if (!transporter) {
    console.error('[EmailService] No SMTP transport — slot cancellation not sent to', userEmail)
    return false
  }

  const from = await getFromAddress()
  const sent = await sendMailWithFallback(transporter, {
    from,
    to: userEmail,
    subject: buildSubject('cancellation_confirmation', { event_name: eventName }),
    text,
    html,
  })
  if (sent && process.env.NODE_ENV !== 'production') console.log('[EmailService] Slot cancellation email sent to %s', userEmail)
  return sent
}

/**
 * Données pour l'email de confirmation de réservation
 */
export interface ReservationEmailData {
  userEmail: string
  userFirstName: string | null | undefined
  userLastName?: string | null
  eventId: string
  eventName: string
  slotDate: string
  slotTime: string
}

/**
 * Envoie un email de confirmation de réservation à un utilisateur
 * @param data - Données de la réservation (email utilisateur, nom, événement, date, horaire)
 * @returns true si envoyé, false sinon
 */
export const sendReservationEmail = async (
  data: ReservationEmailData
): Promise<boolean> => {
  const { userEmail, userFirstName, userLastName, eventId, eventName, slotDate, slotTime } = data

  let html: string
  let text: string
  try {
    const rendered = await renderEmail({
      templateKey: 'reservation_confirmation',
      variables: {
        ...emailNameVariables(userFirstName, userLastName),
        event_name: eventName,
        slot_date: slotDate,
        slot_time: slotTime,
        calendar_url: memberEventUrl(eventId),
      },
    })
    html = rendered.html
    text = rendered.text
  } catch (err) {
    logRenderEmailFailure({ templateKey: 'reservation_confirmation', error: err, recipient: userEmail })
    return false
  }

  const transporter = await getTransporter()
  if (!transporter) {
    console.error('[EmailService] No SMTP transport — reservation email not sent to', userEmail)
    return false
  }

  const from = await getFromAddress()
  const sent = await sendMailWithFallback(transporter, {
    from,
    to: userEmail,
    subject: buildSubject('reservation_confirmation', { event_name: eventName }),
    text,
    html,
  })
  if (sent && process.env.NODE_ENV !== 'production') console.log('[EmailService] Reservation confirmation email sent to %s', userEmail)
  return sent
}

// ---------------------------------------------------------------------------
// sendUnregistrationEmail — confirmation de désinscription volontaire membre
// ---------------------------------------------------------------------------

export interface UnregistrationEmailData {
  userEmail: string
  userFirstName: string | null | undefined
  userLastName?: string | null
  eventName: string
  /** UUID de l'événement — route /me/events/:uuid (utilisé pour le CTA calendrier). */
  eventId: string
  slotDate: string
  slotTime: string
}

/**
 * Envoie un email de confirmation de désinscription au membre
 * @param data - Données de la désinscription (email utilisateur, nom, événement, date, horaire)
 * @returns true si envoyé, false sinon
 */
export const sendUnregistrationEmail = async (
  data: UnregistrationEmailData
): Promise<boolean> => {
  const { userEmail, userFirstName, userLastName, eventName, eventId, slotDate, slotTime } = data

  let html: string
  let text: string
  try {
    const rendered = await renderEmail({
      templateKey: 'unregistration_confirmation',
      variables: {
        ...emailNameVariables(userFirstName, userLastName),
        event_name: eventName,
        slot_date: slotDate,
        slot_time: slotTime,
        calendar_url: memberEventUrl(eventId),
      },
    })
    html = rendered.html
    text = rendered.text
  } catch (err) {
    logRenderEmailFailure({ templateKey: 'unregistration_confirmation', error: err, recipient: userEmail })
    return false
  }

  const transporter = await getTransporter()
  if (!transporter) {
    console.error('[EmailService] No SMTP transport — unregistration email not sent to', userEmail)
    return false
  }

  const from = await getFromAddress()
  const sent = await sendMailWithFallback(transporter, {
    from,
    to: userEmail,
    subject: buildSubject('unregistration_confirmation', { event_name: eventName }),
    text,
    html,
  })
  if (sent && process.env.NODE_ENV !== 'production') console.log('[EmailService] Unregistration confirmation email sent to %s', userEmail)
  return sent
}

// ---------------------------------------------------------------------------
// buildPreviewVariables + sendTemplateTestEmail (admin preview / test-send)
// — variables réalistes, jamais les stubs healthcheck.
// ---------------------------------------------------------------------------

/**
 * Variables de DÉMONSTRATION pour l'aperçu admin et l'email de test. Valeurs
 * réalistes (jamais le stub `HEALTHCHECK_STUB_VARIABLES`, réservé au
 * healthcheck de boot). Quand un événement est fourni, son nom/description
 * RÉELS sont superposés ; le reste (lien magique, dates, destinataire) reste
 * démo car intrinsèquement par-destinataire/token. Pure : aucun accès DB — les
 * contrôleurs résolvent l'événement et passent name/description.
 */
export function buildPreviewVariables(overrides?: {
  eventName?: string
  eventDescription?: string
  isAdmin?: boolean
}): VariablesPayload {
  const demoDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const base = frontendBaseUrl()
  return {
    ...emailNameVariables('Camille', 'Martin'),
    event_name: overrides?.eventName ?? 'Réunion de présentation',
    event_description:
      overrides?.eventDescription ??
      "Présentation du projet et échanges autour d'un café.",
    is_admin: overrides?.isAdmin ? 'true' : 'false',
    magic_link: overrides?.isAdmin ? withAdminCtx(`${base}/login`) : `${base}/login`,
    login_url: overrides?.isAdmin ? withAdminCtx(`${base}/login`) : `${base}/login`,
    calendar_url: `${base}/me`,
    expiration_date: format(demoDate, "d MMMM yyyy 'à' HH'h'mm", { locale: fr }),
    slot_date: format(demoDate, 'EEEE d MMMM yyyy', { locale: fr }),
    slot_time: '14h00',
    cancellation_reason: 'Indisponibilité de dernière minute',
    // changes_blocks volontairement omis : seul slot_modification l'utilise, et
    // ce template est inatteignable via aperçu/test-send (rejeté en validation).
  }
}

export type TestSendResult =
  | { ok: true }
  | { ok: false; reason: 'no_transport' | 'send_failed' | 'template_not_found' }

/**
 * Rend le template demandé avec les variables de démonstration et l'envoie à
 * `to` via le transport configuré. Ne lève jamais pour les modes d'échec
 * attendus : retourne un résultat discriminé que le contrôleur mappe en HTTP.
 */
export const sendTemplateTestEmail = async (params: {
  templateKey: TemplateKey
  eventId?: string
  to: string
  eventName?: string
  eventDescription?: string
  isAdmin?: boolean
}): Promise<TestSendResult> => {
  const vars = buildPreviewVariables({
    eventName: params.eventName,
    eventDescription: params.eventDescription,
    isAdmin: params.isAdmin,
  })
  let rendered: { html: string; text: string }
  try {
    rendered = await renderEmail({
      templateKey: params.templateKey,
      eventId: params.eventId,
      variables: vars,
    })
  } catch (error) {
    if (error instanceof TemplateNotFoundError) {
      return { ok: false, reason: 'template_not_found' }
    }
    throw error
  }

  const transporter = await getTransporter()
  if (!transporter) {
    return { ok: false, reason: 'no_transport' }
  }

  const from = await getFromAddress()
  const sent = await sendMailWithFallback(transporter, {
    from,
    to: params.to,
    subject: `[Test TimePick] ${buildSubject(params.templateKey, vars)}`,
    text: rendered.text,
    html: rendered.html,
  })
  return sent ? { ok: true } : { ok: false, reason: 'send_failed' }
}

// ---------------------------------------------------------------------------
// Notification de modification de créneau
// ---------------------------------------------------------------------------

/**
 * Envoie un email de modification de créneau à tous les inscrits.
 * Construit les blocs de changements une seule fois ; rendu per-recipient
 * (user_first_name varie) via Promise.allSettled.
 */
export async function sendSlotModificationEmail(
  recipients: Array<{ email: string; firstName: string; lastName?: string | null }>,
  slot: { id: string; eventName: string; eventId: string },
  diff: SlotDiff,
): Promise<{ notified: number; failed: number }> {
  // 1. Assembler changes_blocks une seule fois (indépendant du destinataire)
  const blocks: string[] = []

  if (diff.fields.includes('start_time') || diff.fields.includes('end_time')) {
    const oldDate = formatSlotEmailDate(diff.before.start_time, diff.before.end_time)
    const oldTime = formatSlotEmailTime(diff.before.start_time, diff.before.end_time)
    const newDate = formatSlotEmailDate(diff.after.start_time, diff.after.end_time)
    const newTime = formatSlotEmailTime(diff.after.start_time, diff.after.end_time)
    blocks.push(
      `<p style="margin:0 0 8px 0;font-weight:bold;">Nouvel horaire</p>` +
      `<p style="margin:0 0 4px 0;color:#666666;">Avant : ${oldDate} · ${oldTime}</p>` +
      `<p style="margin:0 0 16px 0;">Après : ${newDate} · ${newTime}</p>`,
    )
  }

  if (diff.fields.includes('description')) {
    blocks.push(
      `<p style="margin:0 0 8px 0;font-weight:bold;">Nouvelle description</p>` +
      `<p style="margin:0 0 16px 0;">${escapeHtmlText(diff.after.description ?? '')}</p>`,
    )
  }

  const changesBlocks = blocks.join('')

  // 2. URL absolue du calendrier de l'événement (route /me/events/:uuid)
  const calendarUrl = memberEventUrl(slot.eventId)

  // 3. Transport unique — court-circuit si indisponible
  const transporter = await getTransporter()
  if (!transporter) {
    console.error('[EmailService] No SMTP transport — slot modification not sent', { slotId: slot.id, recipients: recipients.length })
    return { notified: 0, failed: recipients.length }
  }
  const from = await getFromAddress()

  // 4. Rendu + envoi parallèle ; rendu par destinataire car user_first_name varie
  const results = await Promise.allSettled(
    recipients.map(async (r) => {
      let rendered: { html: string; text: string }
      try {
        rendered = await renderEmail({
          templateKey: 'slot_modification',
          variables: {
            ...emailNameVariables(r.firstName, r.lastName),
            event_name: slot.eventName,
            changes_blocks: changesBlocks,
            calendar_url: calendarUrl,
          },
        })
      } catch (error) {
        logRenderEmailFailure({ templateKey: 'slot_modification', slotId: slot.id, error, recipient: r.email })
        return false
      }
      return sendMailWithFallback(transporter, {
        from,
        to: r.email,
        subject: buildSubject('slot_modification', { event_name: slot.eventName }),
        text: rendered.text,
        html: rendered.html,
      })
    }),
  )

  // 5. Comptage : notified = fulfilled true ; failed = rejected + fulfilled false
  let notified = 0
  let failed = 0
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value === true) {
      notified++
    } else {
      if (result.status === 'rejected') {
        console.error('[EmailService] slot modification recipient rejected:', { slotId: slot.id, reason: result.reason instanceof Error ? result.reason.message : String(result.reason) })
      }
      failed++
    }
  }
  return { notified, failed }
}

// ---------------------------------------------------------------------------
// Email de test SMTP — rend la coque brandée puis délègue au transport ad-hoc
// (le transport reste ad-hoc car il teste une config arbitraire non
// sauvegardée, notamment durant le wizard de setup).
// ---------------------------------------------------------------------------

/**
 * Rend le corps brandé de l'email de test SMTP (via renderSmtpTestEmail),
 * puis l'envoie à `recipient` via le transport ad-hoc sendSmtpTest.
 * @returns { success, message } — ne lève jamais (propage le contrat de sendSmtpTest).
 */
export async function sendBrandedSmtpTest(
  params: SmtpTestParams,
  recipient: string,
): Promise<{ success: boolean; message: string }> {
  let body: { html: string; text: string }
  try {
    body = await renderSmtpTestEmail()
  } catch (err) {
    // Le diagnostic SMTP ne doit JAMAIS 500 sur un échec du pipeline de rendu
    // (row invitation absente, brand corrompue, DB down, MJML invalide) — avant
    // ce diff le corps était statique et indépendant de la DB email. On renvoie
    // { success: false, message } pour honorer le contrat « ne lève jamais ».
    return {
      success: false,
      message: `Erreur de rendu de l'email de test: ${err instanceof Error ? err.message : 'erreur inconnue'}`,
    }
  }
  return sendSmtpTest(params, recipient, body)
}

/**
 * Rend le corps brandé de l'email de test provider (Resend), puis l'envoie à
 * `recipient` via le transport ad-hoc sendProviderTest. Miroir exact de
 * sendBrandedSmtpTest pour le transport HTTP — même contrat « ne lève
 * jamais », même message d'erreur de rendu.
 * @returns { success, message } — ne lève jamais (propage le contrat de sendProviderTest).
 */
export async function sendBrandedProviderTest(
  params: ProviderTestParams,
  recipient: string,
): Promise<{ success: boolean; message: string }> {
  let body: { html: string; text: string }
  try {
    body = await renderSmtpTestEmail()
  } catch (err) {
    return {
      success: false,
      message: `Erreur de rendu de l'email de test: ${err instanceof Error ? err.message : 'erreur inconnue'}`,
    }
  }
  return sendProviderTest(params, recipient, body)
}
