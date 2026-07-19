/**
 * Slot cancellation email E2E test via Mailpit (Plan 5b defer-A L3-data-F).
 *
 * Vérifie le flow complet : admin crée un event publié + slot, l'utilisateur
 * réserve le slot, l'admin supprime le slot en saisissant un motif. Le mail
 * d'annulation envoyé à l'utilisateur doit porter le shell standard (header
 * brand, content-wrapper, footer) ET le motif HTML escapé saisi par l'admin.
 *
 * Prérequis :
 * - Mailpit lancé : `brew services start mailpit`
 *   (ou `docker run -d --name mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit`)
 * - Serveur dev démarré (auto via Playwright webServer)
 * - ALLOW_TEST_ROUTES=true dans server/.env
 *
 * Tagged @slow — exclu du run CI par défaut (convention email-pipeline).
 */

import { test, expect, type APIRequestContext } from '@playwright/test'

const SERVER_BASE = 'http://localhost:3000'
const MAILPIT_API = 'http://localhost:8025/api/v1'

const TEST_ADMIN = {
  email: 'e2e-cancellation-admin@test.local',
  fullName: 'E2E Cancellation Admin',
  role: 'admin',
}

const TEST_USER = {
  email: 'e2e-cancellation-user@test.local',
  fullName: 'E2E Cancellation User',
  role: 'user',
}

// --- Helpers (mirrors email-pipeline.spec.ts conventions) -------------------

/**
 * Poll l'API REST Mailpit (v1) jusqu'à trouver un email correspondant aux filtres.
 * Mailpit parse le MIME côté serveur : `Subject` (encoded-words RFC 2047), `Text`
 * et `HTML` (quoted-printable + charset) arrivent déjà décodés — aucun décodage
 * manuel n'est nécessaire (l'ancien intercepteur stockait le corps multipart
 * brut, d'où les décodeurs QP/RFC 2047 supprimés depuis).
 */
async function waitForMailpitEmail(
  request: APIRequestContext,
  options: { subject?: string; recipient?: string; timeout?: number } = {},
): Promise<{ subject: string; body: string; html: string }> {
  const { subject, recipient, timeout = 15000 } = options
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    const res = await request.get(`${MAILPIT_API}/messages`)
    if (!res.ok()) throw new Error(`Mailpit API returned ${res.status()}`)
    const data = (await res.json()) as {
      messages?: Array<{ ID: string; Subject: string; To?: Array<{ Address: string }> }>
    }

    for (const summary of data.messages ?? []) {
      const subjectMatch = !subject || summary.Subject.includes(subject)
      const recipientMatch =
        !recipient || (summary.To ?? []).some((to) => to.Address.includes(recipient))
      if (!subjectMatch || !recipientMatch) continue

      const detailRes = await request.get(`${MAILPIT_API}/message/${summary.ID}`)
      if (!detailRes.ok()) throw new Error(`Mailpit API returned ${detailRes.status()}`)
      const detail = (await detailRes.json()) as { Subject: string; Text?: string; HTML?: string }
      const text = detail.Text ?? ''
      const html = detail.HTML ?? ''
      // `body` couvre les deux parties MIME (équivalent de l'ancien corps brut).
      return { subject: detail.Subject, body: `${text}\n${html}`, html }
    }

    const { promise: tick, resolve: wake } = Promise.withResolvers<void>()
    setTimeout(wake, 1000)
    await tick
  }

  throw new Error(
    `Mailpit email not found within ${timeout}ms` +
      (subject ? ` (subject: "${subject}")` : '') +
      (recipient ? ` (recipient: "${recipient}")` : ''),
  )
}

async function clearMailpit(request: APIRequestContext): Promise<void> {
  await request.delete(`${MAILPIT_API}/messages`).catch(() => undefined)
}

async function ensureTestUser(
  request: APIRequestContext,
  user: { email: string; fullName: string; role: string },
): Promise<void> {
  const res = await request
    .post(`${SERVER_BASE}/api/test/users`, {
      data: { email: user.email, full_name: user.fullName, role: user.role },
    })
    .catch(() => null)
  if (res && !res.ok() && res.status() !== 409) {
    console.error(`ensureTestUser(${user.email}) unexpected status: ${res.status()}`)
  }
}

async function fetchToken(
  request: APIRequestContext,
  email: string,
): Promise<{ token: string; userId: string }> {
  const login = await request.post(`${SERVER_BASE}/api/test/login`, { data: { email } })
  if (!login.ok()) throw new Error(`Test login failed: HTTP ${login.status()}`)
  const { token, user } = (await login.json()) as { token: string; user: { id: string } }
  return { token, userId: user.id }
}

async function createPublishedEvent(
  request: APIRequestContext,
  token: string,
  name: string,
): Promise<string> {
  const create = await request.post(`${SERVER_BASE}/api/admin/events`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name },
  })
  if (!create.ok()) throw new Error(`Create event failed: HTTP ${create.status()}`)
  const body = (await create.json()) as { data: { id: string } }
  const eventId = body.data.id

  const publish = await request.put(`${SERVER_BASE}/api/admin/events/${eventId}/publish`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!publish.ok()) throw new Error(`Publish event failed: HTTP ${publish.status()}`)

  return eventId
}

// --- Tests ------------------------------------------------------------------

test.describe.configure({ mode: 'serial' })

test.describe('Slot cancellation email pipeline via Mailpit @slow', () => {
  let adminToken: string
  let userToken: string
  let userId: string

  test.beforeAll(async ({ request }) => {
    await ensureTestUser(request, TEST_ADMIN)
    await ensureTestUser(request, TEST_USER)

    const adminAuth = await fetchToken(request, TEST_ADMIN.email)
    adminToken = adminAuth.token

    const userAuth = await fetchToken(request, TEST_USER.email)
    userToken = userAuth.token
    userId = userAuth.userId
  })

  test.beforeEach(async ({ request }) => {
    await clearMailpit(request)
  })

  test('admin supprime un slot avec motif → mail brandé + motif escapé', async ({ request }) => {
    const eventName = `E2E Cancellation ${Date.now()}`
    const cancellationReason = 'Événement reporté <urgent>'

    const eventId = await createPublishedEvent(request, adminToken, eventName)

    // Slot futur (J+1) avec capacity 2
    const start = new Date()
    start.setDate(start.getDate() + 1)
    start.setHours(14, 0, 0, 0)
    const end = new Date(start)
    end.setHours(15, 0, 0, 0)

    const slotRes = await request.post(
      `${SERVER_BASE}/api/admin/events/${eventId}/slots`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { startTime: start.toISOString(), endTime: end.toISOString(), capacity: 2 },
      },
    )
    expect(slotRes.ok(), `create slot: ${slotRes.status()}`).toBeTruthy()
    const slot = (await slotRes.json()) as { data: { id: string } }
    const slotId = slot.data.id

    // Inviter l'user à l'event
    const addRes = await request.post(
      `${SERVER_BASE}/api/admin/events/${eventId}/users/${userId}`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    )
    expect(addRes.ok(), `add user: ${addRes.status()}`).toBeTruthy()

    // L'user réserve le slot
    const bookRes = await request.post(`${SERVER_BASE}/api/slots/book`, {
      headers: { Authorization: `Bearer ${userToken}` },
      data: { slotId },
    })
    expect(bookRes.ok(), `book slot: ${bookRes.status()}`).toBeTruthy()

    // Clear mailpit pour ne capter que le mail d'annulation
    await clearMailpit(request)

    // L'admin supprime le slot avec un motif
    const deleteRes = await request.delete(`${SERVER_BASE}/api/admin/slots/${slotId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { cancellationReason },
    })
    expect(deleteRes.ok(), `delete slot: ${deleteRes.status()}`).toBeTruthy()

    // Récupérer le mail
    const email = await waitForMailpitEmail(request, {
      recipient: TEST_USER.email,
      subject: 'Créneau annulé',
      timeout: 20000,
    })

    // Subject
    expect(email.subject).toContain(eventName)

    // Shell standard présent (header TimePick + fond mj-body #fafafa, repeint par
    // la migration 038_repaint_mjbody_fafafa — l'assertion historique #f9f9f9 datait d'avant)
    expect(email.html).toContain('TimePick')
    expect(email.html.toLowerCase()).toContain('#fafafa')

    // Motif présent et HTML-escapé (< et > échappés en entités)
    expect(email.html).toContain('Motif')
    expect(email.html).toContain('Événement reporté')
    expect(email.html).toContain('&lt;urgent&gt;')
    expect(email.html).not.toContain('<urgent>')

    // Cleanup
    await request.delete(`${SERVER_BASE}/api/admin/events/${eventId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    }).catch(() => undefined)
  })

  test('admin supprime un slot sans motif → mail brandé sans bloc motif', async ({ request }) => {
    const eventName = `E2E Cancellation NoReason ${Date.now()}`
    const eventId = await createPublishedEvent(request, adminToken, eventName)

    const start = new Date()
    start.setDate(start.getDate() + 1)
    start.setHours(16, 0, 0, 0)
    const end = new Date(start)
    end.setHours(17, 0, 0, 0)

    const slotRes = await request.post(
      `${SERVER_BASE}/api/admin/events/${eventId}/slots`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { startTime: start.toISOString(), endTime: end.toISOString(), capacity: 2 },
      },
    )
    expect(slotRes.ok()).toBeTruthy()
    const slot = (await slotRes.json()) as { data: { id: string } }

    await request.post(
      `${SERVER_BASE}/api/admin/events/${eventId}/users/${userId}`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    )

    await request.post(`${SERVER_BASE}/api/slots/book`, {
      headers: { Authorization: `Bearer ${userToken}` },
      data: { slotId: slot.data.id },
    })

    await clearMailpit(request)

    const deleteRes = await request.delete(
      `${SERVER_BASE}/api/admin/slots/${slot.data.id}`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    )
    expect(deleteRes.ok()).toBeTruthy()

    const email = await waitForMailpitEmail(request, {
      recipient: TEST_USER.email,
      subject: 'Créneau annulé',
      timeout: 20000,
    })

    // Shell standard toujours présent
    expect(email.html).toContain('TimePick')
    expect(email.html.toLowerCase()).toContain('#fafafa')

    // Pas de bloc motif visible
    expect(email.html).not.toContain('Motif :')

    // Cleanup
    await request.delete(`${SERVER_BASE}/api/admin/events/${eventId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    }).catch(() => undefined)
  })
})
