import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SystemTemplateKey } from '@/lib/email-system-template-constants'
import {
  composeSystemCanvasBody,
  extractSystemZones,
  htmlToPlainText,
  SYSTEM_EDIT_INTRO_CLASS,
  SYSTEM_EDIT_SIG_CLASS,
  type SystemZoneWrapperLike,
} from '../systemCanvas'

// Clés dont le milieu figé est un bouton CTA avec href.
const BUTTON_KEYS = [
  'magic_link_login',
  'reservation_confirmation',
  'account_created',
  'role_promoted',
  'role_demoted',
] as const
type ButtonKey = (typeof BUTTON_KEYS)[number]

// Toutes les clés système (incluant cancellation_confirmation).
const KEYS: SystemTemplateKey[] = [...BUTTON_KEYS, 'cancellation_confirmation', 'unregistration_confirmation']

const EXPECTED_CTA_HREF: Record<ButtonKey, string> = {
  magic_link_login: '{{magic_link}}',
  reservation_confirmation: '{{calendar_url}}',
  account_created: '{{login_url}}',
  role_promoted: '{{login_url}}',
  role_demoted: '{{login_url}}',
}

describe('systemCanvas — composeSystemCanvasBody', () => {
  it.each(KEYS)('%s — contient zones taggées, marqueurs INTRO/SIG, milieu figé', (key) => {
    const body = composeSystemCanvasBody(key, 'Bonjour', 'À bientôt')

    // Les 2 zones éditables portent leur css-class (source unique Phase 1).
    expect(body).toContain(`css-class="${SYSTEM_EDIT_INTRO_CLASS}"`)
    expect(body).toContain(`css-class="${SYSTEM_EDIT_SIG_CLASS}"`)
    // Marqueurs miroir du squelette serveur.
    expect(body).toContain('<!-- INTRO:START -->')
    expect(body).toContain('<!-- INTRO:END -->')
    expect(body).toContain('<!-- SIG:START -->')
    expect(body).toContain('<!-- SIG:END -->')
    // Section unique (frozen via locked-shell injecté plus tard).
    expect(body).toContain('<mj-section padding="20px">')
    // Intro/sig injectés tels quels (texte brut, jamais encodés).
    expect(body).toContain('>Bonjour</mj-text>')
    expect(body).toContain('>À bientôt</mj-text>')
    // Le bloc figé salutation (padding-bottom="16px") n'existe plus.
    expect(body).not.toContain('padding-bottom="16px">Bonjour {{user_first_name}},')
  })

  it.each(BUTTON_KEYS)('%s — milieu figé contient href CTA attendu', (key) => {
    const body = composeSystemCanvasBody(key, 'Bonjour', 'À bientôt')
    // CTA d'affichage : href verbatim par clé.
    expect(body).toContain(`href="${EXPECTED_CTA_HREF[key]}"`)
  })

  it('cancellation_confirmation — milieu figé = bloc détails + CTA « Choisir un nouveau créneau »', () => {
    const body = composeSystemCanvasBody('cancellation_confirmation', 'Bonjour', 'À bientôt')
    // Le bloc détails figé contient les variables structurelles.
    expect(body).toContain('{{event_name}}')
    expect(body).toContain('{{cancellation_reason}}')
    // CTA d'affichage vers le même événement (href verbatim, figé dans le milieu).
    expect(body).toContain('<mj-button')
    expect(body).toContain('href="{{calendar_url}}"')
  })

  it('unregistration_confirmation — milieu figé = bloc détails + CTA', () => {
    const body = composeSystemCanvasBody('unregistration_confirmation', 'Bonjour', 'À bientôt')
    // Le bloc détails figé contient les variables structurelles du créneau.
    expect(body).toContain('{{event_name}}')
    expect(body).toContain('{{slot_date}}')
    expect(body).toContain('{{slot_time}}')
    // Désinscription volontaire : pas de motif d'annulation, CTA vers le calendrier.
    expect(body).not.toContain('{{cancellation_reason}}')
    expect(body).toContain('<mj-button')
    expect(body).toContain('href="{{calendar_url}}"')
  })

  it('insère les variables littéralement (non encodées)', () => {
    const body = composeSystemCanvasBody(
      'magic_link_login',
      'Bonjour {{expiration_date}}',
      'Signé {{magic_link}}',
    )
    expect(body).toContain('>Bonjour {{expiration_date}}</mj-text>')
    expect(body).toContain('>Signé {{magic_link}}</mj-text>')
    // Pas d'encodage d'entités côté canvas.
    expect(body).not.toContain('&lt;')
    expect(body).not.toContain('&amp;')
  })

  it('escape & < > avant injection (round-trip neutre avec extraction qui décode)', () => {
    const body = composeSystemCanvasBody('reservation_confirmation', 'Tom & Jerry', '<nom> fin')
    // Le texte admin avec métacaractères est échappé : GrapesJS le rend littéral
    // au lieu de parser `<nom>` comme une balise (qui serait strippée → perte).
    expect(body).toContain('Tom &amp; Jerry')
    expect(body).toContain('&lt;nom&gt; fin')
    expect(body).not.toContain('<nom>')
  })

  it('zone vide → mj-text vide valide', () => {
    const body = composeSystemCanvasBody('account_created', '', '')
    expect(body).toContain(`<mj-text css-class="${SYSTEM_EDIT_INTRO_CLASS}" padding-bottom="8px"></mj-text>`)
  })

  it('convertit \\n → <br/> dans intro ET sig (après escape)', () => {
    const body = composeSystemCanvasBody(
      'magic_link_login',
      'Bonjour {{user_first_name}},\n\nvoici',
      'sig\nfin',
    )
    // Sauts de ligne → <br/> dans la zone intro (escape d'abord, \\n après).
    const introInner = /tp-edit-intro[^>]*>([\s\S]*?)<\/mj-text>/.exec(body)![1]
    expect(introInner).toBe('Bonjour {{user_first_name}},<br/><br/>voici')
    // Sauts de ligne → <br/> dans la zone sig.
    const sigInner = /tp-edit-sig[^>]*>([\s\S]*?)<\/mj-text>/.exec(body)![1]
    expect(sigInner).toBe('sig<br/>fin')
    // Plus de bloc figé salutation séparé.
    expect(body).not.toContain('padding-bottom="16px">Bonjour {{user_first_name}},')
  })

})

describe('systemCanvas — extractSystemZones', () => {
  afterEach(() => vi.restoreAllMocks())

  function makeWrapper(zones: Record<string, string | undefined>): SystemZoneWrapperLike {
    return {
      find(selector: string) {
        const m = /\[css-class~="([^"]+)"\]/.exec(selector)
        if (!m) return []
        const html = zones[m[1]]
        if (html === undefined) return []
        return [{ getInnerHTML: () => html }]
      },
    }
  }

  it('réduit en texte brut : balises strippées, variable préservée', () => {
    const wrapper = makeWrapper({
      [SYSTEM_EDIT_INTRO_CLASS]: 'Intro <b>gras</b> {{expiration_date}}',
      [SYSTEM_EDIT_SIG_CLASS]: 'Sig modifiée',
    })
    const { introText, signatureText } = extractSystemZones(wrapper)
    expect(introText).toBe('Intro gras {{expiration_date}}')
    expect(signatureText).toBe('Sig modifiée')
  })

  it('décode les entités symétriquement au serveur', () => {
    const wrapper = makeWrapper({
      [SYSTEM_EDIT_INTRO_CLASS]: 'Tom &amp; Jerry &lt;3',
      [SYSTEM_EDIT_SIG_CLASS]: 'a&nbsp;b',
    })
    const { introText, signatureText } = extractSystemZones(wrapper)
    expect(introText).toBe('Tom & Jerry <3')
    expect(signatureText).toBe('a b')
  })

  it('zone manquante → chaîne vide + console.error', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const wrapper = makeWrapper({ [SYSTEM_EDIT_SIG_CLASS]: 'présent' })
    const { introText, signatureText } = extractSystemZones(wrapper)
    expect(introText).toBe('')
    expect(signatureText).toBe('présent')
    expect(errSpy).toHaveBeenCalledTimes(1)
  })

})

describe('systemCanvas — htmlToPlainText (round-trip serveur)', () => {
  it('strip avant décode (ordre)', () => {
    // Texte encodé littéral : strip ne trouve pas de balise, décode → <b>.
    expect(htmlToPlainText('&lt;b&gt;x&lt;/b&gt;')).toBe('<b>x</b>')
  })

  it('trim les espaces de bordure', () => {
    expect(htmlToPlainText('  bonjour  ')).toBe('bonjour')
  })

  it('convertit les frontières de bloc/saut en saut de ligne (pas de collage de mots)', () => {
    // <br>/<div>/<p> → '\n' ; sans ça le strip nu collerait les mots.
    expect(htmlToPlainText('lien<br>de')).toBe('lien\nde')
    expect(htmlToPlainText('ligne1<div>ligne2</div>')).toBe('ligne1\nligne2')
    expect(htmlToPlainText('a<br/>b')).toBe('a\nb')
  })

  it('<br/><br/> → deux sauts de ligne consécutifs (ligne vide)', () => {
    expect(htmlToPlainText('a<br/><br/>b')).toBe('a\n\nb')
  })

  it('collapse \\n{3,} → \\n\\n (max une ligne vide)', () => {
    expect(htmlToPlainText('a<br/><br/><br/><br/>b')).toBe('a\n\nb')
  })

  it('strip styles sans collage de mots', () => {
    expect(htmlToPlainText('Intro <b style="x">gras</b>')).toBe('Intro gras')
  })

  it('invariant round-trip avec \\n et entités (\\n survive compose → extract)', () => {
    const x = 'Bonjour {{user_first_name}},\n\nLigne & <deux>'
    const body = composeSystemCanvasBody('magic_link_login', x, 'sig')
    const introInner = /tp-edit-intro[^>]*>([\s\S]*?)<\/mj-text>/.exec(body)![1]
    // parse(compose(x)) === x : sauts + entités survivent au round-trip.
    expect(htmlToPlainText(introInner)).toBe(x)
  })

  it('round-trip compose(escape) → extract(decode) est neutre', () => {
    const body = composeSystemCanvasBody('magic_link_login', 'Tom & <nom>', 'sig')
    // Extrait le contenu de la zone intro tel que GrapesJS le restituerait
    // (les entités survivent dans getInnerHTML), puis décode → texte d'origine.
    const introInner = /tp-edit-intro[^>]*>([\s\S]*?)<\/mj-text>/.exec(body)![1]
    expect(htmlToPlainText(introInner)).toBe('Tom & <nom>')
  })
})
