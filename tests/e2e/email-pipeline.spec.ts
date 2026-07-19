/**
 * Email pipeline E2E tests via Mailpit (Story 25-4 / E4.S4, AC3).
 *
 * Exercises the 3 mandatory email flows through the real SMTP transport
 * (Mailpit at 127.0.0.1:1025) and verifies email content via the Mailpit
 * REST API (http://localhost:8025/api/v1/messages).
 *
 * Prerequisites:
 * - Mailpit running: `brew services start mailpit`
 *   (or `docker run -d --name mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit`)
 * - Server + client dev servers running (or let Playwright webServer start them)
 * - ALLOW_TEST_ROUTES=true in server .env
 *
 * Tagged @slow to exclude from default CI run (matches email-editor-overlay
 * convention).
 */

import { test, expect, type APIRequestContext } from '@playwright/test'

const SERVER_BASE = 'http://localhost:3000'
const MAILPIT_API = 'http://localhost:8025/api/v1'

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

/** Poll the Mailpit REST API until an email matching the filters is found. */
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
    const data = (await res.json()) as {
      messages?: Array<{ ID: string; Subject: string; To?: Array<{ Address: string }> }>
    }

    for (const summary of data.messages ?? []) {
      // Summary fields arrive fully MIME-decoded (RFC 2047 subjects included).
      const subjectMatch = !subject || summary.Subject.includes(subject)
      const recipientMatch =
        !recipient || (summary.To ?? []).some((to) => to.Address.includes(recipient))
      if (!subjectMatch || !recipientMatch) continue

      // Fetch the parsed message: Text/HTML parts are already decoded
      // (quoted-printable + charset) by Mailpit — no manual MIME handling.
      const detailRes = await request.get(`${MAILPIT_API}/message/${summary.ID}`)
      if (!detailRes.ok()) {
        throw new Error(`Mailpit API returned ${detailRes.status()}`)
      }
      const detail = (await detailRes.json()) as { Subject: string; Text?: string; HTML?: string }
      const text = detail.Text ?? ''
      const html = detail.HTML ?? ''
      // `body` spans both MIME parts — equivalent of the raw multipart body
      // the previous implementation exposed.
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
