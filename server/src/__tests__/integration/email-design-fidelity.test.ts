/**
 * Test de fidélité visuelle des emails (spec-email-visual-design-fidelity, 2026-05-30).
 *
 * Rend les templates contre une marque « configurée » seedée de façon SCOPÉE
 * (logo + bouton violet + fond gris) et asserte que les TOKENS DE DESIGN
 * apparaissent dans le HTML rendu — garde-fou anti-régression du flux
 * « marque (DB) → tokens dans le HTML ».
 *
 * Contrairement à email-visual-baselines.test.ts (qui rend contre la marque
 * d'usine et n'asserte que du texte), ce test vérifie le DESIGN. Aucun envoi
 * SMTP/Mailpit : `renderEmail()` est appelé directement. Le singleton de marque
 * est muté en `beforeAll` et restauré à l'identique en `afterAll` (Jest exécute
 * `afterAll` même en cas d'échec ; `maxWorkers:1` → aucune fuite inter-suites).
 *
 * Sortie (HTML designé navigable) :
 *   test-results/email-design-fidelity/
 */

// NB : contrairement aux autres tests de rendu, on N'utilise PAS le mock
// `isomorphic-dompurify`. Un test de FIDÉLITÉ doit exercer la vraie
// sanitisation (`sanitizeEmailHtml`) : c'est précisément la couche qui pourrait
// stripper les tokens de design (couleurs, `src` du logo). On valide donc le
// HTML tel qu'un destinataire le reçoit, après sanitisation réelle.

import fs from 'fs'
import path from 'path'
import {
  getEmailBrandSettings,
  updateEmailBrandSettings,
  type EmailBrandSettings,
} from '../../db/email-brand-settings.db'
import { renderEmail, type TemplateKey } from '../../services/render-email.service'
import type { VariablesPayload } from '../../services/mjml-compile.service'
import { query } from '../../db'

// ---------------------------------------------------------------------------
// Fixture de marque « configurée » — STABLE et committé (PAS l'URL de logo live
// mutable de la base dev). Le logo `https://…` passe `SAFE_HREF_RE`
// (lib/email-validation-patterns.ts), donc `validateBrandSettings` l'accepte.
// ---------------------------------------------------------------------------

const FIXTURE_LOGO_URL = 'https://timepick.example.com/uploads/emails/fixture-logo.png'
const FIXTURE_PRIMARY = '#8f2d8c' // violet (couleur de bouton)
const EXPECTED_MJ_BODY_BACKGROUND = '#ffffff' // repli hardcodé HARDCODED_MJ_BODY_ATTRS — le fond n'est plus piloté par la marque (retrait background_color, migration 022)

const CONFIGURED_BRAND = {
  logoUrl: FIXTURE_LOGO_URL,
  primaryColor: FIXTURE_PRIMARY,
}

// ---------------------------------------------------------------------------
// Variables d'échantillon déterministes (miroir email-visual-baselines.test.ts).
// ---------------------------------------------------------------------------

const EXPIRATION = '31 décembre 2026 à 18h00'
const EVENT_NAME = 'Soirée Annuelle 2026'
const GREETING = 'Bonjour Jean,'
const SLOT_DATE = '15 juin 2026'
const SLOT_TIME = '14h00 → 15h00'

interface FidelityCase {
  file: string
  templateKey: TemplateKey
  variables: VariablesPayload
  /** Le template contient-il un `<mj-button>` (→ hérite de brand.primaryColor) ? */
  hasButton: boolean
}

const CASES: FidelityCase[] = [
  {
    file: 'email-invitation-designed.html',
    templateKey: 'invitation',
    variables: {
      event_name: EVENT_NAME,
      event_description: 'Notre événement phare',
      magic_link: 'https://timepick.example.com/event/abc?token=invite789',
      expiration_date: EXPIRATION,
    },
    hasButton: true, // « Réserver mon créneau »
  },
  {
    file: 'email-magic_link_login-user-designed.html',
    templateKey: 'magic_link_login',
    variables: {
      magic_link: 'https://timepick.example.com/auth/verify?token=user789xyz',
      expiration_date: EXPIRATION,
      is_admin: 'false',
    },
    hasButton: true, // « Accéder à mon espace »
  },
  {
    file: 'email-cancellation_confirmation-designed.html',
    templateKey: 'cancellation_confirmation',
    variables: {
      event_name: EVENT_NAME,
      user_first_name: 'Jean',
      slot_date: SLOT_DATE,
      slot_time: SLOT_TIME,
      cancellation_reason: '',
      calendar_url: 'https://timepick.example.com/events/abc',
    },
    hasButton: true, // « Choisir un nouveau créneau »
  },
]

const OUTPUT_DIR = path.resolve(
  __dirname,
  '../../../../test-results/email-design-fidelity',
)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Email design fidelity — marque configurée seedée', () => {
  // Snapshot de l'état pré-test pour restauration EXACTE (n'assume pas
  // « usine == defaults »). Capturé AVANT toute mutation.
  let snapshot: EmailBrandSettings | null = null
  // Snapshot des shell_parts `mj-body` neutralisés le temps du test (cf. beforeAll).
  let savedMjBody: Array<{
    owner_kind: string
    owner_id: string
    part_kind: string
    content_mjml: string
  }> = []

  beforeAll(async () => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
    snapshot = await getEmailBrandSettings()
    await updateEmailBrandSettings(CONFIGURED_BRAND)
    // La coque commune « carte » (migration 018) seed un shell_part
    // template[invitation]/mj-body (#f3f3f3) qui sert de FALLBACK inter-templates
    // (cascade γ) et pilote donc le fond du <mj-body>. On neutralise ce fallback
    // le temps du test (restauré en afterAll) pour exercer le chemin « cascade
    // mj-body vide → repli hardcodé HARDCODED_MJ_BODY_ATTRS (#ffffff) » : depuis
    // le retrait de background_color (migration 022), le fond n'est plus piloté
    // par la marque. Sans ça, le test dépend silencieusement de l'ordre d'exécution.
    savedMjBody = (
      await query<{
        owner_kind: string
        owner_id: string
        part_kind: string
        content_mjml: string
      }>(`SELECT owner_kind, owner_id, part_kind, content_mjml FROM shell_parts WHERE part_kind = 'mj-body'`)
    ).rows
    await query(`DELETE FROM shell_parts WHERE part_kind = 'mj-body'`)
  })

  afterAll(async () => {
    // Restaure l'état pré-test → les suites suivantes héritent de la marque d'usine.
    // Les 5 champs ci-dessous constituent l'INTÉGRALITÉ des champs mutables de la marque
    // (cf. `EmailBrandSettingsUpdate = Partial<Omit<EmailBrandSettings, 'updatedAt'>>`) :
    // les restaurer revient à restaurer la marque entière.
    if (snapshot) {
      await updateEmailBrandSettings({
        logoUrl: snapshot.logoUrl,
        primaryColor: snapshot.primaryColor,
        buttonTextColor: snapshot.buttonTextColor,
        fontFamily: snapshot.fontFamily,
        buttonBorderRadius: snapshot.buttonBorderRadius,
      })
    }
    // Restaure les shell_parts mj-body neutralisés en beforeAll, sinon les suites
    // suivantes du même run (maxWorkers:1) hériteraient d'une cascade mj-body vide.
    for (const r of savedMjBody) {
      await query(
        `INSERT INTO shell_parts (owner_kind, owner_id, part_kind, content_mjml)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (owner_kind, owner_id, part_kind)
         DO UPDATE SET content_mjml = EXCLUDED.content_mjml`,
        [r.owner_kind, r.owner_id, r.part_kind, r.content_mjml],
      )
    }
  })

  test.each(CASES.map((c) => [c.file, c] as const))(
    'rend %s avec les tokens de design (logo + fond + bouton)',
    async (file, testCase) => {
      const { html } = await renderEmail({
        templateKey: testCase.templateKey,
        variables: testCase.variables,
      })

      // Logo dans la coque — ancré sur l'attribut `src` (pas une simple présence d'URL).
      expect(html).toContain(`src="${FIXTURE_LOGO_URL}"`)
      // Fond blanc — repli hardcodé HARDCODED_MJ_BODY_ATTRS (#ffffff) puisque la
      // cascade mj-body est vidée en beforeAll ; le fond n'est plus piloté par la
      // marque (retrait background_color, migration 022). Insensible à la casse.
      expect(html).toMatch(new RegExp(`background-color:\\s*${EXPECTED_MJ_BODY_BACKGROUND}`, 'i'))
      // Couleur de bouton violette — insensible à la casse. Valeur fixture unique :
      // aucune collision avec les couleurs par défaut du pipeline (vérifié).
      if (testCase.hasButton) {
        expect(html).toMatch(new RegExp(FIXTURE_PRIMARY, 'i'))
      }

      // P3 (review e-mail) — verrouille la survie de la flèche « → » (U+2192) face
      // au VRAI sanitizer (ce test n'utilise PAS le mock DOMPurify). Sans ça, un
      // ré-encodage en entité par une future version de DOMPurify fuirait brut
      // dans la partie texte (htmlToText ne décode que 7 entités).
      if (testCase.variables.slot_time) {
        expect(html).toContain(testCase.variables.slot_time)
      }

      // Artefact designé navigable (ouvrable au navigateur).
      const outPath = path.join(OUTPUT_DIR, file)
      fs.writeFileSync(outPath, html, 'utf-8')
      expect(fs.statSync(outPath).size).toBeGreaterThan(0)
    },
  )

  test('la marque est bien configurée pendant le test (sanity)', async () => {
    const brand = await getEmailBrandSettings()
    expect(brand.logoUrl).toBe(FIXTURE_LOGO_URL)
    expect(brand.primaryColor).toBe(FIXTURE_PRIMARY)
  })
})
