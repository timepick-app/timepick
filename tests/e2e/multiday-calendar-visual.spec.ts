import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { loginAsAdmin, TEST_ADMIN } from './helpers/auth'

/**
 * Régression visuelle — Créneaux multi-jours (Story 1.6, AC1-3)
 *
 * Verrouille la fidélité visuelle restée en « smoke navigateur délégué » depuis
 * les stories 1.2/1.4 : jsdom ne layoute pas FullCalendar, donc la barre continue
 * (vue Mois), le bandeau « Journée » (vue Semaine), les coins, l'empilement et le
 * wrap week-end ne se vérifient qu'en navigateur réel (Playwright/chromium).
 *
 * DÉTERMINISME (pré-requis d'un golden stable) :
 * - Dates de créneaux FIGÉES loin dans le futur (mars 2099) → aucune dépendance à
 *   « aujourd'hui » : le calendrier s'auto-positionne sur `initialDate` (= 1er
 *   créneau, cf. CalendarView), donc PAS de navigation par clics, et la cellule
 *   « aujourd'hui »/l'indicateur d'heure courante ne tombent jamais dans la vue
 *   (showToday=false → bouton « Aujourd'hui » masqué, surbrillance neutralisée).
 * - Snapshot ciblé sur le conteneur stable [data-testid="calendar-view"] : les
 *   indicateurs volatils (PollingIndicator, ConnectionStatusIndicator, horodatage
 *   de dernière mise à jour) sont HORS de ce conteneur → exclus du cliché.
 * - 13 mars 2099 = vendredi → un créneau ven.→lun. couvre Sam+Dim et FRANCHIT la
 *   bordure de rangée hebdomadaire (firstDay=lundi) → wrap week-end en vue Mois.
 *   Un 2ᵉ créneau sam.→mar. chevauche le 1er → empilement (≥ 2 barres) dans le
 *   bandeau « Journée » de la vue Semaine.
 *
 * INFRA :
 * - Seed via API admin (loginAsAdmin + jeton de test) : événement publié +
 *   créneaux multi-jours (event A) et un créneau mono-jour (event B, baseline).
 *   Nettoyage en afterAll. Skip propre si l'env auth/DB n'est pas prêt (pattern
 *   des specs existantes — voir tests/e2e/helpers/auth.ts).
 * - Baselines spécifiques plateforme : *-chromium-darwin.png, générées via
 *   `npx playwright test multiday-calendar-visual --update-snapshots` puis
 *   commitées. En CI/autre OS elles diffèrent (limite connue du projet).
 */

const SERVER_BASE = 'http://localhost:3000'

// Jeton admin idempotent (crée le test-admin si besoin puis /api/test/login).
// Le /api/test/login est le vrai garde — on tolère un échec de création (409/500).
async function fetchAdminToken(request: APIRequestContext): Promise<string> {
  await request
    .post(`${SERVER_BASE}/api/test/users`, {
      data: {
        email: TEST_ADMIN.email,
        full_name: TEST_ADMIN.fullName,
        role: TEST_ADMIN.role,
      },
    })
    .catch(() => undefined)
  const login = await request.post(`${SERVER_BASE}/api/test/login`, {
    data: { email: TEST_ADMIN.email },
  })
  if (!login.ok()) {
    throw new Error(`Test login failed: HTTP ${login.status()}`)
  }
  const { token } = (await login.json()) as { token: string }
  return token
}

async function createTestEvent(
  request: APIRequestContext,
  token: string,
  name: string,
): Promise<string> {
  const res = await request.post(`${SERVER_BASE}/api/admin/events`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name },
  })
  if (!res.ok()) {
    throw new Error(`Cannot create test event "${name}": HTTP ${res.status()}`)
  }
  const body = (await res.json()) as { data: { id: string } }
  return body.data.id
}

async function createSlot(
  request: APIRequestContext,
  token: string,
  eventId: string,
  slot: { startTime: string; endTime: string; capacity: number },
): Promise<void> {
  const res = await request.post(`${SERVER_BASE}/api/admin/events/${eventId}/slots`, {
    headers: { Authorization: `Bearer ${token}` },
    data: slot,
  })
  if (!res.ok()) {
    throw new Error(
      `Cannot create slot for event ${eventId} (${slot.startTime}→${slot.endTime}): HTTP ${res.status()}`,
    )
  }
}

async function publishEvent(
  request: APIRequestContext,
  token: string,
  eventId: string,
): Promise<void> {
  const res = await request.put(`${SERVER_BASE}/api/admin/events/${eventId}/publish`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok()) {
    throw new Error(`Cannot publish event ${eventId}: HTTP ${res.status()}`)
  }
}

async function deleteTestEvent(
  request: APIRequestContext,
  token: string,
  eventId: string,
): Promise<void> {
  await request
    .delete(`${SERVER_BASE}/api/admin/events/${eventId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    .catch(() => undefined)
}

const SELECTOR_VIEW = '[data-testid="calendar-view"]'
const SELECTOR_EVENT = '.fc-public-calendar .fc-event'
const SCREENSHOT_OPTS = { maxDiffPixelRatio: 0.02 } as const

test.describe('@slow Créneaux multi-jours — régression visuelle (Story 1.6)', () => {
  // Fuseau épinglé (aligné sur le TZ=Europe/Paris des suites Vitest). La position
  // verticale des barres en grille horaire (vue Semaine) dépend du fuseau du runner :
  // sans ce pin, les goldens chromium-darwin ne sont pas portables entre machines
  // darwin réglées sur des fuseaux différents (mismatch silencieux non capturé par
  // le suffixe de plateforme). Mois/bandeau « Journée » (positionnés par date) sont
  // insensibles ; seul le time-grid l'est. No-op de rendu si le runner est déjà à Paris.
  test.use({ timezoneId: 'Europe/Paris' })

  let token: string | null = null
  let multiEventId: string | null = null
  let monoEventId: string | null = null

  test.beforeAll(async ({ request }) => {
    token = await fetchAdminToken(request).catch(() => null)
    if (!token) return

    // Event A — deux créneaux multi-jours mars 2099 (wrap week-end + empilement).
    multiEventId = await createTestEvent(request, token, `MultiDay Visual ${Date.now()}`)
    // Ven. 13 → lun. 16 mars 2099 : couvre Sam+Dim et franchit la rangée hebdo (wrap).
    await createSlot(request, token, multiEventId, {
      startTime: '2099-03-13T09:00:00Z',
      endTime: '2099-03-16T17:00:00Z',
      capacity: 5,
    })
    // Sam. 14 → mar. 17 mars 2099 : chevauche le 1er → empilement en vue Semaine.
    await createSlot(request, token, multiEventId, {
      startTime: '2099-03-14T09:00:00Z',
      endTime: '2099-03-17T17:00:00Z',
      capacity: 5,
    })
    await publishEvent(request, token, multiEventId)

    // Event B — baseline mono-jour (garde anti-régression : la feature multi-jours
    // ne doit PAS altérer le rendu mono-jour, FR12/NFR2).
    monoEventId = await createTestEvent(request, token, `MonoDay Baseline ${Date.now()}`)
    await createSlot(request, token, monoEventId, {
      startTime: '2099-03-10T14:00:00Z',
      endTime: '2099-03-10T16:00:00Z',
      capacity: 5,
    })
    await publishEvent(request, token, monoEventId)
  })

  test.afterAll(async ({ request }) => {
    if (!token) return
    if (multiEventId) await deleteTestEvent(request, token, multiEventId)
    if (monoEventId) await deleteTestEvent(request, token, monoEventId)
  })

  test.beforeEach(async ({ page }) => {
    const authed = await loginAsAdmin(page)
    test.skip(
      !authed || !token || !multiEventId || !monoEventId,
      'Requires authenticated test environment + seeded events (see tests/e2e/helpers/auth.ts)',
    )
  })

  // Ouvre le calendrier public dans la vue voulue. À ≤ 768px le mode par défaut
  // est « liste » (useViewMode responsive) : on sélectionne donc EXPLICITEMENT la
  // vue via le ViewToggle (toujours rendu, aria-label stable même en mode compact).
  // ToggleGroup contrôlé → re-cliquer la vue déjà active est un no-op sûr. On attend
  // la géométrie montée (barres d'événements) avant tout cliché.
  async function showCalendar(page: Page, eventId: string, view: 'month' | 'week'): Promise<void> {
    await page.goto(`/events/${eventId}`)
    const label = view === 'week' ? 'Vue semaine avec grille horaire' : 'Vue calendrier mensuel'
    await page.locator(`[aria-label="${label}"]`).click()
    await page.locator(SELECTOR_VIEW).waitFor()
    if (view === 'week') {
      await page.locator('.fc-public-calendar .fc-timegrid').first().waitFor()
    }
    await page.locator(SELECTOR_EVENT).first().waitFor()
  }

  // Largeur VISIBLE (rognage inclus) de la barre multi-jours la plus large, en
  // nombre de colonnes-jour. `getBoundingClientRect()` donne la boîte de layout
  // (qui IGNORE le clipping) → on rabote le rect par chaque ancêtre dont
  // `overflow-x !== visible` pour obtenir la portion réellement AFFICHÉE. C'est la
  // seule mesure qui détecte le bug « barre rognée à 1 colonne » : le snapshot
  // pixel le tolère (barres < maxDiffPixelRatio), d'où le faux vert 1.6.
  async function maxVisibleMultidaySpanCols(page: Page): Promise<number> {
    return page.evaluate(() => {
      const bars = Array.from(
        document.querySelectorAll<HTMLElement>('.fc-public-calendar .fc-event--multiday'),
      )
      if (bars.length === 0) return 0
      const cell =
        document.querySelector('.fc-daygrid-day') ??
        document.querySelector('.fc-timegrid .fc-col-header-cell')
      const colW = cell ? cell.getBoundingClientRect().width : 0
      if (!colW) return 0
      const visibleWidth = (el: HTMLElement): number => {
        const r = el.getBoundingClientRect()
        let left = r.left
        let right = r.right
        let n = el.parentElement
        while (n) {
          if (getComputedStyle(n).overflowX !== 'visible') {
            const ar = n.getBoundingClientRect()
            left = Math.max(left, ar.left)
            right = Math.min(right, ar.right)
          }
          n = n.parentElement
        }
        return Math.max(0, right - left)
      }
      return bars.reduce((max, el) => Math.max(max, visibleWidth(el) / colW), 0)
    })
  }

  test('AC1 — barre Mois multi-jours, desktop 1280 (wrap week-end)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await showCalendar(page, multiEventId!, 'month')
    await expect(page.locator(SELECTOR_VIEW)).toHaveScreenshot(
      'multiday-month-desktop-1280.png',
      SCREENSHOT_OPTS,
    )
  })

  test('AC1 — barre Mois multi-jours, mobile 375 (wrap week-end)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await showCalendar(page, multiEventId!, 'month')
    await expect(page.locator(SELECTOR_VIEW)).toHaveScreenshot(
      'multiday-month-mobile-375.png',
      SCREENSHOT_OPTS,
    )
  })

  test('AC2 — bandeau Semaine « Journée » + empilement, mobile 375', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await showCalendar(page, multiEventId!, 'week')
    await expect(page.locator(SELECTOR_VIEW)).toHaveScreenshot(
      'multiday-week-stacking-375.png',
      SCREENSHOT_OPTS,
    )
  })

  test('AC3 — baseline mono-jour, Mois desktop 1280', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await showCalendar(page, monoEventId!, 'month')
    await expect(page.locator(SELECTOR_VIEW)).toHaveScreenshot(
      'monoday-month-desktop-1280.png',
      SCREENSHOT_OPTS,
    )
  })

  test('AC3 — baseline mono-jour, Semaine mobile 375', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await showCalendar(page, monoEventId!, 'week')
    await expect(page.locator(SELECTOR_VIEW)).toHaveScreenshot(
      'monoday-week-375.png',
      SCREENSHOT_OPTS,
    )
  })

  // Régression du bug réel signalé : la barre multi-jours côté PUBLIC était rognée
  // à sa SEULE colonne de début (overflow:hidden sur .fc-daygrid-day-events), alors
  // que le titre affichait la plage complète. Le fixture ven. 13 → lun. 16 mars
  // couvre ven+sam+dim dans la 1re rangée hebdo → doit s'étaler sur ≥ 2 colonnes.
  // ÉCHOUE avant le correctif (≈ 0,9 col), PASSE après (≈ 2,9 col).
  test('AC1bis — la barre Mois multi-jours s\'étale sur plusieurs colonnes (anti-rognage)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await showCalendar(page, multiEventId!, 'month')
    const cols = await maxVisibleMultidaySpanCols(page)
    expect(cols).toBeGreaterThan(2)
  })

  test('AC2bis — le bandeau Semaine « Journée » multi-jours s\'étale sur plusieurs colonnes (anti-rognage)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await showCalendar(page, multiEventId!, 'week')
    const cols = await maxVisibleMultidaySpanCols(page)
    expect(cols).toBeGreaterThan(2)
  })
})
