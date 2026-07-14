import type { ResolvedShell } from '@/services/editor-context.service'
import { MJ_BODY_BACKGROUND_COLOR } from '@timepick/shared'

/**
 * Factory de test — shell résolu canonique par défaut (Plan B du plan DRY
 * 2026-06-28-email-bg-color-dry). Centralise la construction du resolvedShell
 * mocké pour que l'entrée mock et la sortie rendue proviennent de la MÊME source
 * (mjBody.attrs.backgroundColor = MJ_BODY_BACKGROUND_COLOR), éliminant le mode
 * d'échec vicieux d'une fixture qui embed une valeur divergente du canvas.
 *
 * `mjBody` est invariant (fond usine, paddings '0', origin 'hardcoded') — c'est la
 * propriété clé DRY. Les autres blocks acceptent des overrides (remplacement
 * shallow au niveau racine : on remplace un block entier, pas une fusion profonde).
 */
export function makeDefaultResolvedShell(
  overrides: Partial<Pick<ResolvedShell, 'header' | 'body' | 'footer' | 'contentWrapper'>> = {},
): ResolvedShell {
  return {
    header: {
      contentMjml: '<mj-section><mj-column></mj-column></mj-section>',
      origin: 'template',
    },
    body: {
      contentMjml: '<mj-section><mj-column></mj-column></mj-section>',
      origin: 'template',
    },
    footer: {
      contentMjml: '<mj-section><mj-column></mj-column></mj-section>',
      origin: 'brand',
    },
    mjBody: {
      attrs: { backgroundColor: MJ_BODY_BACKGROUND_COLOR, paddingTop: '0', paddingBottom: '0' },
      origin: 'hardcoded',
    },
    contentWrapper: null,
    ...overrides,
  }
}
