/**
 * Registre central des PostgreSQL Advisory Lock IDs
 *
 * PostgreSQL Advisory Locks sont des mutex applicatifs basés sur des IDs entiers.
 * Ils permettent d'éviter les race conditions entre plusieurs instances du serveur.
 *
 * Documentation: https://www.postgresql.org/docs/current/functions-admin.html#ADVISORY-LOCKS
 *
 * Plages réservées:
 * - 100000000-199999999: Opérations de setup et initialisation
 * - 200000000-299999999: Opérations de réservation
 * - 300000000-399999999: Opérations d'export et reporting
 * - 400000000-499999999: Opérations de calendrier
 *
 * @module db/advisory-locks
 */

/**
 * Advisory Lock IDs utilisés dans l'application
 *
 * IMPORTANT: Chaque nouveau lock doit être ajouté ici avec son ID unique
 * pour éviter les conflits entre différentes features.
 */
export const ADVISORY_LOCKS = {
  /**
   * Lock pour la création du premier administrateur lors du setup initial
   * Empêche la création simultanée de plusieurs admins
   */
  SETUP_FIRST_ADMIN: 100000001,

} as const;

