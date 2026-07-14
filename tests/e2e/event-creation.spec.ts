import { test, expect } from '@playwright/test'
import { loginAsAdmin, skipIfNotAdmin } from './helpers/auth'

/**
 * E2E Tests: Event Creation — Sheet Flow
 *
 * FLUX DOCUMENTÉ :
 * 1. Sur /admin/events, clic « Nouvel événement » → ouvre une Sheet (shadcn / Radix Dialog).
 * 2. L'utilisateur remplit le nom (requis) ; description et date d'ouverture sont optionnels.
 * 3. Clic « Créer » → POST /api/admin/events (nom réel) → navigate /admin/events/:id/edit
 *    + toast.success('Événement créé — ajoutez vos créneaux et invités').
 * 4. Clic « Annuler » → ferme la Sheet sans dialog de confirmation, aucun draft créé,
 *    l'URL reste /admin/events.
 *
 * NOTE : Aucun draft n'est créé au montage. Aucun onglet ne se déverrouille. Ce flux
 * remplace entièrement l'ancienne route /admin/events/new.
 *
 * Sélecteurs clés :
 * - Champ Nom          : input#event-name
 * - Éditeur Description: [role="textbox"][aria-multiline="true"]  (Tiptap contenteditable)
 * - Toggle planification: #isScheduled
 * - Picker date/heure  : [data-testid="opensAt-input"]  (bouton popover, pas un input natif)
 * - Boutons Sheet      : [role="dialog"] button:has-text("Créer" | "Annuler")
 *
 * ⚠️ PRÉ-REQUIS :
 * ===============
 * 1. Serveur sur localhost:3000 avec ALLOW_TEST_ROUTES=true
 * 2. Client sur localhost:5173
 * 3. Base de test avec utilisateur admin configuré
 *
 * Lancer : npm run test:e2e
 */
test.describe('Event Creation — Sheet Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Authenticate once per test; individual tests skip if auth is unavailable
    await loginAsAdmin(page)
  })

  // ── SMOKE ────────────────────────────────────────────────────────────────────

  test('SMOKE: /admin/events se charge et affiche le bouton « Nouvel événement »', async ({ page }) => {
    await page.goto('/admin/events')
    const url = page.url()
    if (url.includes('/login') || url.includes('/auth')) {
      test.skip(true, 'Requires authenticated test environment')
    }
    // La présence du bouton suffit à garantir que la page est chargée et la Sheet connectable
    await expect(page.locator('button:has-text("Nouvel événement")').first()).toBeVisible({ timeout: 10000 })
  })

  // ── OUVERTURE DE LA SHEET ────────────────────────────────────────────────────

  test.describe('Ouverture de la Sheet', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/admin/events')
    })

    test('clic « Nouvel événement » affiche la Sheet avec le titre « Nouvel événement »', async ({ page }) => {
      if (!(await skipIfNotAdmin(page, test))) return

      await page.locator('button:has-text("Nouvel événement")').first().click()

      // SheetTitle est dans le role="dialog" Radix ; .filter(hasText) cible le bon dialog
      await expect(
        page.locator('[role="dialog"]').filter({ hasText: 'Nouvel événement' })
      ).toBeVisible({ timeout: 10000 })
    })
  })

  // ── CHAMPS DU FORMULAIRE ─────────────────────────────────────────────────────

  test.describe('Champs du formulaire', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/admin/events')
      if (!(await skipIfNotAdmin(page, test))) return
      await page.locator('button:has-text("Nouvel événement")').first().click()
      await expect(
        page.locator('[role="dialog"]').filter({ hasText: 'Nouvel événement' })
      ).toBeVisible({ timeout: 10000 })
    })

    test('le champ Nom est visible dans la Sheet', async ({ page }) => {
      // EventForm rend <Input id="event-name">
      await expect(page.locator('input#event-name')).toBeVisible()
    })

    test('l\'éditeur Description (Tiptap) est visible dans la Sheet', async ({ page }) => {
      // Tiptap rend un contenteditable role=textbox aria-multiline=true
      await expect(page.locator('[role="textbox"][aria-multiline="true"]').first()).toBeVisible()
    })

    test('le picker Date d\'ouverture est activé après clic sur le toggle #isScheduled', async ({ page }) => {
      const toggle = page.locator('#isScheduled')
      await expect(toggle).toBeVisible()

      // Avant activation : DateTimePicker (bouton popover) est disabled
      await expect(page.locator('[data-testid="opensAt-input"]')).toBeDisabled()

      await toggle.click()

      // Après activation : le picker devient interactif
      await expect(page.locator('[data-testid="opensAt-input"]')).toBeEnabled()
    })
  })

  // ── VALIDATION ────────────────────────────────────────────────────────────────

  test.describe('Validation', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/admin/events')
      if (!(await skipIfNotAdmin(page, test))) return
      await page.locator('button:has-text("Nouvel événement")').first().click()
      await expect(
        page.locator('[role="dialog"]').filter({ hasText: 'Nouvel événement' })
      ).toBeVisible({ timeout: 10000 })
    })

    test('soumettre avec le Nom vide affiche une erreur de validation et ne navigue pas', async ({ page }) => {
      // Le bouton Créer est uniquement disabled pendant isCreating (pas à vide) ;
      // EventForm.submit() valide et affiche role="alert" si le nom est vide.
      const createButton = page.locator('[role="dialog"] button:has-text("Créer")').first()
      await expect(createButton).toBeVisible()
      await createButton.click()

      // L'alerte de validation s'affiche dans la Sheet
      await expect(page.locator('[role="dialog"] [role="alert"]')).toBeVisible({ timeout: 5000 })

      // Aucune navigation : la Sheet reste ouverte sur /admin/events
      await expect(page).toHaveURL(/\/admin\/events\/?$/)
    })
  })

  // ── HAPPY PATH — NOM SEUL ────────────────────────────────────────────────────

  test.describe('Happy Path — nom seul', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/admin/events')
      if (!(await skipIfNotAdmin(page, test))) return
      await page.locator('button:has-text("Nouvel événement")').first().click()
      await expect(
        page.locator('[role="dialog"]').filter({ hasText: 'Nouvel événement' })
      ).toBeVisible({ timeout: 10000 })
    })

    test('remplir le Nom seul et cliquer « Créer » navigue vers /admin/events/:id/edit', async ({ page }) => {
      // Nom unique : Date.now() + random guard contre les conflits 409 entre runs
      await page.locator('input#event-name').fill(
        `E2E Test Event ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      )

      await page.locator('[role="dialog"] button:has-text("Créer")').first().click()

      await expect(page).toHaveURL(/\/admin\/events\/[^/]+\/edit/, { timeout: 10000 })
    })
  })

  // ── HAPPY PATH — TOUS LES CHAMPS ─────────────────────────────────────────────

  test.describe('Happy Path — tous les champs', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/admin/events')
      if (!(await skipIfNotAdmin(page, test))) return
      await page.locator('button:has-text("Nouvel événement")').first().click()
      await expect(
        page.locator('[role="dialog"]').filter({ hasText: 'Nouvel événement' })
      ).toBeVisible({ timeout: 10000 })
    })

    test('remplir tous les champs et cliquer « Créer » navigue vers /admin/events/:id/edit', async ({ page }) => {
      // Nom unique
      await page.locator('input#event-name').fill(
        `E2E Complete Event ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      )

      // Description — éditeur Tiptap (contenteditable), .fill() fonctionne sur contenteditable
      const descriptionEditor = page.locator('[role="textbox"][aria-multiline="true"]').first()
      await descriptionEditor.click()
      await descriptionEditor.fill('Description complète pour le test E2E')

      // Activer le toggle Date d'ouverture : handleScheduledToggle fixe opensAt à
      // getCurrentDateTimeLocal() automatiquement — pas besoin d'interagir avec le picker.
      const toggle = page.locator('#isScheduled')
      if (!(await toggle.isChecked())) {
        await toggle.click()
      }
      await expect(page.locator('[data-testid="opensAt-input"]')).toBeEnabled()

      await page.locator('[role="dialog"] button:has-text("Créer")').first().click()

      await expect(page).toHaveURL(/\/admin\/events\/[^/]+\/edit/, { timeout: 10000 })
    })
  })

  // ── ANNULER ───────────────────────────────────────────────────────────────────

  test.describe('Annuler', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/admin/events')
      if (!(await skipIfNotAdmin(page, test))) return
      await page.locator('button:has-text("Nouvel événement")').first().click()
      await expect(
        page.locator('[role="dialog"]').filter({ hasText: 'Nouvel événement' })
      ).toBeVisible({ timeout: 10000 })
    })

    test('cliquer « Annuler » ferme la Sheet sans dialog de confirmation et l\'URL reste /admin/events', async ({ page }) => {
      await page.locator('[role="dialog"] button:has-text("Annuler")').first().click()

      // La Sheet se ferme directement — onOpenChange(false), aucun dialog de confirmation,
      // aucun draft à nettoyer
      await expect(
        page.locator('[role="dialog"]').filter({ hasText: 'Nouvel événement' })
      ).not.toBeVisible({ timeout: 5000 })

      // L'URL reste sur la liste des événements (tolère trailing slash / query params)
      await expect(page).toHaveURL(/\/admin\/events\/?(\?.*)?$/)
    })
  })
})
