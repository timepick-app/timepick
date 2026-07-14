// Types d'invitation — forme wire unifiée (source unique @timepick/shared).
// Historiquement définis ici puis dupliqués côté serveur. À présent ré-exportés
// depuis @timepick/shared (le serveur garde ses types internes Date-based, G2).
// Décision wire clé : SendInvitationsResult unifie { sent, failed, results,
// message } (le controller renvoie toujours les deux). Voir shared/src/types/invitation.ts.
export type {
  InvitationStatusType,
  Invitation,
  InvitationStatusUser,
  SendInvitationsResult,
} from '@timepick/shared'
