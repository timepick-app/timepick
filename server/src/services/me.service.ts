import { query } from '../db'
import type { z } from 'zod'
import type { patchMeProfileSchema } from '../validators/user.validator'
import { NotFoundError } from '../errors/NotFoundError'
import { ValidationError } from '../errors/ValidationError'

/**
 * Forme d'une row DB brute (snake_case) retournée par la requête /me/events.
 * Privée : seul le service connaît la forme colonne. Le contrôleur et le client
 * consomment la forme camelCase {@link MemberEvent}.
 */
interface MemberEventRow {
  uuid: string
  name: string
  // MIN/MAX sur TIMESTAMPTZ → pg désérialise en objet Date (ou null si aucun slot).
  start_date: Date | null
  end_date: Date | null
  my_booking_count: number
  is_upcoming: boolean
}

/**
 * Row DB brute (snake_case) retournée par les requêtes /me/slots (upcoming +
 * past). Privée : seul le service connaît la forme colonne. Les contrôleurs et
 * clients consomment la forme camelCase {@link MySlotBooking}.
 *
 * `status` est DÉRIVÉ de `slots.cancelled_at` (la table `bookings` n'a pas de
 * colonne status — clé #1) : 'cancelled' si annulé, sinon 'active'. Les slots
 * annulés sont volontairement conservés dans upcoming/past pour signaler
 * l'annulation au membre (clé #2), mais exclus du total_realized_hours.
 */
interface MySlotBookingRow {
  slot_uuid: string
  event_uuid: string
  event_name: string
  start_time: Date
  end_time: Date
  status: 'active' | 'cancelled'
}

/**
 * Row DB brute (snake_case) retournée par la requête /me/available-slots.
 * `available_spots` est calculée en sous-requête (clé #4 : `s.booked_count`
 * n'existe pas comme colonne) : `capacity - COUNT(bookings)`.
 */
interface MyAvailableSlotRow {
  slot_uuid: string
  event_uuid: string
  event_name: string
  start_time: Date
  end_time: Date
  available_spots: number
}

/**
 * Forme d'une row DB brute (snake_case) de la table `users` retournée par
 * `GET / PATCH /api/me/profile`. Privée : seul le service connaît la forme
 * colonne. La conversion en camelCase est assurée par `snakeToCamelMiddleware`
 * au niveau réponse (le contrôleur renvoie la row brute).
 */
interface MyProfileRow {
  id: string
  email: string
  first_name: string
  last_name: string | null
  profession: string | null
  informations: string | null
  phone: string | null
  role: 'user' | 'admin'
  created_at: Date
  updated_at?: Date
}

/**
 * Entrée validée du PATCH profile = forme inférée du Zod `patchMeProfileSchema`
 * (sans `role`, sans `email`). Tous les champs sont optionnels (PATCH partiel).
 */
type UpdateMyProfileInput = z.infer<typeof patchMeProfileSchema>

/**
 * Événement exposé au membre via `GET /api/me/events`.
 *
 * Champs en camelCase (forme après conversion, ce que le client reçoit).
 * `startDate`/`endDate` sont des chaînes ISO 8601 (ou `null` si l'événement
 * n'a aucun créneau actif). `myBookingCount` exclut les réservations portant sur
 * des créneaux annulés (D4). `isUpcoming` est vrai tant qu'au moins un créneau
 * actif se termine dans le futur (D3).
 */
export interface MemberEvent {
  uuid: string
  name: string
  startDate: string | null
  endDate: string | null
  myBookingCount: number
  isUpcoming: boolean
}

/**
 * Booking du membre exposé dans `upcoming`/`past` de `GET /api/me/slots`.
 *
 * Miroir camelCase de la row DB {@link MySlotBookingRow}. `startTime`/`endTime`
 * sont des chaînes ISO 8601 (conversion explicite côté service, comme
 * `MemberEvent`). `status` est dérivé de `slots.cancelled_at` (clé #1) :
 * 'cancelled' pour un slot annulé (le booking est conservé pour signaler
 * l'annulation au membre, clé #2), sinon 'active'.
 */
export interface MySlotBooking {
  slotUuid: string
  eventUuid: string
  eventName: string
  startTime: string
  endTime: string
  status: 'active' | 'cancelled'
}

/**
 * Créneau futur libre exposé par `GET /api/me/available-slots`. Miroir camelCase
 * de {@link MyAvailableSlotRow}. `availableSpots` = `capacity - bookings`.
 */
export interface MyAvailableSlot {
  slotUuid: string
  eventUuid: string
  eventName: string
  startTime: string
  endTime: string
  availableSpots: number
}

/**
 * Réponse de `GET /api/me/slots` (AC2). `upcoming` = créneaux à venir (tous
 * chargés, borne naturelle ~15/an) ; `past` = page courante (LIMIT 20, curseur
 * vers les plus anciens) ; `nextCursor` = start_time ISO du dernier `past` ou
 * `null` si page finale ; `totalRealizedHours` = somme des durées des créneaux
 * PASSÉS ACTIFS uniquement (clé #2/#3 — exclut futur et annulés), arrondi 1 déc.
 */
export interface MySlotsResult {
  upcoming: MySlotBooking[]
  past: MySlotBooking[]
  nextCursor: string | null
  totalRealizedHours: number
}

/**
 * Requête SQL cible (décisions D2-D5, D10) :
 *  - `startDate`/`endDate` dérivés de `slots` (MIN/MAX), PAS de la colonne
 *    legacy `events.end_date` ni du cache `events."end"` (D2/D5).
 *  - `LATERAL` isole chaque sous-calcul (période + compteur bookings) sur les
 *    créneaux actifs uniquement (`cancelled_at IS NULL`, D4/D5).
 *  - Filtrage structurel par `event_users.user_id = $1` (isolation, AC4) ET
 *    `e.is_published = true` (brouillons masqués au membre, D10/AC6).
 *  - Aucun `Seq Scan` attendu : `idx_event_users_user_id` borne la lecture,
 *    `idx_slots_event_id` + `idx_bookings_user_id` pilotent les `LATERAL` (AC5).
 */
const GET_MY_EVENTS_SQL = `
SELECT
  e.id AS uuid,
  e.name,
  period.period_start AS start_date,
  period.period_end AS end_date,
  COALESCE(bc.booking_count, 0) AS my_booking_count,
  (period.period_end IS NOT NULL AND period.period_end > NOW()) AS is_upcoming
FROM event_users eu
JOIN events e ON e.id = eu.event_id
LEFT JOIN LATERAL (
  SELECT MIN(s.start_time) AS period_start, MAX(s.end_time) AS period_end
  FROM slots s
  WHERE s.event_id = e.id AND s.cancelled_at IS NULL
) period ON TRUE
LEFT JOIN LATERAL (
  SELECT COUNT(b.id)::int AS booking_count
  FROM bookings b
  JOIN slots s ON s.id = b.slot_id
  WHERE b.user_id = $1 AND s.event_id = e.id AND s.cancelled_at IS NULL
) bc ON TRUE
WHERE eu.user_id = $1 AND e.is_published = true
ORDER BY period.period_start DESC NULLS LAST, e.name
`

/**
 * Requêtes /me/slots (Story 1.8, AC2/AC3/AC4) :
 *  - `upcoming` : bookings du membre sur slots dont `start_time > NOW()`, tous
 *    chargés (borne naturelle ~15/an). Les slots annulés SONT inclus (clé #2 —
 *    signaler l'annulation) avec `status='cancelled'`.
 *  - `past` : même SELECT borné `start_time < NOW()`, curseur optionnel vers les
 *    plus anciens (`start_time < $2::timestamptz`), `ORDER BY start_time DESC
 *    LIMIT 20`. Le curseur cast explicite `timestamptz` (conventions §Dates).
 *  - `total_realized_hours` : SUM durées sur bookings dont `end_time < NOW()`
 *    ET slot actif (clé #2/#3). `numeric(10,1)` arrondit à 1 décimale ;
 *    `COALESCE(...,0)` retourne 0 si aucun booking.
 *
 * Index consommés (gate perf AC9) : `idx_bookings_user_id` borne la lecture des
 * bookings du membre, `idx_slots_event_id_start_time` (partiel, migration 035)
 * couvre le tri et le JOIN sur slots actifs, `idx_slots_end_time` (partiel)
 * couvre le filtre `end_time < NOW()` du total. Aucun Seq Scan attendu.
 */
const GET_MY_UPCOMING_SLOTS_SQL = `
SELECT
  s.id AS slot_uuid,
  e.id AS event_uuid,
  e.name AS event_name,
  s.start_time,
  s.end_time,
  CASE WHEN s.cancelled_at IS NOT NULL THEN 'cancelled' ELSE 'active' END AS status
FROM bookings b
JOIN slots s ON s.id = b.slot_id
JOIN events e ON e.id = s.event_id
WHERE b.user_id = $1 AND s.start_time > NOW() AND e.is_published = true
ORDER BY s.start_time ASC
`

const GET_MY_PAST_SLOTS_SQL = `
SELECT
  s.id AS slot_uuid,
  e.id AS event_uuid,
  e.name AS event_name,
  s.start_time,
  s.end_time,
  CASE WHEN s.cancelled_at IS NOT NULL THEN 'cancelled' ELSE 'active' END AS status
FROM bookings b
JOIN slots s ON s.id = b.slot_id
JOIN events e ON e.id = s.event_id
WHERE b.user_id = $1 AND s.start_time < NOW() AND e.is_published = true
  AND ($2::timestamptz IS NULL OR (s.start_time, s.id) < ($2::timestamptz, $3::uuid))
ORDER BY s.start_time DESC, s.id DESC
LIMIT 20
`

const GET_TOTAL_REALIZED_HOURS_SQL = `
SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 3600), 0)::numeric(10,1) AS total
FROM bookings b
JOIN slots s ON s.id = b.slot_id
JOIN events e ON e.id = s.event_id
WHERE b.user_id = $1 AND s.end_time < NOW() AND s.cancelled_at IS NULL AND e.is_published = true
`

/**
 * Requête /me/available-slots (Story 1.8, AC4) : créneaux futurs LIBRES dans
 * les événements publiés où le membre est rattaché (`event_users`), n'ayant pas
 * déjà été réservés par le membre (`NOT EXISTS`), avec capacité restante > 0
 * (clé #4 : `s.booked_count` n'existe pas — calculée en sous-requête).
 *
 * Index consommés (gate perf AC9) : `idx_event_users_user_id` borne par membre,
 * `idx_slots_event_id_start_time` (partiel) couvre slots actifs triés, l'index
 * implicite `unique_booking(slot_id, user_id)` couvre la sous-requête NOT EXISTS.
 * `LIMIT 10` + `ORDER BY start_time ASC`. Borné par event_users(user_id).
 */
const GET_MY_AVAILABLE_SLOTS_SQL = `
SELECT
  s.id AS slot_uuid,
  e.id AS event_uuid,
  e.name AS event_name,
  s.start_time,
  s.end_time,
  (s.capacity - bc.cnt)::int AS available_spots
FROM slots s
JOIN events e ON s.event_id = e.id
JOIN event_users eu ON eu.event_id = e.id AND eu.user_id = $1
JOIN LATERAL (SELECT COUNT(*) AS cnt FROM bookings WHERE slot_id = s.id) bc ON TRUE
WHERE s.start_time > NOW()
  AND s.cancelled_at IS NULL
  AND e.is_published = true
  AND bc.cnt < s.capacity
  AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.slot_id = s.id AND b.user_id = $1)
ORDER BY s.start_time ASC
LIMIT 10
`

/**
 * Mappe une row DB {@link MySlotBookingRow} (snake_case, Date) en forme exposée
 * {@link MySlotBooking} (camelCase, ISO strings). Conversion explicite des dates
 * côté service pour verrouiller le type (comme `getMyEvents`) — la sérialisation
 * Express transformerait les `Date` en ISO via JSON.stringify, mais on l'explicite
 * pour la lisibilité et le typage strict (aucun `any`).
 */
function rowToMySlotBooking(row: MySlotBookingRow): MySlotBooking {
  return {
    slotUuid: row.slot_uuid,
    eventUuid: row.event_uuid,
    eventName: row.event_name,
    startTime: row.start_time.toISOString(),
    endTime: row.end_time.toISOString(),
    status: row.status,
  }
}

/**
 * Service exposant les données de l'espace membre (`/api/me/*`).
 * Reçoit un `userId` (UUID string positionné par `requireAuth`), retourne des
 * données — jamais de `Response` (pattern service).
 */
export const meService = {
  /**
   * Liste les événements publiés auxquels le membre est rattaché, avec leur
   * période dérivée (MIN/MAX des créneaux actifs) et le nombre de réservations
   * du membre sur des créneaux actifs.
   *
   * @param userId - UUID du membre courant (fourni par `requireAuth`).
   * @returns Tableau `MemberEvent[]` (vide, jamais `null`, si aucun rattachement).
   */
  async getMyEvents(userId: string): Promise<MemberEvent[]> {
    // Defense-in-depth : requireAuth garantit un UUID valide, mais le service
    // ne doit pas crasher sur une entrée vide (pas de requête inutile non plus).
    if (typeof userId !== 'string' || userId.trim() === '') {
      return []
    }

    const result = await query<MemberEventRow>(GET_MY_EVENTS_SQL, [userId])

    return result.rows.map((row) => ({
      uuid: row.uuid,
      name: row.name,
      // Normalisation ISO string : pg renvoie des Date pour TIMESTAMPTZ ; le
      // contrat JSON de l'API est une chaîne. Conversion explicite plutôt que
      // de compter sur la sérialisation Express (typage strict, aucun `any`).
      startDate: row.start_date ? row.start_date.toISOString() : null,
      endDate: row.end_date ? row.end_date.toISOString() : null,
      myBookingCount: row.my_booking_count,
      isUpcoming: row.is_upcoming,
    }))
  },
  /**
   * Récupère les créneaux réservés du membre (à venir + passés paginés) et le
   * total d'heures réalisées (Story 1.8, AC2/AC3/AC6/AC7).
   *
   * Trois requêtes parallèles (lectures only → pas de `withTransaction`) :
   * `upcoming`, `past` (page courante via curseur), `total_realized_hours`. Le
   * `query<T>` centralisé route automatiquement vers le `transactionClient` en
   * mode test (Pattern A rollback préservé).
   *
   * Décisions clés : les slots annulés SONT conservés dans upcoming/past (clé #2
   * — signaler l'annulation) avec `status='cancelled'`, mais EXCLUS du
   * `total_realized_hours` (clé #2/#3 — l'heure n'a pas été effectuée).
   *
   * @param userId - UUID du membre courant (fourni par `requireAuth`).
   * @param cursor - Curseur composite optionnel : `{ start: Date; id: string }` issu du
   *                 dernier élément `past` de la page précédente. `null` = p1.
   * @returns {@link MySlotsResult} (tableaux vides + 0 si aucun booking).
   */
  async getMySlots(userId: string, cursor: { start: Date; id: string } | null): Promise<MySlotsResult> {
    const LIMIT = 20
    // Promise.all : 3 lectures indépendantes, lancées concurremment. Aucune
    // écriture → pas besoin de withTransaction ; le query centralisé reste
    // isolé en mode test (transactionClient injecté).
    const [upcomingRes, pastRes, totalRes] = await Promise.all([
      query<MySlotBookingRow>(GET_MY_UPCOMING_SLOTS_SQL, [userId]),
      query<MySlotBookingRow>(GET_MY_PAST_SLOTS_SQL, [userId, cursor?.start ?? null, cursor?.id ?? null]),
      query<{ total: string }>(GET_TOTAL_REALIZED_HOURS_SQL, [userId]),
    ])

    const upcoming = upcomingRes.rows.map(rowToMySlotBooking)
    const past = pastRes.rows.map(rowToMySlotBooking)
    // Curseur : si la page courante atteint le LIMIT, il existe potentiellement
    // une page suivante → on expose le start_time du dernier élément. Sinon
    // (rowCount < LIMIT ou page vide), fin d'historique atteinte → null.
    const nextCursor =
      past.length === LIMIT
        ? `${past[past.length - 1].startTime}|${past[past.length - 1].slotUuid}`
        : null

    // numeric(10,1) arrive comme string côté pg (type numeric) → Number() parse.
    const totalRealizedHours = Number(totalRes.rows[0]?.total ?? 0)

    return { upcoming, past, nextCursor, totalRealizedHours }
  },
  /**
   * Liste les créneaux futurs libres dans les événements publiés où le membre
   * est rattaché, qu'il n'a pas déjà réservés (Story 1.8, AC4/AC6).
   *
   * Bornée par `event_users(user_id)` du membre (pas de scan cross-event
   * global), `LIMIT 10` triée `start_time ASC`. Slots annulés / events
   * brouillons / slots passés / slots déjà réservés par le membre exclus.
   *
   * @param userId - UUID du membre courant (fourni par `requireAuth`).
   * @returns Tableau `MyAvailableSlot[]` (vide, jamais `null`).
   */
  async getMyAvailableSlots(userId: string): Promise<MyAvailableSlot[]> {
    const result = await query<MyAvailableSlotRow>(GET_MY_AVAILABLE_SLOTS_SQL, [
      userId,
    ])
    return result.rows.map((row) => ({
      slotUuid: row.slot_uuid,
      eventUuid: row.event_uuid,
      eventName: row.event_name,
      startTime: row.start_time.toISOString(),
      endTime: row.end_time.toISOString(),
      availableSpots: row.available_spots,
    }))
  },
  /**
   * Récupère le profil complet du membre courant (lecture seule côté DB).
   *
   * @param userId - UUID du membre (fourni par `requireAuth`).
   * @returns La row `users` brute (snake_case), ou `null` si l'user n'existe pas.
   *          La conversion camelCase est assurée par `snakeToCamelMiddleware`.
   *
   * Justification GET : le payload de login (`auth.controller.ts`) omet
   * `phone`/`profession`/`informations` → `useAuth().user` ne peut pas pré-remplir
   * ces 3 champs (smoke CP4). Ce GET est l'unique source de vérité fraîche.
   */
  async getMyProfile(userId: string): Promise<MyProfileRow | null> {
    // Defense-in-depth : requireAuth garantit un UUID valide, mais le service
    // ne doit pas exécuter de requête sur une entrée vide.
    if (typeof userId !== 'string' || userId.trim() === '') {
      return null
    }
    const result = await query<MyProfileRow>(
      `SELECT id, email, first_name, last_name, profession, informations, phone, role, created_at
       FROM users WHERE id = $1`,
      [userId]
    )
    return result.rows[0] ?? null
  },

  /**
   * Met à jour les champs éditables du profil membre (first_name, last_name,
   * phone, profession, informations). Ne touche JAMAIS à `email` ni `role` :
   * le schéma Zod `patchMeProfileSchema` (appelé côté contrôleur) les a déjà
   * stripés, et ce service ne les référence pas (defense-in-depth).
   *
   * @param userId - UUID du membre (depuis `req.user.userId`, JAMAIS du body).
   * @param input  - Champs optionnels validés par `patchMeProfileSchema`.
   * @returns La row `users` mise à jour (snake_case), convertie côté réponse.
   * @throws {Error} 'Aucune donnée à mettre à jour' si l'input ne contient
   *                 aucun champ (le contrôleur traduit en 400).
   */
  async updateMyProfile(
    userId: string,
    input: UpdateMyProfileInput
  ): Promise<MyProfileRow> {
    const updates: string[] = []
    const values: (string | null | undefined)[] = []
    let paramCount = 1
    // UPDATE dynamique (pattern admin.controller.ts:344-396) SANS la branche
    // `role` et SANS effets de bord rôle. `userId` vient du token, pas du body.
    if (input.first_name !== undefined) {
      updates.push(`first_name = $${paramCount}`)
      values.push(input.first_name)
      paramCount++
    }
    if (input.last_name !== undefined) {
      updates.push(`last_name = $${paramCount}`)
      values.push(input.last_name || null)
      paramCount++
    }
    if (input.profession !== undefined) {
      updates.push(`profession = $${paramCount}`)
      values.push(input.profession || null)
      paramCount++
    }
    if (input.informations !== undefined) {
      updates.push(`informations = $${paramCount}`)
      values.push(input.informations || null)
      paramCount++
    }
    if (input.phone !== undefined) {
      updates.push(`phone = $${paramCount}`)
      values.push(input.phone)
      paramCount++
    }
    if (updates.length === 0) {
      throw new ValidationError('Aucune donnée à mettre à jour')
    }
    values.push(userId)
    const result = await query<MyProfileRow>(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}
       RETURNING id, email, first_name, last_name, profession, informations, phone, role, created_at, updated_at`,
      values
    )
    if (!result.rows[0]) {
      throw new NotFoundError('Utilisateur non trouvé')
    }
    return result.rows[0]
  },
}
