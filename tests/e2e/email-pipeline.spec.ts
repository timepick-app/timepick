/**
 * Email pipeline E2E tests via Mailpit (Story 25-4 / E4.S4, AC3).
 *
 * Exercises the 3 mandatory email flows through the real SMTP transport
 * (Mailpit at 127.0.0.1:1025) and verifies email content via the Mailpit
 * REST API (http://localhost:8025/api/v2/messages).
 *
 * Prerequisites:
 * - Mailpit running: `docker run -d --name mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit`
 * - Server + client dev servers running (or let Playwright webServer start them)
 * - ALLOW_TEST_ROUTES=true in server .env
 *
 * Tagged @slow to exclude from default CI run (matches email-editor-overlay
 * convention).
 */

import { test, expect, type APIRequestContext } from '@playwright/test'

const SERVER_BASE = 'http://localhost:3000'
const MAILPIT_API = 'http://localhost:8025/api/v2'

const TEST_ADMIN = {
  email: 'e2e-test-admin@test.local',
  fullName: 'E2E Test Admin',
  role: 'admin',
}

const TEST_USER = {
  email: 'e2e-email-user@test.local',
  fullName: 'E2E Email User',
  role: 'user',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Decode quoted-printable encoding (MIME). Covers full French diacritics. */
function decodeQP(str: string): string {
  const QP_MAP: Record<string, string> = {
    '=C3=A0': 'à', '=C3=A2': 'â', '=C3=A4': 'ä',
    '=C3=A9': 'é', '=C3=A8': 'è', '=C3=AA': 'ê', '=C3=AB': 'ë',
    '=C3=AF': 'ï', '=C3=AE': 'î',
    '=C3=B4': 'ô',
    '=C3=B9': 'ù', '=C3=BB': 'û', '=C3=BC': 'ü', '=C3=BF': 'ÿ',
    '=C3=A7': 'ç',
    '=C5=93': 'œ', '=C3=A6': 'æ',
    '=C3=80': 'À', '=C3=82': 'Â', '=C3=84': 'Ä',
    '=C3=89': 'É', '=C3=88': 'È', '=C3=8A': 'Ê', '=C3=8B': 'Ë',
    '=C3=8F': 'Ï', '=C3=8E': 'Î',
    '=C3=94': 'Ô',
    '=C3=99': 'Ù', '=C3=9B': 'Û', '=C3=9C': 'Ü', '=C5=B8': 'Ÿ',
    '=C3=87': 'Ç',
    '=C5=92': 'Œ', '=C3=86': 'Æ',
  }
  let result = str.replace(/=3D/gi, '=')
  for (const [qp, char] of Object.entries(QP_MAP)) {
    result = result.replace(new RegExp(qp, 'g'), char)
  }
  return result.replace(/=\r?\n/g, '').replace(/=20/g, ' ')
}

/** Poll Mailpit REST API until an email matching the subject is found. */
async function waitForMailpitEmail(
  request: APIRequestContext,
  options: {
    subject?: string
    recipient?: string
    timeout?: number
  } = {},
): Promise<{ subject: string; body: string; html: string }> {
  const { subject, recipient, timeout = 15000 } = options
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    const res = await request.get(`${MAILPIT_API}/messages`)
    if (!res.ok()) {
      throw new Error(`Mailpit API returned ${res.status()}`)
    }
    const data = await res.json()
    const items: Array<{
      Content?: { Headers?: { Subject?: string[] }; Body?: string }
      Raw?: { From?: string; To?: string[] }
    }> = data.items ?? []

    for (const item of items) {
      const mailSubject = item.Content?.Headers?.Subject?.[0] ?? ''
      const recipients = item.Raw?.To ?? []
      const rawBody = item.Content?.Body ?? ''
      const body = decodeQP(rawBody)
      const htmlMatch = body.match(/<html[\s\S]*<\/html>/i)
      const html = htmlMatch ? htmlMatch[0] : body

      const subjectMatch = !subject || mailSubject.includes(subject)
      const recipientMatch = !recipient || recipients.some((r) => r.includes(recipient))

      if (subjectMatch && recipientMatch) {
        return { subject: mailSubject, body, html }
      }
    }

    await new Promise((r) => setTimeout(r, 1000))
  }

  throw new Error(
    `Mailpit email not found within ${timeout}ms` +
      (subject ? ` (subject: "${subject}")` : '') +
      (recipient ? ` (recipient: "${recipient}")` : ''),
  )
}

/** Clear all messages in Mailpit before each test. */
async function clearMailpit(request: APIRequestContext): Promise<void> {
  await request.delete(`${MAILPIT_API}/messages`).catch(() => undefined)
}

/** Create a test user via /api/test/users (idempotent). */
async function ensureTestUser(
  request: APIRequestContext,
  user: { email: string; fullName: string; role: string },
): Promise<void> {
  const res = await request
    .post(`${SERVER_BASE}/api/test/users`, {
      data: { email: user.email, full_name: user.fullName, role: user.role },
    })
    .catch(() => null)
  // 409 = already exists (idempotent success), null = connection refused
  if (res && !res.ok() && res.status() !== 409) {
    console.error(`ensureTestUser(${user.email}) unexpected status: ${res.status()}`)
  }
}

/** Get admin JWT token for authenticated API calls. */
async function fetchAdminToken(request: APIRequestContext): Promise<string> {
  await ensureTestUser(request, TEST_ADMIN)
  const login = await request.post(`${SERVER_BASE}/api/test/login`, {
    data: { email: TEST_ADMIN.email },
  })
  if (!login.ok()) throw new Error(`Test login failed: HTTP ${login.status()}`)
  const { token } = (await login.json()) as { token: string }
  return token
}

/** Create a published event and return its ID. */
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

  // Publish the event
  const publish = await request.put(`${SERVER_BASE}/api/admin/events/${eventId}/publish`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!publish.ok()) throw new Error(`Publish event failed: HTTP ${publish.status()}`)

  return eventId
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe.configure({ mode: 'serial' })

test.describe('Email pipeline via Mailpit @slow', () => {
  let token: string
  let testUserId: string

  test.beforeAll(async ({ request }) => {
    // Ensure users exist before any test runs
    await ensureTestUser(request, TEST_ADMIN)
    await ensureTestUser(request, TEST_USER)
    token = await fetchAdminToken(request)

    // Get test user's UUID via test login (returns user.id)
    const userLogin = await request.post(`${SERVER_BASE}/api/test/login`, {
      data: { email: TEST_USER.email },
    })
    if (!userLogin.ok()) {
      throw new Error(`Test user login failed: HTTP ${userLogin.status()}`)
    }
    const { user } = (await userLogin.json()) as { user: { id: string } }
    testUserId = user.id
  })

  test.beforeEach(async ({ request }) => {
    await clearMailpit(request)
  })

  // -----------------------------------------------------------------------
  // Flow 1: Admin magic link
  // -----------------------------------------------------------------------
  test('Flow 1: admin magic link email', async ({ request }) => {
    const res = await request.post(`${SERVER_BASE}/api/auth/login`, {
      data: { email: TEST_ADMIN.email },
    })
    expect(res.ok(), `auth/login should succeed: ${res.status()}`).toBeTruthy()

    const email = await waitForMailpitEmail(request, {
      recipient: TEST_ADMIN.email,
      timeout: 20000,
    })

    // Subject should mention admin/connexion
    expect(email.subject.toLowerCase()).toMatch(/administration|connexion/)

    // HTML body should be non-empty
    expect(email.html.length).toBeGreaterThan(0)

    // Body should contain the magic link URL
    expect(email.body).toContain('/login?token=')
  })

  // -----------------------------------------------------------------------
  // Flow 2: User magic link
  // -----------------------------------------------------------------------
  test('Flow 2: user magic link email', async ({ request }) => {
    const res = await request.post(`${SERVER_BASE}/api/auth/login`, {
      data: { email: TEST_USER.email },
    })
    expect(res.ok(), `auth/login should succeed: ${res.status()}`).toBeTruthy()

    const email = await waitForMailpitEmail(request, {
      recipient: TEST_USER.email,
      timeout: 20000,
    })

    // Subject should mention connexion
    expect(email.subject.toLowerCase()).toMatch(/connexion/)

    // HTML body should be non-empty
    expect(email.html.length).toBeGreaterThan(0)

    // Body should contain the magic link URL
    expect(email.body).toContain('/login?token=')
  })

  // -----------------------------------------------------------------------
  // Flow 3: Event invitation
  // -----------------------------------------------------------------------
  test('Flow 3: event invitation email', async ({ request }) => {
    const eventName = `E2E Invite ${Date.now()}`
    const eventId = await createPublishedEvent(request, token, eventName)

    // Create a future slot (required by invitations service)
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(14, 0, 0, 0)
    const slotEnd = new Date(tomorrow)
    slotEnd.setHours(15, 0, 0, 0)
    const slotRes = await request.post(
      `${SERVER_BASE}/api/admin/events/${eventId}/slots`,
      {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          startTime: tomorrow.toISOString(),
          endTime: slotEnd.toISOString(),
          capacity: 2,
        },
      },
    )
    expect(slotRes.ok(), `Should be able to create slot: ${slotRes.status()}`).toBeTruthy()

    // Add user to event (testUserId resolved in beforeAll via test login)
    const addRes = await request.post(
      `${SERVER_BASE}/api/admin/events/${eventId}/users/${testUserId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    expect(addRes.ok(), `Should be able to add user to event: ${addRes.status()}`).toBeTruthy()

    // Send invitations
    const sendRes = await request.post(
      `${SERVER_BASE}/api/admin/events/${eventId}/invitations/send`,
      {
        headers: { Authorization: `Bearer ${token}` },
        data: { userIds: [testUserId] },
      },
    )
    expect(sendRes.ok(), `Should be able to send invitations: ${sendRes.status()}`).toBeTruthy()

    // Wait for the invitation email
    const email = await waitForMailpitEmail(request, {
      recipient: TEST_USER.email,
      timeout: 20000,
    })

    // Subject or body should mention invitation keywords
    const content = (email.subject + ' ' + email.body).toLowerCase()
    expect(content).toMatch(/invitation|inscription|participation/)

    // HTML body should be non-empty
    expect(email.html.length).toBeGreaterThan(0)

    // Cleanup
    await request.delete(`${SERVER_BASE}/api/admin/events/${eventId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => undefined)
  })
})
