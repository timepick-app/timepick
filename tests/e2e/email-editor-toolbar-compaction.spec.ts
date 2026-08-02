import { test, expect, type Page } from '@playwright/test'
import { loginAsAdmin } from './helpers/auth'
import {
  createTestEvent,
  deleteTestEvent,
  fetchAdminToken,
  waitForGrapesEditorReady,
} from './helpers/email-editor'

/**
 * Garde de la barre d'outils de l'éditeur d'e-mails MJML — chantier du
 * 2026-08-01 (« dégradation au débordement »).
 *
 * LA RÈGLE QUE CE FICHIER DÉFEND, et de laquelle tout le reste découle :
 *
 *   > À toute largeur, la barre affiche LE PALIER LE PLUS LISIBLE QUI TIENT.
 *   > Ni un cran en dessous, ni un cran au-dessus.
 *
 * Elle se vérifie dans les DEUX SENS, et les deux sont nécessaires :
 *
 *  - le palier affiché **tient** (besoin ≤ largeur) — sinon la barre se rompt ;
 *  - le palier **immédiatement plus lisible ne tiendrait pas** (son besoin >
 *    largeur) — sinon on a masqué du texte pour rien, ce qui était exactement le
 *    défaut du chantier précédent : à 1 271 px la barre « Invitation »
 *    raccourcissait ses libellés avec 617 px de vide, à 1 087 px elle passait
 *    tout en icônes avec 642 px de vide.
 *
 * CE QUI REND CE TEST INDÉPENDANT DE L'IMPLÉMENTATION. Il ne lit AUCUN seuil et
 * ne fait confiance à AUCUN nombre écrit dans le code. Le besoin de chaque
 * palier est **mesuré sur le rendu** : à la largeur la plus grande où un palier
 * s'affiche, il a par construction du mou, donc aucun enfant n'est comprimé et
 * la somme de leurs largeurs + gouttières + padding EST son besoin. Ces trois
 * besoins servent ensuite d'étalon à toutes les autres largeurs. Un seuil en dur
 * réintroduit dans le composant se ferait prendre par le second sens de la
 * règle, jamais par le premier.
 *
 * DEUX AUTRES INVARIANTS, chacun contre un bug plausible et déjà survenu :
 *
 *  - **Cohérence du palier icônes** — assertion COLLECTIVE (aucun bouton de la
 *    barre n'affiche de texte), jamais bouton par bouton. C'est elle qui empêche
 *    une exception de se glisser à nouveau : « Enregistrer » gardait son mot au
 *    milieu de quatre icônes.
 *  - **Aucun nom accessible ne disparaît avec le libellé visible.** Le motif est
 *    `sr-only`, jamais `hidden` + `aria-label` (nom et description identiques =
 *    double annonce).
 *
 * Lancer : `env -u CI npx playwright test email-editor-toolbar-compaction`
 * ⚠️ Jamais `npm run test:e2e` ni `npx playwright test` sans filtre — deux specs
 * de la suite vident la boîte de réception MailPit locale. Celle-ci n'envoie
 * aucun e-mail.
 */

type Tier = 'entier' | 'court' | 'resserre' | 'icones'

/** Du plus lisible au moins lisible. L'ordre EST la règle. */
const TIER_ORDER: readonly Tier[] = ['entier', 'court', 'resserre', 'icones'] as const

/**
 * Largeurs balayées, décroissantes — l'ordre compte : le besoin d'un palier est
 * relevé à la PREMIÈRE largeur où on l'observe, donc la plus grande, celle où il
 * a le plus de mou et où rien n'est comprimé.
 *
 * Elles ne sont pas prises au hasard : les deux largeurs du défaut d'origine
 * (1 271 et 1 087) et leur pixel supérieur, la largeur des captures de référence
 * (1 280 est couverte par 1 272), les largeurs d'usage ordinaire, et 440 px —
 * un iPhone 16 Pro Max debout, la largeur que le PO a testée.
 *
 * Le pas est resserré entre 1 000 et 600 px : c'est là que vivent les frontières
 * des quatre paliers sur les six configurations, et un balayage qui saute une
 * plage n'y observe pas le palier correspondant — le test le dit alors
 * explicitement plutôt que de conclure sur un relevé incomplet.
 */
const SWEEP_WIDTHS = [
  1900, 1500, 1400, 1272, 1271, 1150, 1088, 1087, 1000, 975, 950, 925, 900, 875,
  850, 825, 800, 775, 767, 740, 720, 700, 680, 660, 640, 600, 560, 520, 480,
  460, 440,
] as const

/**
 * Le badge de verrou est en `hidden md:flex` : il n'existe pas sous 768 px de
 * fenêtre. Un balayage « badge affiché » s'arrête donc là — en dessous, la barre
 * n'est plus la même configuration et ses besoins ne sont plus les mêmes.
 */
const BADGE_SWEEP_WIDTHS = SWEEP_WIDTHS.filter((w) => w >= 768)

/**
 * Nom d'événement au maximum du formulaire (compteur « /200 »). C'est le pire cas
 * du produit, pas un cas d'école : rien ne borne ce texte en amont de la barre.
 */
const LONG_EVENT_NAME = `Grande braderie solidaire du quartier avec ateliers de réparation, buvette associative, concert de fanfare et permanence juridique gratuite pour les adhérents`.padEnd(
  200,
  ' et les autres',
)

interface ToolbarSnapshot {
  /** Palier LU SUR LE RENDU, jamais sur un attribut que le composant s'attribue. */
  tier: Tier
  /** Largeur dont la barre a besoin dans son palier courant, padding compris. */
  need: number
  /** Largeur réellement offerte à la barre. */
  available: number
  /** Nombre de lignes occupées. Tout ce qui n'est pas 1 est une rupture. */
  lines: number
  /** Le badge de verrou est-il rendu ? (`hidden md:flex` le retire sous 768 px.) */
  badge: boolean
  /** Texte VISIBLE de chaque bouton de la barre, par `data-testid`. */
  labels: Record<string, string>
  /** Le titre est-il visuellement tronqué à cette largeur ? */
  titleTruncated: boolean
  /**
   * Place réellement inoccupée dans la barre, APRÈS que le titre a pris le mou
   * du palier. C'est elle que regarde la garde du titre : `need` compte le titre
   * à son plafond de MESURE, donc `available - need` est le mou d'avant son
   * bonus, pas ce qui reste vide à l'écran.
   */
  renderedFree: number
}

/**
 * Change la largeur de la fenêtre ET attend qu'une frame complète soit passée.
 *
 * CE N'EST PAS DE LA SUPERSTITION, et ce n'est pas non plus un défaut du
 * produit. `page.setViewportSize()` rend la main dès que la commande est passée
 * au navigateur, pas quand la frame est peinte. Or le palier est posé par un
 * `ResizeObserver`, dont les rappels s'exécutent après la mise en page ET AVANT
 * la peinture : un utilisateur ne voit donc JAMAIS l'ancien palier, mais un test
 * qui lit immédiatement, lui, le voit. Deux `requestAnimationFrame` garantissent
 * qu'une frame complète (mise en page → observateur → peinture) est passée.
 *
 * Sans cette attente le balayage lit un palier de retard, de façon
 * intermittente — constaté, et ce faux négatif ressemble trait pour trait à un
 * vrai défaut de palier.
 */
async function resize(page: Page, width: number, height = 900): Promise<void> {
  await page.setViewportSize({ width, height })
  await page.evaluate(async () => {
    const nextFrame = () => {
      const { promise, resolve } = Promise.withResolvers<number>()
      requestAnimationFrame(resolve)
      return promise
    }
    await nextFrame()
    await nextFrame()
  })
}

/**
 * Tout ce qu'on peut savoir de la barre en une seule traversée, à la largeur
 * courante.
 *
 * `need` se lit sur la géométrie RENDUE : somme des largeurs des enfants qui ont
 * une boîte, plus les gouttières entre eux, plus le padding horizontal. Aucun de
 * ces termes n'est écrit en dur — la gouttière et le padding sont relus dans le
 * style calculé, parce qu'ils changent avec le palier (12 px, puis 8 px au
 * palier icônes).
 *
 * `lines` se lit sur le CENTRE VERTICAL des enfants et non sur leur `offsetTop` :
 * la barre est en `items-center`, donc tous les items d'une même ligne partagent
 * leur centre alors que leurs hauteurs diffèrent (titre 24 px, boutons 32 px,
 * badge 20 px). Les enfants sans boîte sont écartés, sinon un élément en
 * `display: none` compterait pour une ligne.
 *
 * Le palier est DÉDUIT DU RENDU : le déclencheur d'envoi de test — le seul
 * élément présent sur les trois barres — donne trois états textuellement
 * distincts (« Envoyer un test » / « Tester » / rien), et la visibilité de la
 * valeur du sélecteur sépare `court` de `resserre`. Le déduire plutôt que lire
 * `data-toolbar-tier` n'est pas un détour : un test qui lit l'attribut que le
 * composant écrit lui-même ne vérifie que sa cohérence interne, et il ne
 * pourrait pas tourner sur le code d'avant.
 *
 * Toute lecture se fait sur une FRAME STABILISÉE — voir `resize`.
 */
async function readToolbar(page: Page): Promise<ToolbarSnapshot> {
  return page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>(
      '[data-testid="mjml-editor-toolbar"]',
    )
    if (!bar) throw new Error('barre d’outils absente')

    const style = getComputedStyle(bar)
    const gap = parseFloat(style.columnGap) || 0
    const padding =
      (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)

    // Les enfants HORS FLUX sont écartés : la région live du badge est en
    // `sr-only`, donc `position: absolute`, donc PAS un item flex — elle ne
    // contribue ni à la largeur de la barre ni à ses gouttières. La compter
    // ajouterait un pixel et une gouttière fantôme à chaque mesure.
    const kids = [...bar.children].filter(
      (c) =>
        c.getClientRects().length > 0 &&
        getComputedStyle(c).position !== 'absolute' &&
        getComputedStyle(c).position !== 'fixed',
    )
    // LE TITRE EST COMPTÉ À SON PLAFOND DE MESURE, pas à sa largeur rendue.
    // Depuis qu'il absorbe le mou du palier, sa largeur rendue vaut « tout ce
    // qui restait » : la somme brute égalerait donc toujours la largeur de la
    // barre, et la règle des deux sens deviendrait vide de sens. On additionne
    // donc la partie RIGIDE (tout sauf le titre, invariante à largeur donnée) et
    // la contribution que le titre aurait sans ce bonus — son contenu naturel,
    // borné par le plafond de mesure que la barre publie. Ce plafond est une
    // ENTRÉE de la décision, pas son résultat : ce que le test vérifie, c'est
    // toujours ce qui TIENT, et il le vérifie par la mise en page.
    const titleNode = bar.querySelector('p')
    const titleBase = parseFloat(
      getComputedStyle(bar).getPropertyValue('--tp-toolbar-title-base'),
    )
    const rigid =
      kids.reduce(
        (sum, c) => sum + (c === titleNode ? 0 : c.getBoundingClientRect().width),
        0,
      ) +
      gap * Math.max(0, kids.length - 1) +
      padding
    const titleNeed = titleNode
      ? Math.min(
          titleNode.scrollWidth,
          Number.isFinite(titleBase)
            ? titleBase
            : titleNode.getBoundingClientRect().width,
        )
      : 0
    const need = rigid + titleNeed
    const renderedFree =
      bar.getBoundingClientRect().width -
      (rigid + (titleNode ? titleNode.getBoundingClientRect().width : 0))

    const lines = new Set(
      kids.map((c) => {
        const rect = c.getBoundingClientRect()
        return Math.round(rect.top + rect.height / 2)
      }),
    ).size

    /**
     * Texte réellement VISIBLE d'un contrôle. `innerText` ne convient pas : le
     * motif icône-seule garde le libellé dans le DOM et ne le masque que
     * visuellement (`sr-only`), ce qui est précisément ce qui préserve le nom
     * accessible. Seul le rendu distingue les paliers — `sr-only` réduit la
     * boîte à 1 px, un libellé affiché en fait des dizaines. Les span parents
     * sont écartés (`:not(:has(span))`) pour ne pas compter deux fois le texte
     * d'un span imbriqué dans un autre.
     */
    const visibleText = (root: Element) =>
      [...root.querySelectorAll('span')]
        .filter((s) => !s.querySelector('span'))
        .filter((s) => s.getBoundingClientRect().width > 1)
        .map((s) => (s.textContent ?? '').trim())
        .filter(Boolean)
        .join(' ')

    const labels: Record<string, string> = {}
    for (const control of bar.querySelectorAll<HTMLElement>('button[data-testid]')) {
      labels[control.dataset.testid ?? '?'] = visibleText(control)
    }

    const probe = labels['email-test-send-trigger']
    if (probe === undefined) throw new Error('déclencheur d’envoi de test absent')
    const switcher = bar.querySelector(
      '[data-testid="mjml-editor-template-switcher"]',
    )
    let tier: 'entier' | 'court' | 'resserre' | 'icones'
    if (probe === '') tier = 'icones'
    else if (probe === 'Envoyer un test') tier = 'entier'
    else if (probe === 'Tester') {
      // `court` et `resserre` ne diffèrent QUE par le sélecteur de modèle : à
      // `resserre` sa valeur passe en `sr-only` et il ne reste que l'icône. La
      // barre d'un événement n'a pas de sélecteur — les deux paliers y sont donc
      // rigoureusement indiscernables à l'écran, et la décision retient toujours
      // `court`, le plus lisible des deux à besoin égal. On lit donc `court`.
      tier = switcher && visibleText(switcher) === '' ? 'resserre' : 'court'
    } else throw new Error(`libellé d’envoi de test inattendu : « ${probe} »`)

    const badgeNode = document.querySelector(
      '[data-testid="mjml-editor-structural-badge-overlay"]',
    )

    return {
      tier,
      need,
      available: bar.getBoundingClientRect().width,
      lines,
      badge: !!badgeNode && badgeNode.getClientRects().length > 0,
      labels,
      titleTruncated:
        !!titleNode && titleNode.scrollWidth > titleNode.clientWidth + 1,
      renderedFree,
    }
  })
}

/**
 * LE TEST QUI REMPLACE TOUS LES SEUILS. Deux passes sur les mêmes largeurs :
 * la première étalonne le besoin de chaque palier sur le rendu, la seconde
 * confronte chaque largeur à la règle, dans les deux sens.
 *
 * Assertions SOUPLES (`expect.soft`) : un balayage qui s'arrête à la première
 * largeur fautive ne dit pas l'étendue du défaut. On veut le relevé complet —
 * c'est lui qui a valeur de preuve avant correction.
 */
async function expectMostReadableTierThatFits(
  page: Page,
  label: string,
  widths: readonly number[],
  /**
   * Les paliers que CETTE configuration peut atteindre. La barre d'un événement
   * n'a pas de sélecteur de modèle : `resserre` n'y concède rien de plus que
   * `court`, son besoin est identique, et la décision retient donc toujours le
   * plus lisible des deux. Exiger de l'observer serait exiger l'impossible.
   */
  reachable: readonly Tier[] = TIER_ORDER,
): Promise<void> {
  const needs = new Map<Tier, number>()
  const observed: { width: number; snap: ToolbarSnapshot }[] = []
  let badgeState: boolean | null = null

  for (const width of widths) {
    await resize(page, width)
    const snap = await readToolbar(page)

    if (badgeState === null) badgeState = snap.badge
    expect(
      snap.badge,
      `${label} @ ${width} px : l’état du badge a changé en cours de balayage — la configuration n’est plus la même, ses besoins non plus`,
    ).toBe(badgeState)

    // Première occurrence = largeur la plus grande pour ce palier = mou maximal,
    // donc aucun enfant comprimé et la mesure vaut le besoin réel.
    if (!needs.has(snap.tier)) needs.set(snap.tier, snap.need)
    observed.push({ width, snap })
  }

  const releve = observed
    .map(({ width, snap }) => `${width}→${snap.tier} (${snap.need.toFixed(0)})`)
    .join(', ')
  for (const tier of reachable) {
    expect(
      needs.has(tier),
      `${label} : le palier « ${tier} » n’apparaît à aucune des largeurs balayées, le balayage ne prouve rien sur lui. Relevé : ${releve}`,
    ).toBe(true)
  }

  for (const { width, snap } of observed) {
    const where = `${label} @ ${width} px [palier « ${snap.tier} »]`

    expect.soft(snap.lines, `${where} : la barre est revenue à la ligne`).toBe(1)

    const own = needs.get(snap.tier)!
    expect
      .soft(
        own,
        `${where} : ce palier ne tient pas — il réclame ${own.toFixed(1)} px`,
      )
      .toBeLessThanOrEqual(width + 1)

    // Le palier plus lisible le plus PROCHE parmi ceux réellement observés : sur
    // une configuration où `resserre` n'existe pas, le cran au-dessus de
    // `icones` est `court`, et c'est bien lui qu'il faut confronter.
    const better = TIER_ORDER.slice(0, TIER_ORDER.indexOf(snap.tier))
      .reverse()
      .find((t) => needs.has(t))
    if (better) {
      const betterNeed = needs.get(better)!
      expect
        .soft(
          betterNeed,
          `${where} : le palier « ${better} » TENAIT (${betterNeed.toFixed(1)} px requis, ${(width - betterNeed).toFixed(1)} px de vide) — du texte est masqué pour rien`,
        )
        .toBeGreaterThan(width)
    }

    if (snap.tier === 'icones') {
      const bavards = Object.entries(snap.labels).filter(([, text]) => text !== '')
      expect
        .soft(
          bavards.map(([id, text]) => `${id} → « ${text} »`),
          `${where} : des boutons affichent encore du texte au palier icônes`,
        )
        .toEqual([])
    }

    // LA MÊME RÈGLE, APPLIQUÉE AU TITRE. Il était la dernière exception : son
    // plafond agissait en permanence, donc il coupait du texte alors qu'il
    // restait de la place — 144 px d'un nom d'événement amputés avec 463 px de
    // vide sur la même ligne, relevé à l'écran le 2026-08-01. Son plafond vaut
    // désormais le plafond de mesure PLUS le mou restant : s'il tronque, c'est
    // que la barre n'a plus rien à lui donner.
    if (snap.titleTruncated) {
      expect
        .soft(
          snap.renderedFree,
          `${where} : le titre est tronqué alors qu’il reste ${snap.renderedFree.toFixed(1)} px de vide dans la barre`,
        )
        .toBeLessThan(2)
    }
  }
}

/** La largeur la plus grande à laquelle chaque palier s'observe. */
async function widthPerTier(
  page: Page,
  widths: readonly number[] = SWEEP_WIDTHS,
  reachable: readonly Tier[] = TIER_ORDER,
): Promise<Record<Tier, number>> {
  const found = new Map<Tier, number>()
  for (const width of widths) {
    await resize(page, width)
    const { tier } = await readToolbar(page)
    if (!found.has(tier)) found.set(tier, width)
  }
  for (const tier of reachable) {
    expect(
      found.has(tier),
      `le palier « ${tier} » n’apparaît à aucune largeur balayée`,
    ).toBe(true)
  }
  return Object.fromEntries(found) as Record<Tier, number>
}

/** Le titre est-il visuellement tronqué, et que porte son infobulle ? */
async function titleState(page: Page) {
  return page.evaluate(() => {
    const title = document.querySelector('[data-testid="mjml-editor-toolbar"] > p')
    if (!title) throw new Error('titre de la barre absent')
    return {
      truncated: title.scrollWidth > title.clientWidth + 1,
      tooltip: title.getAttribute('title'),
      // Le texte du DOM reste complet : la troncature est purement visuelle, donc
      // aucune perte d'information pour un lecteur d'écran.
      textContent: title.textContent ?? '',
      width: Math.round(title.getBoundingClientRect().width),
    }
  })
}

async function openEventEditor(page: Page, eventId: string): Promise<void> {
  await page.goto(`/admin/events/${eventId}/edit#template`)
  await page.getByTestId('event-invitation-open-editor-btn').click()
  await page.getByTestId('mjml-editor-toolbar').waitFor()
  await waitForGrapesEditorReady(page)
}

/**
 * La barre GÉNÉRALE d'un modèle système — la plus chargée du produit : elle
 * seule cumule menu d'identité, sélecteur de modèle et badge de verrou. Le
 * sous-onglet est choisi pour son libellé, le plus long des huit : il grandit À
 * LA FOIS le titre et le sélecteur de modèle, qui est en `w-auto`.
 *
 * Le paramètre `subtab` n'est pas décoratif : les 8 panneaux sont dans le DOM et
 * seul celui du sous-onglet actif est cliquable.
 */
async function openLongestGeneralEditor(page: Page): Promise<void> {
  await page.goto('/admin/settings?tab=email-template&subtab=emails-systeme-account-created')
  await page.getByTestId('email-system-template-panel-account_created').waitFor()
  await page.getByTestId('system-open-editor-btn-account_created').click()
  await page.getByTestId('mjml-editor-toolbar').waitFor()
  await waitForGrapesEditorReady(page)
}

/**
 * La barre générale de l'onglet « Invitation » — la plus LÉGÈRE des trois, celle
 * des captures du PO, et donc celle qui payait le plus cher un seuil calé sur la
 * plus chargée. Seule aussi à porter la variante « modifiable » du badge de
 * verrou (la plus large du produit), parce que c'est le seul sous-onglet non
 * système.
 */
async function openInvitationGeneralEditor(page: Page): Promise<void> {
  await page.goto('/admin/settings?tab=email-template&subtab=template-invitation')
  await page.getByTestId('invitation-open-editor-btn').waitFor()
  await page.getByTestId('invitation-open-editor-btn').click()
  await page.getByTestId('mjml-editor-toolbar').waitFor()
  await waitForGrapesEditorReady(page)
}

/**
 * Sélectionne le bloc en-tête DANS le canvas GrapesJS, ce qui fait apparaître le
 * badge de verrou dans la barre d'outils — l'élément le plus large de la barre
 * après le groupe d'actions, donc l'état où le besoin de largeur est maximal.
 * C'est un état atteint d'un simple clic, pas un cas de laboratoire.
 *
 * Passe par `setSelected` via le crochet de test `window.__grapesEditor` plutôt
 * que par un clic dans l'iframe : c'est le pipeline qu'emprunte un clic réel,
 * donc `component:select:before` se déclenche à l'identique — même approche que
 * la spec des blocs de coque, et elle ne dépend pas de la géométrie du canvas.
 */
async function selectShellHeaderBlock(page: Page): Promise<void> {
  await page.evaluate(() => {
    type Comp = {
      getAttributes: () => Record<string, string>
      components: () => { models: Comp[] }
    }
    type GrapesTestHook = {
      getWrapper: () => { find: (sel: string) => Comp[] }
      select: (c: Comp) => void
    }
    // `__grapesEditor` est un crochet de test posé sur `window` par la config
    // GrapesJS en DEV : aucun typage global ne le déclare, et une validation
    // runtime n'aurait pas de sens ici — si le crochet manque, le
    // `waitForGrapesEditorReady` de l'appelant a déjà échoué. Assertion nommée
    // plutôt qu'inlinée dans l'accès.
    const win = window as unknown as { __grapesEditor: GrapesTestHook }
    const ed = win.__grapesEditor
    const section = ed
      .getWrapper()
      .find('[css-class~="locked-shell"]')
      .find((s) => s.getAttributes()['data-part-kind'] === 'header')
    if (!section) throw new Error('section data-part-kind="header" introuvable')
    // Un clic réel atterrit sur un descendant feuille, pas sur la section.
    const descendants = section.components().models
    ed.select(descendants[0]?.components().models[0] ?? descendants[0] ?? section)
  })
  await page.getByTestId('mjml-editor-structural-badge-overlay').waitFor()
}

test.describe('@slow Barre d’outils de l’éditeur — le palier le plus lisible qui tient', () => {
  let token: string
  let longNameEventId: string

  test.beforeAll(async ({ request }) => {
    token = await fetchAdminToken(request)
    longNameEventId = await createTestEvent(request, token, LONG_EVENT_NAME)
  })

  test.afterAll(async ({ request }) => {
    if (longNameEventId) await deleteTestEvent(request, token, longNameEventId)
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  // ==========================================================================
  // LA RÈGLE, sur les six configurations : trois barres × deux états de badge.
  // ==========================================================================

  test('barre générale Invitation : le palier le plus lisible qui tient', async ({
    page,
  }) => {
    test.slow()
    await resize(page, 1900)
    await openInvitationGeneralEditor(page)
    await expectMostReadableTierThatFits(
      page,
      'générale Invitation, sans badge',
      SWEEP_WIDTHS,
    )
    await resize(page, 1900)
    await selectShellHeaderBlock(page)
    await expectMostReadableTierThatFits(
      page,
      'générale Invitation, badge affiché',
      BADGE_SWEEP_WIDTHS,
    )
  })

  test('barre générale système : le palier le plus lisible qui tient', async ({
    page,
  }) => {
    test.slow()
    await resize(page, 1900)
    await openLongestGeneralEditor(page)
    await expectMostReadableTierThatFits(
      page,
      'générale système, sans badge',
      SWEEP_WIDTHS,
    )

    await test.step('la région live est montée AVANT son contenu', async () => {
      // Une région live insérée en même temps que son texte n'est pas annoncée
      // par beaucoup de lecteurs d'écran : le conteneur doit préexister, vide.
      // C'est le défaut que la version précédente avait — le `<div role="status">`
      // et son badge arrivaient dans la même validation React.
      const live = page.getByTestId('mjml-editor-structural-badge-live')
      await expect(live).toHaveAttribute('role', 'status')
      await expect(live).toHaveText('')
    })

    await test.step('la pastille d’état modifié ne coûte que sa gouttière', async () => {
      // Le pseudo-élément de la pastille est un ITEM FLEX du bouton : la
      // gouttière de la primitive s'applique déjà. Une `margin-right` en plus la
      // doublait — 20 px au lieu de 14 — et ces 6 px déplaçaient la frontière de
      // palier de 20 px, si bien que taper un caractère dans le canvas pouvait
      // faire disparaître tous les libellés de la barre.
      const at = await widthPerTier(page)
      await resize(page, at.entier)
      const save = page.getByTestId('mjml-editor-save-btn')
      const propre = (await save.boundingBox())!.width
      await save.evaluate((el) => {
        el.setAttribute('data-dirty', 'true')
        el.removeAttribute('disabled')
      })
      const modifie = (await save.boundingBox())!.width
      expect(
        modifie - propre,
        'la pastille coûte plus que son diamètre et une gouttière — `margin-right` revenue ?',
      ).toBeLessThanOrEqual(15)
      expect(modifie - propre, 'la pastille ne se voit plus').toBeGreaterThan(10)
      await save.evaluate((el) => el.removeAttribute('data-dirty'))
    })

    // Cette barre est la seule à porter les cinq contrôles à la fois : les
    // vérifications de nom accessible et de forme vivent donc ici, sur le
    // balayage qui vient d'avoir lieu, plutôt que dans un test qui rouvrirait le
    // même éditeur pour rebalayer les mêmes largeurs.
    await test.step('aucun nom accessible ne disparaît avec le libellé visible', async () => {
      const at = await widthPerTier(page)
      const identity = page.getByTestId('email-identity-menu-trigger')
      const testSend = page.getByTestId('email-test-send-trigger')
      const switcher = page.getByTestId('mjml-editor-template-switcher')
      const save = page.getByTestId('mjml-editor-save-btn')
      const cancel = page.getByTestId('mjml-editor-cancel-btn')

      // --- Palier entier : tout en toutes lettres ----------------------------
      await resize(page, at.entier)
      expect((await readToolbar(page)).labels).toMatchObject({
        'email-identity-menu-trigger': 'Identité visuelle',
        'email-test-send-trigger': 'Envoyer un test',
        'mjml-editor-save-btn': 'Enregistrer',
        'mjml-editor-cancel-btn': 'Fermer',
      })

      // --- Paliers court et resserré : les libellés RACCOURCISSENT, ils ne sont
      //     pas renommés, et « Enregistrer » comme « Fermer » gardent leur mot --
      for (const tier of ['court', 'resserre'] as const) {
        await resize(page, at[tier])
        expect((await readToolbar(page)).labels, `palier ${tier}`).toMatchObject({
          'email-identity-menu-trigger': 'Identité',
          'email-test-send-trigger': 'Tester',
          'mjml-editor-save-btn': 'Enregistrer',
          'mjml-editor-cancel-btn': 'Fermer',
        })
        // Le nom accessible SUIT le libellé visible, et c'est VOULU : un
        // `aria-label` figé sur la forme courte casserait « Label in Name »
        // (WCAG 2.5.3) au palier entier, où l'écran affiche la forme longue.
        await expect(identity).toHaveAccessibleName('Identité')
        await expect(testSend).toHaveAccessibleName('Tester')
      }

      // --- Palier icônes : plus un seul mot, et pas un seul nom perdu ---------
      await resize(page, at.icones)
      await expect(identity).toHaveAccessibleName('Identité')
      await expect(testSend).toHaveAccessibleName('Tester')
      await expect(save).toHaveAccessibleName('Enregistrer')
      await expect(cancel).toHaveAccessibleName('Fermer')
      // « Fermer » porte une description DIFFÉRENTE de son nom, et c'est tout
      // l'intérêt du motif `sr-only` : l'ancien couple `aria-label` +
      // `<span class="hidden">` faisait annoncer deux fois la même chaîne.
      await expect(cancel).toHaveAccessibleDescription("Fermer l'éditeur")
      // Pour le rôle `combobox`, le nom ne se calcule pas depuis le contenu — le
      // libellé affiché devient la VALEUR. Sans `aria-label`, ce contrôle n'aurait
      // aucun nom (WCAG 4.1.2, niveau A).
      await expect(switcher).toHaveAccessibleName("Modèle d'e-mail")

      // Les cinq contrôles icône seule sont CARRÉS — le sélecteur compris, depuis
      // qu'il perd son cadre et son chevron. Un rectangle décale le centre
      // optique. Cible tactile 32 × 32, au-dessus du minimum WCAG 2.5.8 (24 px)
      // avec 33 % de marge.
      for (const id of [
        'email-identity-menu-trigger',
        'email-test-send-trigger',
        'mjml-editor-template-switcher',
        'mjml-editor-save-btn',
        'mjml-editor-cancel-btn',
      ]) {
        const box = await page.getByTestId(id).boundingBox()
        expect(box, `${id} sans boîte`).not.toBeNull()
        expect(Math.round(box!.width), `${id} n’est pas carré`).toBe(32)
        expect(Math.round(box!.height), `${id} n’est pas carré`).toBe(32)
      }

      // L'ICÔNE DU MODÈLE COURANT est ce qui reste du sélecteur — sans elle, le
      // contrôle est un carré vide. Assertion sur le TYPE du premier enfant et non
      // sur une largeur : un composant JSX nommé en minuscule serait rendu comme
      // une balise inconnue, invisible mais occupant les mêmes 16 px.
      expect(
        await switcher.evaluate((el) => el.firstElementChild?.tagName.toLowerCase()),
        'l’icône du modèle courant n’est pas un <svg> — composant JSX en minuscule ?',
      ).toBe('svg')
    })

    await resize(page, 1900)
    await selectShellHeaderBlock(page)
    await expectMostReadableTierThatFits(
      page,
      'générale système, badge affiché',
      BADGE_SWEEP_WIDTHS,
    )

    await test.step('le badge de verrou est raccourci, jamais tronqué', async () => {
      const badge = page.getByTestId('mjml-editor-structural-badge-overlay')
      const at = await widthPerTier(page, BADGE_SWEEP_WIDTHS)

      await resize(page, at.entier)
      expect(await badge.innerText()).toBe(
        'Élément structurel — hérité, pas encore personnalisé ici',
      )

      // Le mot qui désambiguïse les deux états est en FIN de chaîne : une ellipse
      // à droite le couperait et rouvrirait l'ambiguïté levée le 2026-07-30. La
      // forme courte cède la qualification de TÊTE, commune aux deux états.
      for (const tier of ['court', 'resserre', 'icones'] as const) {
        if (at[tier] === undefined) continue
        await resize(page, at[tier])
        expect(await badge.innerText(), `palier ${tier}`).toBe(
          'Hérité — pas encore personnalisé',
        )
      }

      // La région live est montée EN PERMANENCE et porte toujours la forme
      // LONGUE : une aide technique n'a pas de raison de recevoir le texte abrégé
      // faute de place à l'écran. Une région insérée en même temps que son
      // contenu n'est pas annoncée par beaucoup de lecteurs d'écran.
      await expect(
        page.getByTestId('mjml-editor-structural-badge-live'),
      ).toHaveText('En-tête — Élément structurel — hérité, pas encore personnalisé ici')
    })
  })

  test('barre d’événement, nom de 200 caractères : le palier le plus lisible qui tient', async ({
    page,
  }) => {
    test.slow()
    // Épingle la frontière que cette barre prétend couvrir : le maximum du
    // formulaire. Rien ne borne ce texte en amont de la barre.
    expect(LONG_EVENT_NAME).toHaveLength(200)

    await resize(page, 1900)
    await openEventEditor(page, longNameEventId)
    // `resserre` est inatteignable ici : cette barre n'a pas de sélecteur de
    // modèle, donc rien à concéder de plus que `court` — même besoin, et la
    // décision retient toujours le plus lisible des deux.
    await expectMostReadableTierThatFits(
      page,
      'événement 200 car., sans badge',
      SWEEP_WIDTHS,
      ['entier', 'court', 'icones'],
    )

    await test.step('le titre ne cède que ce qu’il doit', async () => {
      await resize(page, 1024, 800)
      expect((await readToolbar(page)).lines).toBe(1)

      const title = await titleState(page)
      expect(title.truncated).toBe(true)
      expect(title.tooltip).toBe(LONG_EVENT_NAME)
      // Troncature visuelle seulement : le nom complet reste dans le DOM, donc
      // annoncé en entier par un lecteur d'écran.
      expect(title.textContent).toBe(LONG_EVENT_NAME)

      // LE PLAFOND N'EST PLUS UNE CONSTANTE. Il vaut le plafond de mesure PLUS le
      // mou restant, donc un titre plus large qu'avant à largeur de fenêtre égale
      // — c'est le correctif du 2026-08-01, où 144 px de nom partaient dans
      // l'ellipse pendant que 463 px restaient vides sur la même ligne. Ce qui
      // reste vrai, et que le balayage vérifie à toute largeur : le titre ne
      // tronque QUE lorsque la barre n'a plus de mou.
      expect(title.width).toBeGreaterThan(256)

      // Le plafond de mesure agit malgré tout : sans lui, le titre prendrait sa
      // largeur de contenu (plus de 1 500 px) et romprait la barre à TOUTE
      // largeur.
      await resize(page, 440, 800)
      expect((await readToolbar(page)).lines).toBe(1)
      expect((await titleState(page)).truncated).toBe(true)
    })

    await resize(page, 1900)
    await selectShellHeaderBlock(page)
    await expectMostReadableTierThatFits(
      page,
      'événement 200 car., badge affiché',
      BADGE_SWEEP_WIDTHS,
      ['entier', 'court', 'icones'],
    )
  })

  test('la dégradation est monotone : aucune oscillation de 1400 à 440 px et retour', async ({
    page,
  }) => {
    test.slow()
    await resize(page, 1400)
    await openInvitationGeneralEditor(page)

    const descending: number[] = []
    for (let width = 1400; width >= 440; width -= 20) descending.push(width)
    const ascending = [...descending].reverse()

    // En rétrécissant, le palier ne peut que se dégrader ; en élargissant, que
    // s'améliorer. La décision ne regardant JAMAIS l'état affiché — elle est une
    // fonction pure de (largeur, contenu) — il n'existe pas de boucle de
    // rétroaction, donc pas de va-et-vient possible. Ce test le constate.
    for (const [direction, widths] of [
      ['en rétrécissant', descending],
      ['en élargissant', ascending],
    ] as const) {
      let previous = -1
      for (const width of widths) {
        await resize(page, width)
        const { tier, lines } = await readToolbar(page)
        const rank = TIER_ORDER.indexOf(tier)
        const monotone = direction === 'en rétrécissant' ? rank >= previous : true
        expect
          .soft(monotone, `${direction} @ ${width} px : le palier a remonté puis redescendu`)
          .toBe(true)
        expect.soft(lines, `${direction} @ ${width} px : la barre est sur 2 lignes`).toBe(1)
        previous = direction === 'en rétrécissant' ? rank : previous
      }
      if (direction === 'en élargissant') {
        // Retour exact au point de départ : le palier de 1400 px est le même
        // qu'à l'aller. Une hystérésis se verrait ici.
        expect((await readToolbar(page)).tier).toBe('entier')
      }
    }

    // Stabilité à largeur fixe : cinq lectures, un seul palier. Une oscillation
    // se manifesterait par deux valeurs différentes sans rien changer.
    await resize(page, 860)
    const readings = new Set<Tier>()
    for (let i = 0; i < 5; i++) {
      readings.add((await readToolbar(page)).tier)
      await page.waitForTimeout(60)
    }
    expect([...readings], 'le palier change tout seul à largeur constante').toHaveLength(1)
  })

  test('flex-wrap reste le plancher : sous son point de rupture, tout reste dans le cadre', async ({
    page,
  }) => {
    // 370 px, et non 400 : le palier `resserre` et la disparition du cadre du
    // sélecteur ont fait descendre le point de rupture de la barre la plus
    // chargée de 416 à 379 px (mesuré au pixel), et celui de la plus légère à
    // 299. Pour exercer le PLANCHER il faut donc la barre générale système, la
    // seule dont la rupture soit encore au-dessus de 370. Si cette valeur doit
    // encore baisser un jour, c'est une bonne nouvelle, pas une régression — mais
    // ce test doit alors suivre, sinon il ne sollicite plus rien.
    const width = 370
    await resize(page, 1280, 800)
    await openLongestGeneralEditor(page)
    // Rétrécir APRÈS ouverture : c'est le scénario réel (la fenêtre change de
    // taille pendant l'édition), et l'entrée dans l'éditeur est gardée par la
    // taille de l'écran, pas par celle de la fenêtre.
    await resize(page, width, 800)

    // On veut vérifier le PLANCHER : encore faut-il qu'il soit sollicité.
    expect((await readToolbar(page)).lines).toBeGreaterThanOrEqual(2)

    const ids = [
      'email-identity-menu-trigger',
      'email-test-send-trigger',
      'mjml-editor-save-btn',
      'mjml-editor-cancel-btn',
    ]
    for (const id of ids) {
      const box = await page.getByTestId(id).boundingBox()
      expect(box, `${id} sans boîte — élément non rendu`).not.toBeNull()
      // Le défaut d'origine, exactement : le bouton entièrement hors du cadre,
      // sans barre de défilement pour aller le chercher.
      expect(box!.x, `${id} sort du cadre à gauche`).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width, `${id} sort du cadre à droite`).toBeLessThanOrEqual(width)
      expect(box!.y, `${id} sort du cadre en haut`).toBeGreaterThanOrEqual(0)
    }

    // Atteignable ne suffit pas : il doit agir. Rien n'est modifié, donc pas de
    // garde « quitter sans enregistrer » — l'éditeur se ferme directement.
    await page.getByTestId('mjml-editor-cancel-btn').click()
    await expect(page.getByTestId('mjml-editor-inner')).toHaveCount(0)
  })
})
