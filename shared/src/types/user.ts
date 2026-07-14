/**
 * Rôle utilisateur — contrat wire (enum DB, traverse HTTP tel quel).
 *
 * `InvitationStatusUser.role` (GET /invitations/status) et `User.role`
 * (endpoints admin user-management) crossent la frontière HTTP avec cette
 * union. Unifié depuis client/src/types/user.ts. Le serveur utilise `string`
 * ou des littéraux inline en interne (jamais d'import de UserRole par nom) —
 * shared est la source pour le contrat wire.
 */
export type UserRole = 'user' | 'admin'
