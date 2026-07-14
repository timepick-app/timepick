/**
 * Verrou de régression du split `full_name` → `first_name` / `last_name` (Story S2).
 *
 * Les casts `as string` historiques (`slot.service.ts`, `reservation.service.ts`)
 * masquaient une régression silencieuse : après suppression de `full_name`,
 * `user.full_name as string` valait `undefined` cast en `string`, et l'email
 * d'annulation rendait « Bonjour undefined, ». `tsc` reste muet sur ce cas.
 *
 * Ce test exerce les DEUX chemins d'annulation/désinscription sur une fixture RÉELLE
 * (membre en base avec `first_name='Jean'`, `last_name=NULL`) et vérifie que le
 * `userFirstName` transmis est bien `'Jean'` (prénom seul, décision 3) — jamais `undefined`
 * ni la chaîne `'undefined'`.
 *
 * Chemin 1 : slot.service.cancelSlot (annulation ADMIN) → sendSlotCancellationEmail
 * Chemin 2 : reservation.service.sendUnregistrationEmailAsync (désinscription MEMBRE) → sendUnregistrationEmail
 */

import { query } from '../../db'
import * as emailService from '../../services/email.service'

// Mock partiel : on capture les arguments transmis aux deux fonctions d'email
// sans toucher au reste du module email (pas de SMTP en test).
jest.mock('../../services/email.service', () => {
  const actual = jest.requireActual('../../services/email.service')
  return {
    ...actual,
    sendSlotCancellationEmail: jest.fn().mockResolvedValue(true),
    sendUnregistrationEmail: jest.fn().mockResolvedValue(true),
    sendReservationEmail: jest.fn().mockResolvedValue(true),
  }
})

// Importés APRÈS le jest.mock (hoisté) pour qu'ils lient la version mockée.
import { slotService } from '../../services/slot.service'
import { reservationService } from '../../services/reservation.service'

const mockedCancellation = emailService.sendSlotCancellationEmail as jest.MockedFunction<
  typeof emailService.sendSlotCancellationEmail
>
const mockedUnregistration = emailService.sendUnregistrationEmail as jest.MockedFunction<
  typeof emailService.sendUnregistrationEmail
>

describe('full_name split — user name fields not undefined (S2 regression lock)', () => {
  let jeanId: string
  let slotForCancel: string
  let slotForReservation: string
  let marieId: string
  let slotForCancelNamed: string
  let slotForReservationNamed: string

  beforeAll(async () => {
    const u = await query(
      `INSERT INTO users (email, first_name, last_name, role)
       VALUES ($1, 'Jean', NULL, 'user')
       ON CONFLICT (email) DO UPDATE SET first_name = 'Jean', last_name = NULL
       RETURNING id`,
      [`split-jean-${Date.now()}-${Math.random().toString(36).slice(2)}@local.dev`]
    )
    jeanId = u.rows[0].id

    const ev = await query(
      `INSERT INTO events (name, description, is_published)
       VALUES ($1, 'split fixture', true) RETURNING id`,
      [`split-event-${Date.now()}-${Math.random().toString(36).slice(2)}`]
    )
    const eventId = ev.rows[0].id

    const start = new Date(Date.now() + 3600_000)
    const end = new Date(Date.now() + 7200_000)

    const s1 = await query(
      `INSERT INTO slots (event_id, start_time, end_time, capacity)
       VALUES ($1, $2, $3, 5) RETURNING id`,
      [eventId, start, end]
    )
    slotForCancel = s1.rows[0].id
    await query(`INSERT INTO bookings (slot_id, user_id) VALUES ($1, $2)`, [slotForCancel, jeanId])

    const s2 = await query(
      `INSERT INTO slots (event_id, start_time, end_time, capacity)
       VALUES ($1, $2, $3, 5) RETURNING id`,
      [eventId, start, end]
    )
    slotForReservation = s2.rows[0].id

    // Membre AVEC nom de famille : verrouille la décision 3 (prénom SEUL, jamais
    // « Marie Curie »). Une fixture mononyme (last_name=NULL) ne distinguerait pas
    // `first_name` de `formatFullName(first, last)`.
    const marie = await query(
      `INSERT INTO users (email, first_name, last_name, role)
       VALUES ($1, 'Marie', 'Curie', 'user')
       ON CONFLICT (email) DO UPDATE SET first_name = 'Marie', last_name = 'Curie'
       RETURNING id`,
      [`split-marie-${Date.now()}-${Math.random().toString(36).slice(2)}@local.dev`]
    )
    marieId = marie.rows[0].id

    const s3 = await query(
      `INSERT INTO slots (event_id, start_time, end_time, capacity)
       VALUES ($1, $2, $3, 5) RETURNING id`,
      [eventId, start, end]
    )
    slotForCancelNamed = s3.rows[0].id
    await query(`INSERT INTO bookings (slot_id, user_id) VALUES ($1, $2)`, [slotForCancelNamed, marieId])

    const s4 = await query(
      `INSERT INTO slots (event_id, start_time, end_time, capacity)
       VALUES ($1, $2, $3, 5) RETURNING id`,
      [eventId, start, end]
    )
    slotForReservationNamed = s4.rows[0].id
  })

  beforeEach(() => {
    mockedCancellation.mockClear()
    mockedUnregistration.mockClear()
  })
  it('should not return undefined for user name fields after full_name split', async () => {
    // Chemin 1 — slot.service.cancelSlot (annulation ADMIN) → sendSlotCancellationEmail.
    await slotService.cancelSlot(slotForCancel)
    expect(mockedCancellation).toHaveBeenCalledTimes(1)
    const slotArg = mockedCancellation.mock.calls[0][0]
    expect(slotArg.userFirstName).toBe('Jean')
    expect(slotArg.userFirstName).not.toBeUndefined()
    expect(slotArg.userFirstName).not.toBe('undefined')

    mockedUnregistration.mockClear()

    // Chemin 2 — reservation.service.sendUnregistrationEmailAsync (désinscription MEMBRE).
    await reservationService.sendUnregistrationEmailAsync(slotForReservation, jeanId)
    expect(mockedUnregistration).toHaveBeenCalledTimes(1)
    const resArg = mockedUnregistration.mock.calls[0][0]
    expect(resArg.userFirstName).toBe('Jean')
    expect(resArg.userFirstName).not.toBeUndefined()
    expect(resArg.userFirstName).not.toBe('undefined')
  })

  it('annulation d\'un membre AVEC nom de famille → prénom SEUL (décision 3)', async () => {
    // Chemin 1 — slot.service.cancelSlot (annulation ADMIN) : ne doit JAMAIS rendre le nom complet.
    await slotService.cancelSlot(slotForCancelNamed)
    expect(mockedCancellation).toHaveBeenCalledTimes(1)
    expect(mockedCancellation.mock.calls[0][0].userFirstName).toBe('Marie')
    expect(mockedCancellation.mock.calls[0][0].userFirstName).not.toBe('Marie Curie')

    mockedUnregistration.mockClear()

    // Chemin 2 — reservation.service.sendUnregistrationEmailAsync (désinscription MEMBRE).
    await reservationService.sendUnregistrationEmailAsync(slotForReservationNamed, marieId)
    expect(mockedUnregistration).toHaveBeenCalledTimes(1)
    expect(mockedUnregistration.mock.calls[0][0].userFirstName).toBe('Marie')
    expect(mockedUnregistration.mock.calls[0][0].userFirstName).not.toBe('Marie Curie')
  })
})
