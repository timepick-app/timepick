import { test, expect } from '@playwright/test'
import { loginAsAdmin, getFirstAvailableEventId } from './helpers/auth'

/**
 * E2E Tests: Event Editing Flow
 *
 * These tests capture the CURRENT BEHAVIOR of event editing.
 * They serve as REGRESSION PROTECTION - any change that breaks these tests
 * indicates a potential regression in the event editing flow.
 *
 * FLOW DOCUMENTED:
 * 1. Navigate to /admin/events/:id/edit
 * 2. Event data loads from API
 * 3. User can modify name, description, opensAt
 * 4. Changes save automatically or on button click
 * 5. Unsaved changes trigger confirmation on navigation
 *
 * PREREQUISITES:
 * - Server running on localhost:3000
 * - Client running on localhost:5173
 * - Test database with admin user AND at least one existing event
 *
 * @see Story 18.5: Unification Création/Édition
 * @see tech-spec-draft-event-refactor.md
 */

// Test event ID — resolved at runtime to the first event returned by
// GET /api/events. Avoids hardcoding a fixture id that may not exist
// in the local dev DB (see post-e26-e2e-baseline-recovery spec).
let TEST_EVENT_ID: string

test.describe('Event Editing Flow - Current Behavior', () => {
  test.beforeAll(async () => {
    TEST_EVENT_ID = await getFirstAvailableEventId()
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test.describe('Page Load', () => {
    test('should load event edit page', async ({ page }) => {
      // Navigate to edit page (requires existing event)
      await page.goto(`/admin/events/${TEST_EVENT_ID}/edit`)

      // Wait for event data to load — banner OR page text indicating edit mode.
      // Playwright doesn't accept mixed CSS + text=/.../ in a single selector string,
      // use .or() to combine independent locators.
      await expect(
        page
          .locator('[data-testid="event-edit-header"]')
          .or(page.locator('text=/Modifier|Événement/'))
          .first()
      ).toBeVisible({ timeout: 10000 })
    })

    test('should show event name in header or title', async ({ page }) => {
      await page.goto(`/admin/events/${TEST_EVENT_ID}/edit`)

      // Page should display event-related content
      await expect(page.locator('body')).toContainText(/événement|event/i)
    })

    test('should show all tabs in edit mode', async ({ page }) => {
      await page.goto(`/admin/events/${TEST_EVENT_ID}/edit`)
      await expect(page.locator('[data-testid="event-edit-header"]')).toBeVisible({ timeout: 10000 })

      // All tabs should be visible in edit mode (unlike create mode)
      await expect(page.locator('button:has-text("Détails")')).toBeVisible()
      await expect(page.locator('button:has-text("Créneaux")')).toBeVisible()
      await expect(page.locator('button:has-text("Invités")')).toBeVisible()
      await expect(page.locator('button:has-text("Template")')).toBeVisible()

      // Stats tab is available in edit mode only
      await expect(page.locator('button:has-text("Statistiques")')).toBeVisible()
    })
  })

  test.describe('Details Tab - Form Fields', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/admin/events/${TEST_EVENT_ID}/edit`)
      await expect(page.locator('[data-testid="event-edit-header"]')).toBeVisible({ timeout: 10000 })
    })

    test('should pre-populate form with existing event data', async ({ page }) => {
      const nameInput = page.locator('input[name="name"], input#name').first()
      await expect(nameInput).not.toHaveValue('')
    })

    test('should allow editing name field', async ({ page }) => {
      const nameInput = page.locator('input[name="name"], input#name').first()
      await nameInput.clear()
      await nameInput.fill('Updated Event Name (E2E)')

      // Value should be updated
      await expect(nameInput).toHaveValue('Updated Event Name (E2E)')
    })

    test('should allow editing description field', async ({ page }) => {
      // Éditeur riche (Tiptap) : contenteditable sans `value` — on vérifie le texte rendu.
      const descriptionInput = page.locator('[role="textbox"][aria-multiline="true"]').first()
      await descriptionInput.click()
      await descriptionInput.fill('Updated description for E2E testing')

      await expect(descriptionInput).toHaveText('Updated description for E2E testing')
    })
  })

  test.describe('Save Behavior', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/admin/events/${TEST_EVENT_ID}/edit`)
      await expect(page.locator('[data-testid="event-edit-header"]')).toBeVisible({ timeout: 10000 })
    })

    test('should show save button in edit mode', async ({ page }) => {
      // Edit mode has Save/Reset buttons, not Create/Cancel
      const saveButton = page.locator('button:has-text("Enregistrer"), button:has-text("Sauvegarder")')
      await expect(saveButton.first()).toBeVisible()
    })

    test('should save changes on button click', async ({ page }) => {
      const nameInput = page.locator('input[name="name"], input#name').first()
      const originalValue = await nameInput.inputValue()

      // Make a change
      await nameInput.clear()
      await nameInput.fill(`${originalValue} (Modified E2E)`)

      // Save
      const saveButton = page.locator('button:has-text("Enregistrer"), button:has-text("Sauvegarder")').first()
      await saveButton.click()

      // Look for success indicator (toast wording: "Événement mis à jour avec succès")
      await expect(page.locator('text=/mis.*jour|sauvegardé|saved|success|succès/i')).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('Unsaved Changes Protection', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/admin/events/${TEST_EVENT_ID}/edit`)
      await expect(page.locator('[data-testid="event-edit-header"]')).toBeVisible({ timeout: 10000 })
    })

    test('should track unsaved changes', async ({ page }) => {
      const nameInput = page.locator('input[name="name"], input#name').first()
      await nameInput.clear()
      await nameInput.fill('Unsaved Change Test')

      // Navigate away via the ArrowLeft back button (handleNavigateBack →
      // shows local unsaved-changes Dialog when dirty). Sidebar NavLink
      // would bypass the in-page blocker (only armed in create mode).
      await page.locator('button[aria-label="Retour à la liste des événements"]').click()

      // Should show unsaved changes dialog.
      await expect(
        page
          .locator('[role="dialog"]')
          .or(page.locator('text=/non sauvegardé|unsaved/i'))
          .first()
      ).toBeVisible({ timeout: 5000 })
    })

    test('should allow discarding unsaved changes', async ({ page }) => {
      const nameInput = page.locator('input[name="name"], input#name').first()
      await nameInput.clear()
      await nameInput.fill('Changes to Discard')

      // Navigate via the ArrowLeft back button — triggers handleNavigateBack
      // which shows the EventFormPage local Dialog when there are unsaved changes.
      await page.locator('button[aria-label="Retour à la liste des événements"]').click()

      // Confirm discard in the dialog (EventFormPage Dialog: "Quitter sans sauvegarder")
      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible({ timeout: 5000 })
      await dialog
        .locator('button:has-text("Quitter sans sauvegarder"), button:has-text("Quitter"), button:has-text("Abandonner")')
        .first()
        .click()

      // Should navigate away
      await expect(page).toHaveURL(/\/admin\/events\/?(\?.*)?$/, { timeout: 10000 })
    })
  })

  test.describe('Navigation', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/admin/events/${TEST_EVENT_ID}/edit`)
      await expect(page.locator('[data-testid="event-edit-header"]')).toBeVisible({ timeout: 10000 })
    })

    test('should navigate back to events list on cancel (no unsaved changes)', async ({ page }) => {
      // Edit mode uses the ArrowLeft back button (handleNavigateBack). Without
      // unsaved changes, it navigates directly to /admin/events.
      await page.locator('button[aria-label="Retour à la liste des événements"]').click()

      await expect(page).toHaveURL(/\/admin\/events\/?(\?.*)?$/, { timeout: 10000 })
    })

    test('should switch between tabs', async ({ page }) => {
      // Click on Slots tab
      await page.locator('button:has-text("Créneaux")').click()
      await expect(page).toHaveURL(/#slots/)

      // Click on Users tab (current label: "Invités")
      await page.locator('button:has-text("Invités")').click()
      await expect(page).toHaveURL(/#users/)
    })
  })

  test.describe('Publish/Unpublish (if event is draft or published)', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/admin/events/${TEST_EVENT_ID}/edit`)
      await expect(page.locator('[data-testid="event-edit-header"]')).toBeVisible({ timeout: 10000 })
    })

    test('should show publish banner with status', async ({ page }) => {
      const banner = page.locator('[data-testid="event-edit-header"]')
      await expect(banner).toBeVisible()

      // Banner should indicate current status (draft/published)
      await expect(banner.locator('text=/brouillon|draft|publié|published/i')).toBeVisible()
    })
  })

  test.describe('Error Handling', () => {
    test('should show error for non-existent event', async ({ page }) => {
      const nonExistentId = 'non-existent-event-12345'
      await page.goto(`/admin/events/${nonExistentId}/edit`)

      // Current behavior: toast "Événement non trouvé ou accès refusé" + redirect to /admin/events.
      // Either the toast OR the redirect is sufficient evidence of error handling — assert redirect
      // because the toast is transient and may dismiss before the assertion runs.
      await expect(page).toHaveURL(/\/admin\/events\/?(\?.*)?$/, { timeout: 10000 })
    })
  })
})

/**
 * SMOKE TEST: Quick validation that edit page loads
 */
test('SMOKE: Event edit page loads', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto(`/admin/events/${TEST_EVENT_ID}/edit`)

  // If this fails, check:
  // 1. Server is running
  // 2. Client is running
  // 3. Test event exists in database
  await expect(page.locator('body')).toBeVisible()
})
