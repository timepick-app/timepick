/**
 * Contrat wire de l'entité Event (shape camelCase — après snakeToCamelMiddleware).
 *
 * Unifié depuis client/src/types/event.ts (foyer canonique extrait du hook
 * useEvents en Phase 0). Le serveur (event.service.ts) CONSERVE sa propre
 * interface Event interne SANS periodStart/periodEnd : ces champs sont calculés
 * uniquement par la query de liste (getEvents, MIN/MAX sur LEFT JOIN slots) et
 * sont absents des endpoints single-event (getEventById, getPublicEvent…).
 * Représentation interne serveur ≠ forme wire (G2).
 *
 * Décisions wire (G7) :
 *  • periodStart / periodEnd → `string | null`, **OPTIONNELS** (`?`).
 *    Présents sur le wire de liste (calculés MIN(s.start_time)/MAX(s.end_time),
 *    NULL si l'événement n'a aucun créneau). Absents des réponses single-event
 *    (getEventById, getPublicEvent…) qui ne font pas le LEFT JOIN slots.
 *    Le champ `?` reflète fidèlement les deux comportements ; les consommateurs
 *    utilisent déjà des guards truthy (`periodStart ? ...`, `?? ''`, `!periodStart`).
 *  • opensAt → `string | null` (ISO 8601 sur le wire). Le serveur coerce en Date
 *    via zod côté validation (type interne post-validation, pas wire).
 */
export interface Event {
  id: string
  name: string
  description: string | null
  isPublished: boolean
  opensAt: string | null
  hasCustomInvitation: boolean
  createdAt: string
  updatedAt: string
  periodStart?: string | null
  periodEnd?: string | null
}

/** Wire body : POST /api/admin/events. opensAt = ISO 8601 string (serveur coerce en Date). */
export interface CreateEventInput {
  name: string
  description?: string
  opensAt?: string | null
}

/** Wire body : PATCH /api/admin/events/:id. */
export interface UpdateEventInput {
  name?: string
  description?: string | null
  isPublished?: boolean
  opensAt?: string | null
}
