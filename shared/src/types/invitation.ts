import type { UserRole } from './user'

/**
 * Types d'invitation — formes wire (camelCase, string dates après
 * JSON.stringify côté serveur).
 *
 * Unifiés depuis client/src/types/invitation.ts. Le serveur (invitations.service.ts)
 * garde ses PROPRES types internes basés sur `Date` (getEventInvitations mappe
 * `sentAt: row.sent_at` où row.sent_at est un objet pg Date) — ce sont des
 * représentations internes, pas la forme wire (G2 : le typage honnête des
 * objets/rows serveur est hors périmètre). Shared = forme wire consommée par
 * le client ; le serveur produit cette forme via la sérialisation JSON.
 *
 * Décisions wire (G7) :
 *  • SendInvitationsResult = UNIFICATION `{ sent, failed, results, message }`.
 *    Le controller sendInvitations (invitations.controller.ts:21-26) construit
 *    TOUJOURS les DEUX : `results` (détail par destinataire) ET `message`
 *    (résumé human-readable). Ni le type client d'origine (message seul) ni le
 *    type serveur InvitationSendResult (results seul) n'était complet.
 *  • Toutes les dates → `string` (sérialisation JSON). Le type serveur `Date`
 *    est un mensonge type pré-existant (G2).
 *  • InvitationStatusUser.role → `UserRole` (union stricte, enum DB).
 */

/** Toutes valeurs possibles, incluant 'pending' = jamais invitée. */
export type InvitationStatusType = 'pending' | 'sent' | 'clicked' | 'failed'

/** Wire : GET /api/admin/events/:id/invitations — item. */
export interface Invitation {
  id: string
  /** ISO 8601 (pg Date sérialisée). */
  sentAt: string
  clickedAt: string | null
  /** Dérivé par SQL CASE (clicked_at IS NOT NULL → 'clicked' prioritaire). */
  status: 'sent' | 'clicked' | 'failed'
  user: {
    id: string
    email: string
    firstName: string | null
    lastName: string | null
  }
}

/** Wire : GET /api/admin/events/:id/invitations/status — item. */
export interface InvitationStatusUser {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  phone: string | null
  /** Enum DB 'user'|'admin', émis tel quel dans la réponse JSON. */
  role: UserRole
  /** ISO 8601 (event_users.created_at aliasé selected_at). */
  selectedAt: string
  invitationStatus: InvitationStatusType
  sentAt: string | null
  clickedAt: string | null
  /** ISO 8601 (invitations.created_at — premier envoi). */
  firstSentAt: string | null
  sendCount: number
}

/**
 * Wire : POST /api/admin/events/:id/invitations/send — réponse unifiée.
 * Le controller construit `results` (issu du InvitationSendResult service)
 * ET `message`. Shared = l'union canonique.
 */
export interface SendInvitationsResult {
  sent: number
  failed: number
  results: Array<{ userId: string; email: string; success: boolean; error?: string }>
  message: string
}

/** Wire : POST /api/admin/events/:id/invitations/:userId/resend — réponse. */
export interface ResendInvitationResult {
  sent: boolean
  email: string
  /** ISO 8601 (le controller appelle result.sentAt.toISOString()). */
  sentAt: string
  userId: string
  eventId: string
}
