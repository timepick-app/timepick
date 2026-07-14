/**
 * Filet de parité des types d'API — Phase 0 (G6).
 *
 * Verrouille, par assertions type-level pures (zéro runtime, zéro lib), l'état
 * actuel des types dupliqués de part et d'autre de la frontière client/serveur
 * (le « Groupe A » : Slot, Booking, Invitation*, Event). Chaque divergence
 * sémantique (G7) est figée par une assertion qui casse la compilation ts-jest
 * dès qu'un côté converge ou diverge davantage — forçant une re-décision
 * explicite du contrat wire lors de la migration Phase 1 vers `@timepick/shared`.
 *
 * Pourquoi côté serveur + ts-jest : le test importe les types client via chemin
 * relatif et est type-checké par ts-jest (le gate `tsc --noEmit` exclut
 * `__tests__` — server/tsconfig.json:14). Ce pattern est NOUVEAU dans le repo :
 * il a été validé empiriquement (import cross-boundary compile ; une divergence
 * volontaire fait échouer la compilation) AVANT d'être généralisé ici.
 *
 * Limitation volontaire : ce filet repose UNIQUEMENT sur ts-jest. Ne pas migrer
 * le runner serveur vers swc/babel-jest ni activer `isolatedModules` sans
 * revalider ce test.
 */
import type { Slot as ClientSlot } from '../../../../client/src/types/slot'
import type { Booking as ClientBooking } from '../../../../client/src/types/booking'
import type {
  Invitation as ClientInvitation,
  InvitationStatusUser as ClientInvitationStatusUser,
  SendInvitationsResult as ClientSendInvitationsResult,
} from '../../../../client/src/types/invitation'
import type { Event as ClientEvent } from '../../../../client/src/types/event'

import type { Slot as ServerSlot } from '../../services/slot.service'
import type { Booking as ServerBooking } from '../../services/reservation.service'
import type {
  Invitation as ServerInvitation,
  InvitationSendResult as ServerInvitationSendResult,
  InvitationStatusUser as ServerInvitationStatusUser,
} from '../../services/invitations.service'
import type { Event as ServerEvent } from '../../services/event.service'

// --- Helpers d'assertion type-level (zéro lib, zéro runtime) ----------------
// `Expect<T>` ne compile que si `T extends true`. Un `Equal`/`HasField` faux
// fait donc échouer la compilation sous ts-jest (TS2344).
type Expect<T extends true> = T
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false
type NotEqual<X, Y> = Equal<X, Y> extends true ? false : true
type Not<T extends boolean> = T extends true ? false : true
// `true` si la clé K (littérale) existe sur T (même optionnelle), `false` sinon.
type HasField<T, K extends string> = K extends keyof T ? true : false

// ===========================================================================
// Slot (+ Volunteer) — MIGRÉ vers @timepick/shared (convergé)
// ===========================================================================
// Slot fut le 2e type migré (Phase 1 étape 1). Les deux côtés importent à
// présent la même forme wire depuis @timepick/shared et la ré-exportent
// (client/src/types/slot.ts — qui garde helpers/props locaux ; server
// slot.service.ts). Décisions wire appliquées : currentBookings OPTIONNEL
// (absent des RETURNING * des writes) ; cancelledAt/cancellationReason REQUIS
// `string|null` (colonnes DB migration 014). Volunteer migre avec Slot.
// Le filet verrouille la CONVERGENCE : Equal<Client,Server> reste vraie tant
// que les deux ré-exportent le même type shared.
type _SlotConverged = Expect<Equal<ClientSlot, ServerSlot>>

// ===========================================================================
// Booking — MIGRÉ vers @timepick/shared (convergé)
// ===========================================================================
// Booking fut le premier type migré (Phase 1 étape 1). Les deux côtés
// importent à présent la même forme wire depuis @timepick/shared et la
// ré-exportent (client/src/types/booking.ts, server reservation.service.ts).
// Décisions wire appliquées : eventName REQUIS ; slot.cancelledAt/
// cancellationReason REQUIS `string|null` dans slot (getUserReservations les
// SELECT/mappe toujours) ; user? optionnel (admin). Le filet verrouille
// désormais la CONVERGENCE : Equal<Client,Server> reste vraie tant que les
// deux ré-exportent le même type shared. Toute redéfinition locale divergente
// casserait Equal et forcerait une re-décision.
type _BookingConverged = Expect<Equal<ClientBooking, ServerBooking>>

// ===========================================================================
// Invitation* — client MIGRÉ vers @timepick/shared ; serveur garde types internes (G2)
// ===========================================================================
// Le client importe à présent les formes wire (dates string) depuis
// @timepick/shared et les ré-exporte (types/invitation.ts ; types/user.ts pour
// UserRole). Le serveur (invitations.service.ts) CONSERVE ses propres types
// internes basés sur `Date` (getEventInvitations mappe `sentAt: row.sent_at`
// où row.sent_at est un objet pg Date) — représentations internes, pas la forme
// wire (G2 : typage honnête des rows/objets serveur hors périmètre). Le filet
// verrouille donc la divergence PERSISTANTE client-wire vs serveur-interne :
//  • Dates : client `string` (wire) vs serveur `Date` (interne).
//  • InvitationStatusUser.role : client `UserRole` (union stricte via shared)
//    vs serveur `string` (laxe — enum garantie DB, non typée côté service).
// Toute convergence future (ex. serveur qui adopte shared + .toISOString())
// casserait ces assertions et forcerait une re-décision.
type _InvitationDiverge = Expect<NotEqual<ClientInvitation, ServerInvitation>>
type _InvitationSentAtClientString = Expect<Equal<ClientInvitation['sentAt'], string>>
type _InvitationSentAtServerDate = Expect<Equal<ServerInvitation['sentAt'], Date>>
type _InvitationClickedAtClientString = Expect<
  Equal<ClientInvitation['clickedAt'], string | null>
>
type _InvitationClickedAtServerDate = Expect<Equal<ServerInvitation['clickedAt'], Date | null>>

type _InvitationStatusUserDiverge = Expect<
  NotEqual<ClientInvitationStatusUser, ServerInvitationStatusUser>
>
type _InvitationStatusUserRoleClientUnion = Expect<
  Equal<ClientInvitationStatusUser['role'], 'user' | 'admin'>
>
type _InvitationStatusUserRoleServerString = Expect<
  Equal<ServerInvitationStatusUser['role'], string>
>

// ===========================================================================
// SendInvitationsResult (client unifié shared) vs InvitationSendResult (serveur interne)
// ===========================================================================
// Décision wire appliquée (G7) : le contrat wire est l'UNION
// `{ sent, failed, results, message }` (controller sendInvitations,
// invitations.controller.ts:21-26, construit TOUJOURS les deux). Le client
// consomme cette forme unifiée via @timepick/shared. Le serveur garde
// `InvitationSendResult { sent, failed, results }` (retour service pré-message
// — le controller ajoute `message` pour produire le wire). Divergence
// persistante verrouillée : le type serveur interne n'a pas `message`.
type _InvitationSendResultDiverge = Expect<
  NotEqual<ClientSendInvitationsResult, ServerInvitationSendResult>
>
// Client (shared unifié) : a `message` ET `results`.
type _SendResultClientHasMessage = Expect<HasField<ClientSendInvitationsResult, 'message'>>
type _SendResultClientHasResults = Expect<HasField<ClientSendInvitationsResult, 'results'>>
// Serveur (interne, pré-controller) : a `results`, PAS `message`.
type _SendResultServerHasResults = Expect<HasField<ServerInvitationSendResult, 'results'>>
type _SendResultServerNoMessage = Expect<Not<HasField<ServerInvitationSendResult, 'message'>>>

// ===========================================================================
// Event — periodStart / periodEnd présents client, absents serveur
// ===========================================================================
// Décision de contrat wire (G7) : periodStart / periodEnd SONT dans le contrat
// wire, en `string | null`. Calculés par `MIN(s.start_time)` / `MAX(s.end_time)`
// dans la query de liste des événements (event.service.ts:57, via LEFT JOIN slots
// → NULL si l'événement n'a aucun créneau). Le type client les déclare (vrai) ;
// le type serveur les omet (mensonge type pré-existant). → Phase 1 : shared les
// inclut en `string | null`. NB : ce type fut extrait de useEvents.ts (hook truffé
// d'imports runtime) vers la feuille pure client/src/types/event.ts en préalable
// (sinon l'import cross-boundary tirerait react-query/axios).
type _EventDiverge = Expect<NotEqual<ClientEvent, ServerEvent>>
type _EventPeriodStartClientPresent = Expect<HasField<ClientEvent, 'periodStart'>>
type _EventPeriodStartServerAbsent = Expect<Not<HasField<ServerEvent, 'periodStart'>>>
type _EventPeriodEndClientPresent = Expect<HasField<ClientEvent, 'periodEnd'>>
type _EventPeriodEndServerAbsent = Expect<Not<HasField<ServerEvent, 'periodEnd'>>>

// Sentinelle runtime OBLIGATOIRE : sans aucun it(), Jest échoue
// « Your test suite must contain at least one test » même si tous les types
// ci-dessus concordent. La assertion type-level réelle est faite à la compilation.
it('parité de types vérifiée à la compilation (sentinelle Phase 0)', () => {
  expect(true).toBe(true)
})
