import { describe, it, expect, jest, beforeEach } from '@jest/globals'

/**
 * Story 1.5 — Assertions CALLER : les callers pré-formatent `slotDate`/`slotTime`
 * via le helper serveur avant d'appeler le service e-mail. On vérifie que la
 * plage multi-jours remonte bien dans `slotDate` (FR11) et que le mono-jour
 * reste strictement inchangé (FR12), sur les deux familles de callers :
 *  - confirmation de réservation (`reservationService.sendConfirmationEmailAsync`)
 *  - annulation admin d'un créneau (`slotService.cancelSlot`, chemin d'envoi
 *    d'origine qui notifie tous les inscrits — AC3 / UX-DR3).
 *
 * Email TOUJOURS mocké (aucun envoi Mailpit) et DB mockée → test pur, non flaky.
 */
type QueryResult = { rows: Record<string, unknown>[]; rowCount?: number }
const mockQuery = jest.fn() as jest.MockedFunction<(query: string, params?: unknown[]) => Promise<QueryResult>>
const mockSendReservationEmail = jest.fn() as jest.MockedFunction<(data: { slotDate: string; slotTime: string }) => Promise<boolean>>
const mockSendSlotCancellationEmail = jest.fn() as jest.MockedFunction<(data: { slotDate: string; slotTime: string }) => Promise<boolean>>

jest.mock('../../db', () => ({
  query: mockQuery,
  getClient: jest.fn(),
  // withTransaction exécute le callback avec un client dont .query est mockQuery
  // (pas de BEGIN/COMMIT réel) → l'ordre des mockResolvedValueOnce pilote le flux
  // de cancelSlot : verrou FOR UPDATE → SELECT inscrits → UPDATE soft-delete.
  withTransaction: jest.fn((callback: (client: { query: typeof mockQuery }) => unknown) =>
    callback({ query: mockQuery })
  ),
}))

jest.mock('../../services/email.service', () => ({
  sendReservationEmail: mockSendReservationEmail,
  sendSlotCancellationEmail: mockSendSlotCancellationEmail,
}))

// Importer après les mocks
import { reservationService } from '../../services/reservation.service'
import { slotService } from '../../services/slot.service'

const booking = { id: 'booking-1', slotId: 'slot-1', userId: 'user-1', createdAt: '2026-06-01T00:00:00Z' }

/** Compose un `slot` minimal (forme `Record<string, unknown>` attendue par le caller). */
function slotFixture(startISO: string, endISO: string) {
  return { id: 'slot-1', event_id: 'event-1', start_time: startISO, end_time: endISO }
}

describe('reservationService.sendConfirmationEmailAsync — pré-format e-mail', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockQuery.mockResolvedValue({
      rows: [{ first_name: 'Jean Dupont', email: 'jean@example.com', event_name: 'Atelier' }],
    })
    mockSendReservationEmail.mockResolvedValue(true)
  })

  it('multi-jours : slotDate contient la plage « du … au … » (FR11)', async () => {
    // Composantes locales → indépendant de la TZ du runner.
    const start = new Date(2026, 5, 11, 9, 0)
    const end = new Date(2026, 5, 13, 17, 0)
    await reservationService.sendConfirmationEmailAsync(
      booking.id,
      slotFixture(start.toISOString(), end.toISOString()),
      booking.userId
    )

    expect(mockSendReservationEmail).toHaveBeenCalledTimes(1)
    const arg = mockSendReservationEmail.mock.calls[0][0]
    expect(arg.slotDate).toBe('du 11/06/2026 au 13/06/2026')
    expect(arg.slotTime).toBe('09h00 → 17h00')
  })

  it('mono-jour : slotDate `dd/MM/yyyy` strictement inchangé (FR12)', async () => {
    const start = new Date(2026, 5, 11, 9, 0)
    const end = new Date(2026, 5, 11, 17, 0)
    await reservationService.sendConfirmationEmailAsync(
      booking.id,
      slotFixture(start.toISOString(), end.toISOString()),
      booking.userId
    )

    expect(mockSendReservationEmail).toHaveBeenCalledTimes(1)
    const arg = mockSendReservationEmail.mock.calls[0][0]
    expect(arg.slotDate).toBe('11/06/2026')
    expect(arg.slotTime).toBe('09h00 → 17h00')
  })
})

describe('slotService.cancelSlot — pré-format e-mail d’annulation admin (AC3)', () => {
  // `start_time`/`end_time` sont des `Date` (pg timestamptz → Date), conformes
  // à la signature du helper et au cast `user.start_time as Date` du service.
  function arrangeCancelSlot(start: Date, end: Date) {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'slot-1' }] }) // verrou FOR UPDATE (row active)
      .mockResolvedValueOnce({
        rows: [
          {
            booking_id: 'booking-1',
            email: 'paul@example.com',
            first_name: 'Paul Martin',
            event_name: 'Atelier',
            event_id: 'evt-uuid-123',
            start_time: start,
            end_time: end,
          },
        ],
      }) // SELECT des inscrits (≥1 → soft-delete)
      .mockResolvedValueOnce({ rows: [] }) // UPDATE slots SET cancelled_at
      .mockResolvedValueOnce({ rows: [] }) // UPDATE bookings SET cancellation_notified_at
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockSendSlotCancellationEmail.mockResolvedValue(true)
  })

  it('multi-jours : slotDate = plage « du … au … » pour l’inscrit notifié (FR11/AC3)', async () => {
    const start = new Date(2026, 5, 11, 9, 0)
    const end = new Date(2026, 5, 13, 17, 0)
    arrangeCancelSlot(start, end)

    await slotService.cancelSlot('slot-1', 'Salle indisponible')

    expect(mockSendSlotCancellationEmail).toHaveBeenCalledTimes(1)
    const arg = mockSendSlotCancellationEmail.mock.calls[0][0]
    expect(arg.slotDate).toBe('du 11/06/2026 au 13/06/2026')
    expect(arg.slotTime).toBe('09h00 → 17h00')
  })

  it('mono-jour : slotDate `dd/MM/yyyy` strictement inchangé (FR12)', async () => {
    const start = new Date(2026, 5, 11, 9, 0)
    const end = new Date(2026, 5, 11, 17, 0)
    arrangeCancelSlot(start, end)

    await slotService.cancelSlot('slot-1')

    expect(mockSendSlotCancellationEmail).toHaveBeenCalledTimes(1)
    const arg = mockSendSlotCancellationEmail.mock.calls[0][0]
    expect(arg.slotDate).toBe('11/06/2026')
    expect(arg.slotTime).toBe('09h00 → 17h00')
  })
})
