import { query } from '../db'
import { generateMagicLink } from './auth.service'
import { sendEventInvitation } from './email.service'
import { NotFoundError } from '../errors/NotFoundError'
import { EmailDeliveryError } from '../errors/EmailDeliveryError'
import { configService } from './config.service'

export const UNANSWERED_OVER_3_DAYS =
  "status = 'sent' AND clicked_at IS NULL AND sent_at < NOW() - INTERVAL '3 days'"

/**
 * Type pour le résultat d'envoi d'invitation
 */
export interface InvitationSendResult {
  sent: number
  failed: number
  results: Array<{ userId: string; email: string; success: boolean; error?: string }>
}

/**
 * Type pour une invitation (retournée par getEventInvitations)
 */
export interface Invitation {
  id: string
  sentAt: Date
  clickedAt: Date | null
  status: 'sent' | 'clicked' | 'failed'
  user: {
    id: string
    email: string
    firstName: string | null
    lastName: string | null
  }
}

/**
 * Statut d'invitation d'un utilisateur pour un événement
 * (pending = pas encore d'invitation, sent/clicked/failed = invitation existe)
 */
type InvitationStatusType = 'pending' | 'sent' | 'clicked' | 'failed'

/**
 * Utilisateur avec son statut d'invitation pour un événement
 * Retourné par getEventUsersInvitationStatus
 */
export interface InvitationStatusUser {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  phone: string | null
  role: string
  selectedAt: Date
  invitationStatus: InvitationStatusType
  sentAt: Date | null
  clickedAt: Date | null
  firstSentAt: Date | null
  sendCount: number
}

/**
 * Résultat du renvoi d'invitation à un utilisateur
 */
export interface ResendInvitationResult {
  sent: boolean
  email: string
  sentAt: Date
  userId: string
  eventId: string
}

/**
 * Cœur d'envoi d'invitations, partagé par sendInvitations (premier envoi) et
 * resendUnanswered (relance). Pour chaque destinataire : génère un magic link
 * (TTL fourni par l'appelant), envoie l'email, puis upsert l'invitation
 * (ON CONFLICT → renvoi, send_count++). clicked_at n'est JAMAIS touché (monotone).
 * Best-effort par destinataire : une erreur SMTP n'en bloque pas d'autres (allSettled).
 * NOTE : la garde d'éligibilité (NO_SLOTS/EVENT_ENDED) n'est PAS ici — c'est l'appelant
 * qui décide du TTL : sendInvitations passe par calculateInvitationTTL (garde active),
 * resendUnanswered par userTTL direct (pas de garde, comme resendInvitation unitaire).
 */
type InvitationRecipient = { id: string; email: string; first_name: string | null; last_name: string | null }
type InvitationEventMeta = { id: string; name: string; description: string | null }
type InvitationDispatchResult = { userId: string; email: string; success: boolean; error?: string }

async function dispatchInvitations(
  eventId: string,
  eventData: InvitationEventMeta,
  users: InvitationRecipient[],
  ttl: number,
  opts: { recordFailures?: boolean } = {},
): Promise<InvitationDispatchResult[]> {
  // Premier envoi (sendInvitations) persiste les échecs en status='failed'. Une RELANCE
  // (resendUnanswered) passe recordFailures:false : un échec d'envoi de relance NE doit PAS
  // rétrograder la ligne en 'failed' ni toucher sent_at — sinon elle sortirait du prédicat
  // UNANSWERED_OVER_3_DAYS (alerte effacée + invitation jamais re-relançable). Elle reste
  // 'sent' avec son sent_at d'origine → re-relançable.
  const recordFailures = opts.recordFailures ?? true
  const settled = await Promise.allSettled(
    users.map(async (user) => {
      try {
        // Générer le magic link avec TTL fixe
        const { link: magicLink, expirationDate } = await generateMagicLink({
          userId: user.id,
          eventId,
          ttl,
        })

        // Envoyer l'email
        const emailSent = await sendEventInvitation(
          user.email,
          {
            id: eventId,
            name: eventData.name,
            description: eventData.description,
          },
          magicLink,
          expirationDate,
          user.first_name,
          user.last_name,
        )

        if (!emailSent) {
          throw new EmailDeliveryError()
        }

        // Enregistrer l'invitation en base (status: 'sent') - best-effort
        // Le ON CONFLICT gère le renvoi d'invitation: on met à jour sent_at
        try {
          await query(
            `INSERT INTO invitations (event_id, user_id, status)
             VALUES ($1, $2, 'sent')
             ON CONFLICT (event_id, user_id) DO UPDATE SET
               sent_at = NOW(),
               status = 'sent',
               send_count = invitations.send_count + 1`,
            [eventId, user.id],
          )
        } catch (err) {
          console.error('[invitations] envoi: échec mise à jour statut après envoi réussi pour user', user.id, err)
          // Continuer : l'email est parti, le destinataire reste un succès
        }

        return {
          userId: user.id,
          email: user.email,
          success: true,
        }
      } catch (error) {
        console.error('[invitations] envoi: échec envoi invitation pour user', user.id, error)
        // Enregistrer l'échec en base (best-effort) — ne jamais relancer.
        // En RELANCE (recordFailures:false) on n'écrit RIEN : la ligne garde son
        // status='sent' et son sent_at d'origine (sinon elle sort du prédicat de suivi).
        if (recordFailures) {
          try {
            await query(
              `INSERT INTO invitations (event_id, user_id, status)
               VALUES ($1, $2, 'failed')
               ON CONFLICT (event_id, user_id) DO UPDATE SET
                 sent_at = NOW(),
                 status = 'failed',
                 send_count = invitations.send_count + 1`,
              [eventId, user.id],
            )
          } catch (dbErr) {
            console.error('[invitations] envoi: échec persistance statut failed pour user', user.id, dbErr)
            // Ne pas relancer — le callback ne rejette jamais
          }
        }

        return {
          userId: user.id,
          email: user.email,
          success: false,
          error: error instanceof Error ? error.message : 'Erreur inconnue',
        }
      }
    }),
  )

  // Agréger les résultats - défense en profondeur : le callback interne ne devrait jamais
  // rejeter, mais on traite explicitement le cas 'rejected' pour ne perdre aucun destinataire
  const results: InvitationDispatchResult[] = []
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      results.push(result.value)
    } else {
      // Conserver l'identité du destinataire (users[i]) au lieu d'une ligne anonyme,
      // et propager result.reason — sinon un rejet perd l'utilisateur concerné.
      const user = users[i]
      console.error('[invitations] envoi: promesse rejetée inattendue pour user', user?.id, result.reason)
      results.push({
        userId: user?.id ?? '',
        email: user?.email ?? '',
        success: false,
        error: result.reason instanceof Error ? result.reason.message : 'Erreur inattendue (promesse rejetée)',
      })
    }
  })
  return results
}

/**
 * Service de gestion des invitations
 * Gère l'envoi de magic links aux utilisateurs sélectionnés pour un événement
 */
export const invitationsService = {
  /**
   * Envoie les invitations aux utilisateurs sélectionnés pour un événement
   * @param eventId - UUID de l'événement
   * @param userIds - Tableau d'UUIDs des utilisateurs à inviter
   * @returns Résultat d'envoi avec décomptes et détails
   */
  async sendInvitations(eventId: string, userIds: string[]): Promise<InvitationSendResult> {
    // 1. Vérifier que l'événement existe
    const eventResult = await query(
      'SELECT id, name, description FROM events WHERE id = $1',
      [eventId]
    )
    if (eventResult.rows.length === 0) {
      throw new NotFoundError('Événement non trouvé')
    }
    const eventData = eventResult.rows[0]

    // 2. Récupérer les utilisateurs autorisés pour cet événement
    // Seuls les utilisateurs dans event_users peuvent recevoir des invitations
    const authorizedUsersResult = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name
       FROM users u
       INNER JOIN event_users eu ON u.id = eu.user_id
       WHERE eu.event_id = $1 AND u.id = ANY($2)`,
      [eventId, userIds]
    )

    const authorizedUsers = authorizedUsersResult.rows

    // 3. Identifier les utilisateurs non autorisés (pour feedback)
    const authorizedUserIds = new Set(authorizedUsers.map(u => u.id))
    const unauthorizedUserIds = userIds.filter(id => !authorizedUserIds.has(id))

    // 4. Calculer le TTL fixe pour cet événement (un seul calcul avant la boucle)
    const ttlResult = await this.calculateInvitationTTL(eventId)

    if (!ttlResult) {
      // Event cannot receive invitations (no slots or past event)
      // This should be caught by frontend, but backend validates too
      throw new Error('Impossible d\'envoyer des invitations pour cet événement (aucun créneau ou événement terminé)')
    }

    console.log(`[invitations] TTL fixe pour l'événement ${eventId} : ${ttlResult.ttl}s, expire le ${ttlResult.expiresAt.toISOString()}`)

    // 5. Dispatch partagé (magic link + email + upsert) — voir dispatchInvitations.
    const results = await dispatchInvitations(eventId, eventData, authorizedUsers, ttlResult.ttl)

    // 6. Ajouter les utilisateurs non autorisés aux résultats (pour feedback)
    for (const userId of unauthorizedUserIds) {
      results.push({
        userId,
        email: '',
        success: false,
        error: 'Utilisateur non autorisé pour cet événement'
      })
    }

    return {
      sent: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    }
  },

  /**
   * Récupère l'historique des invitations pour un événement
   * @param eventId - UUID de l'événement
   * @returns Liste des invitations avec détails utilisateur
   * @throws NotFoundError si l'événement n'existe pas
   */
  async getEventInvitations(eventId: string): Promise<Invitation[]> {
    // Vérifier que l'événement existe
    const eventResult = await query(
      'SELECT id FROM events WHERE id = $1',
      [eventId]
    )
    if (eventResult.rows.length === 0) {
      throw new NotFoundError('Événement non trouvé')
    }

    const result = await query(
      `SELECT i.id, i.sent_at, i.clicked_at,
              CASE WHEN i.clicked_at IS NOT NULL THEN 'clicked'
                   WHEN i.status = 'failed' THEN 'failed'
                   ELSE 'sent' END as status,
              u.id as user_id, u.email, u.first_name, u.last_name
       FROM invitations i
       JOIN users u ON i.user_id = u.id
       WHERE i.event_id = $1
       ORDER BY i.sent_at DESC`,
      [eventId]
    )

    // Conversion snake_case → camelCase
    // Les dates PostgreSQL sont automatiquement converties en ISO strings par JSON.stringify
    return result.rows.map((row: any) => ({
      id: row.id,
      sentAt: row.sent_at,
      clickedAt: row.clicked_at,
      status: row.status,
      user: {
        id: row.user_id,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name
      }
    }))
  },

  /**
   * Récupère le statut d'invitation de tous les utilisateurs sélectionnés pour un événement
   * Inclut les utilisateurs sans invitation (statut: pending)
   * @param eventId - UUID de l'événement
   * @returns Liste des utilisateurs avec leur statut d'invitation
   * @throws NotFoundError si l'événement n'existe pas
   */
  async getEventUsersInvitationStatus(eventId: string): Promise<InvitationStatusUser[]> {
    // Vérifier que l'événement existe
    const eventResult = await query(
      'SELECT id FROM events WHERE id = $1',
      [eventId]
    )
    if (eventResult.rows.length === 0) {
      throw new NotFoundError('Événement non trouvé')
    }

    const result = await query(
      `SELECT
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.phone,
        u.role,
        eu.created_at as selected_at,
        CASE
          WHEN i.id IS NULL THEN 'pending'
          WHEN i.clicked_at IS NOT NULL THEN 'clicked'
          WHEN i.status = 'failed' THEN 'failed'
          ELSE 'sent'
        END as invitation_status,
        i.sent_at,
        i.clicked_at,
        i.created_at,
        i.send_count
       FROM event_users eu
       JOIN users u ON eu.user_id = u.id
       LEFT JOIN invitations i ON i.event_id = eu.event_id AND i.user_id = u.id
       WHERE eu.event_id = $1
       ORDER BY
         CASE
           WHEN i.id IS NULL THEN 0  -- pending en premier
           WHEN i.status = 'failed' THEN 1
           ELSE 2
         END,
         u.last_name ASC NULLS LAST, u.first_name ASC`,
      [eventId]
    )

    // Conversion snake_case → camelCase
    return result.rows.map((row: any) => ({
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      phone: row.phone,
      role: row.role,
      selectedAt: row.selected_at,
      invitationStatus: row.invitation_status,
      sentAt: row.sent_at,
      clickedAt: row.clicked_at,
      firstSentAt: row.created_at,
      sendCount: row.send_count ?? 0
    }))
  },

  /**
   * Renvoie une invitation à un utilisateur spécifique pour un événement
   * Génère un nouveau magic link et met à jour l'invitation existante
   * @param eventId - UUID de l'événement
   * @param userId - UUID de l'utilisateur
   * @returns Résultat du renvoi avec détails de l'invitation
   * @throws NotFoundError si l'événement n'existe pas ou l'utilisateur n'est pas sélectionné
   */
  async resendInvitation(eventId: string, userId: string): Promise<ResendInvitationResult> {
    // 1. Vérifier que l'événement existe
    const eventResult = await query(
      'SELECT id, name, description FROM events WHERE id = $1',
      [eventId]
    )
    if (eventResult.rows.length === 0) {
      throw new NotFoundError('Événement non trouvé')
    }
    const eventData = eventResult.rows[0]

    // 2. Vérifier que l'utilisateur est sélectionné pour cet événement (event_users)
    const userResult = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name
       FROM users u
       INNER JOIN event_users eu ON u.id = eu.user_id
       WHERE eu.event_id = $1 AND u.id = $2`,
      [eventId, userId]
    )
    if (userResult.rows.length === 0) {
      throw new NotFoundError('Cet utilisateur n\'est pas sélectionné pour cet événement')
    }
    const userData = userResult.rows[0]

    // 3. Générer un nouveau magic link avec TTL fixe
    const { userTTL } = await configService.getMagicLinkConfig()
    const { link: magicLink, expirationDate } = await generateMagicLink({
      userId,
      eventId,
      ttl: userTTL
    })

    // 4. Envoyer l'email
    const emailSent = await sendEventInvitation(
      userData.email,
      {
        id: eventId,
        name: eventData.name,
        description: eventData.description
      },
      magicLink,
      expirationDate,
      userData.first_name,
      userData.last_name
    )

    if (!emailSent) {
      throw new EmailDeliveryError()
    }

    // 5. Mettre à jour l'invitation existante (UPDATE à cause de la contrainte UNIQUE)
    // On met à jour sent_at et on remet le statut à 'sent'. clicked_at n'est PAS réinitialisé
    // (monotone — un clic déjà enregistré reste acquis après un renvoi).
    // Best-effort : une panne DB post-envoi ne doit pas provoquer un faux échec + doublon d'email
    try {
      await query(
        `INSERT INTO invitations (event_id, user_id, status, sent_at)
         VALUES ($1, $2, 'sent', NOW())
         ON CONFLICT (event_id, user_id) DO UPDATE SET
           sent_at = NOW(),
           status = 'sent',
           send_count = invitations.send_count + 1`,
        [eventId, userId]
      )
    } catch (err) {
      console.error('[invitations] resend: échec de mise à jour du statut après envoi réussi:', err)
    }

    return {
      sent: true,
      email: userData.email,
      sentAt: new Date(),
      userId,
      eventId
    }
  },

  /**
   * Relance les invitations « sans réponse depuis > 3 jours » d'un événement.
   *
   * SCOPE UNIQUE (contrat dashboard) : prédicat partagé UNANSWERED_OVER_3_DAYS
   * (status='sent', clicked_at IS NULL, sent_at < NOW()-3j) + destinataire encore
   * sélectionné (event_users) + événement non terminé (events."end"). IDENTIQUE au
   * compte unansweredOver3Days de getEventActivity/getEngagement → l'alerte ne signale
   * qu'une invitation réellement relançable (compte == cible). Un événement terminé ou
   * un destinataire désélectionné → 0 cible, sans bloc (pas de garde 4xx ici).
   *
   * Réutilise dispatchInvitations en mode recordFailures:false : un échec de RELANCE ne
   * rétrograde JAMAIS la ligne en 'failed' et ne touche pas sent_at — elle reste 'sent'
   * à son sent_at d'origine, donc re-relançable et toujours comptée par le dashboard.
   * clicked_at n'est jamais réinitialisé (monotone). Comme resendInvitation unitaire,
   * ne ré-applique PAS la garde d'éligibilité NO_SLOTS/EVENT_ENDED (TTL userTTL direct).
   *
   * @returns { targeted, resent, failed } — targeted = cible (== compte dashboard),
   *          resent = envois réussis, failed = targeted - resent.
   * @throws NotFoundError si l'événement n'existe pas.
   */
  async resendUnanswered(eventId: string): Promise<{ targeted: number; resent: number; failed: number }> {
    // 1. Vérifier que l'événement existe
    const eventResult = await query(
      'SELECT id, name, description FROM events WHERE id = $1',
      [eventId]
    )
    if (eventResult.rows.length === 0) {
      throw new NotFoundError('Événement non trouvé')
    }
    const eventData = eventResult.rows[0]

    // 2. Cible : prédicat partagé UNANSWERED_OVER_3_DAYS (colonnes non qualifiées → la
    //    table invitations reste NON aliasée) + membre sélectionné + événement non terminé.
    //    Set vide → 0 cible (événement terminé / tous désélectionnés / rien >3j).
    const usersResult = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name
         FROM invitations
         JOIN event_users eu ON eu.event_id = invitations.event_id AND eu.user_id = invitations.user_id
         JOIN users u ON u.id = invitations.user_id
         JOIN events e ON e.id = invitations.event_id
        WHERE invitations.event_id = $1 AND ${UNANSWERED_OVER_3_DAYS}
          AND (e."end" IS NULL OR e."end" >= NOW())`,
      [eventId]
    )

    // 3. TTL direct (userTTL) — pas de garde d'éligibilité, comme resendInvitation unitaire.
    const { userTTL } = await configService.getMagicLinkConfig()

    // 4. Dispatch partagé (recordFailures:false) + décompte. Compte == cible : le même
    //    prédicat sert au dashboard, donc targeted correspond à l'alerte affichée.
    const results = await dispatchInvitations(eventId, eventData, usersResult.rows, userTTL, { recordFailures: false })
    const targeted = usersResult.rows.length
    const resent = results.filter(r => r.success).length
    return { targeted, resent, failed: results.filter(r => !r.success).length }
  },

  /**
   * Validates if an event can receive invitations
   * Returns null if valid, or error details if blocked
   * @param eventId - UUID of the event
   * @returns Validation result with canSend flag and optional error details
   */
  async validateEventForInvitations(eventId: string): Promise<{
    canSend: boolean
    errorCode?: string
    errorMessage?: string
  }> {
    const result = await query(
      `SELECT e."end",
              (SELECT COUNT(*) FROM slots WHERE event_id = e.id) as slot_count
       FROM events e
       WHERE id = $1`,
      [eventId]
    )

    if (result.rows.length === 0) {
      throw new NotFoundError('Événement non trouvé')
    }

    const eventData = result.rows[0]
    const slotCount = parseInt(eventData.slot_count, 10)

    // No slots - block invitations
    if (slotCount === 0) {
      return {
        canSend: false,
        errorCode: 'NO_SLOTS',
        errorMessage: 'Ajoutez des créneaux pour envoyer des invitations'
      }
    }

    // Event ended - block invitations
    if (eventData.end) {
      const eventEnd = new Date(eventData.end)
      const now = new Date()
      if (eventEnd < now) {
        return {
          canSend: false,
          errorCode: 'EVENT_ENDED',
          errorMessage: 'Cet événement est terminé'
        }
      }
    }

    return { canSend: true }
  },

  /**
   * Calcule le TTL fixe pour une invitation
   * Retourne null si l'événement ne peut pas recevoir d'invitations (EVENT_ENDED / NO_SLOTS)
   * @param eventId - UUID de l'événement
   * @returns TTL result with ttl (seconds) and expiresAt date, or null if blocked
   */
  async calculateInvitationTTL(eventId: string): Promise<{ ttl: number; expiresAt: Date } | null> {
    // First validate event can receive invitations
    const validation = await this.validateEventForInvitations(eventId)
    if (!validation.canSend) {
      return null
    }

    // TTL fixe basé sur la configuration (userTTL)
    const config = await configService.getMagicLinkConfig()
    const maxTTL = config.userTTL

    const now = new Date()
    const expiresAt = new Date(now.getTime() + maxTTL * 1000)
    const ttl = Math.floor(maxTTL / 60) * 60

    return { ttl, expiresAt }
  },

  /**
   * Enregistre le premier clic sur une invitation (monotone).
   * Pose clicked_at = NOW() si et seulement si clicked_at IS NULL (idempotent, premier clic gagnant).
   * N'écrit plus status='clicked' — le statut reste 'sent' ou 'failed' (cycle d'envoi).
   * Best-effort : n'échoue jamais pour ne pas bloquer le flow d'authentification.
   * Enregistre aussi pour les lignes status='failed' (décision produit).
   * @param eventId - UUID de l'événement
   * @param userId - UUID de l'utilisateur
   * @returns true si clicked_at a été posé (premier clic), false sinon (déjà cliqué ou absent)
   */
  async markAsClicked(eventId: string, userId: string): Promise<boolean> {
    try {
      const result = await query(
        `UPDATE invitations
         SET clicked_at = NOW()
         WHERE event_id = $1 AND user_id = $2 AND clicked_at IS NULL
         RETURNING id`,
        [eventId, userId]
      )
      return result.rows.length > 0
    } catch (error) {
      console.error('[invitationsService.markAsClicked] Failed to track click:', error)
      return false
    }
  }
}
