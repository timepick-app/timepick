/**
 * Barrel @timepick/shared — types de contrat d'API (shape wire camelCase).
 *
 * Source unique pour les types dupliqués entre client et serveur. Rempli
 * progressivement : Phase 1 étape 1 (Groupe A : Slot, Booking, Invitation*,
 * Event), puis Phase 2 (Groupe B + constantes runtime + Zod).
 * Chaque type migré ajoute un `export * from './types/<name>'` ci-dessous.
 */

// Groupe A — migration en cours.
export * from './types/booking'
export * from './types/slot'
export * from './types/user'
export * from './types/invitation'
export * from './types/event'

// Phase 2 — constantes runtime cross-boundary.
export * from './constants/email'

// Contrat d'erreur — source unique des codes portés par les réponses d'API.
export * from './errorCodes'
