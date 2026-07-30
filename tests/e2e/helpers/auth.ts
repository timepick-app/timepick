import { Page } from '@playwright/test'

/**
 * Test user credentials for E2E tests
 *
 * PREREQUISITES:
 * 1. Set ALLOW_TEST_ROUTES=true in server .env
 * 2. Restart the server
 * 3. The test admin will be auto-created on first test run
 */
export const TEST_ADMIN = {
  email: 'e2e-test-admin@test.local',
  fullName: 'E2E Test Admin',
  role: 'admin',
}

/**
 * Authenticate as admin using the test login endpoint
 *
 * This function:
 * 1. Creates the test admin if not exists
 * 2. Gets a valid JWT token from the server
 * 3. Sets localStorage for the client app
 *
 * Requires: ALLOW_TEST_ROUTES=true in server environment
 */
export async function loginAsAdmin(page: Page): Promise<boolean> {
  // Step 1: Create test admin via API (idempotent)
  const createResponse = await page.request.post('http://localhost:3000/api/test/users', {
    data: {
      email: TEST_ADMIN.email,
      full_name: TEST_ADMIN.fullName,
      role: TEST_ADMIN.role,
    },
  })

  // 409 Conflict = user already exists, that's fine
  if (!createResponse.ok() && createResponse.status() !== 409) {
    console.log('Warning: Could not create test admin:', createResponse.status())
    // Continue anyway - user might exist
  }

  // Step 2: Get valid JWT token
  const loginResponse = await page.request.post('http://localhost:3000/api/test/login', {
    data: { email: TEST_ADMIN.email },
  })

  if (!loginResponse.ok()) {
    console.log('Test login failed:', loginResponse.status())
    return false
  }

  const { token, user } = await loginResponse.json()

  // Step 3: Navigate to app and set localStorage
  await page.goto('/')

  await page.evaluate(
    ({ user, token }) => {
      localStorage.setItem('auth_user', JSON.stringify(user))
      localStorage.setItem('auth_token', token)
      localStorage.setItem('session_expires_at', String(Date.now() + 7200000))
      // Required by `useSessionTimeout` on AdminLayout-rendered routes —
      // without these keys the hook returns timeRemaining=0 and the
      // `SessionExpiredModal` mounts, blocking pointer events.
      const now = Math.floor(Date.now() / 1000)
      const ttl = 7200 // 2 h, matches /api/test/login JWT exp
      localStorage.setItem('loginTime', String(now))
      localStorage.setItem('sessionTTL', String(ttl))
    },
    { user, token }
  )

  return true
}

/**
 * Check if we're on the login page (auth failed)
 */
export async function isOnLoginPage(page: Page): Promise<boolean> {
  const url = page.url()
  return url.includes('/login') || url.includes('/auth')
}

/**
 * Ensure we're authenticated, skip test if not
 * Use this in test beforeEach to skip tests that need auth
 */
export async function ensureAuthenticated(page: Page): Promise<boolean> {
  await loginAsAdmin(page)

  // Wait a moment for redirect to happen if auth fails
  await page.waitForTimeout(500)

  // Check if we got redirected to login
  const onLogin = await isOnLoginPage(page)
  return !onLogin
}

/**
 * Clear all authentication data
 */
export async function logout(page: Page) {
  await page.evaluate(() => {
    localStorage.removeItem('auth_user')
    localStorage.removeItem('auth_token')
    localStorage.removeItem('session_expires_at')
  })
}

/**
 * Check if user is authenticated (client-side check)
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    return !!localStorage.getItem('auth_token')
  })
}

/**
 * Skip test if not on admin pages (redirected to login)
 * Returns true if test should proceed, false if skipped
 */
export async function skipIfNotAdmin(page: Page, test: typeof import('@playwright/test').test): Promise<boolean> {
  const url = page.url()
  if (url.includes('/login') || url.includes('/auth')) {
    test.skip(true, 'Requires authenticated test environment - see tests/e2e/helpers/auth.ts')
    return false
  }
  return true
}
