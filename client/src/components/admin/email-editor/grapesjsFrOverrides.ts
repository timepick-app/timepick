import frMessages from 'grapesjs/locale/fr'

/**
 * GrapesJS French i18n overrides for the MJML editor.
 *
 * Catalogued by Story 23-0 T6 audit + 2026-06-08 styleManager pass. These
 * MJML-specific overrides are deep-merged ON TOP of the native `fr` locale
 * (`grapesjs/locale/fr`, now actually imported and merged below into
 * `GRAPESJS_FR_MESSAGES`, which is what `grapesjs.init` receives). The native
 * locale covers GrapesJS core (Style Manager properties/sectors, asset
 * manager, panels…); these overrides win on conflict and fill the gaps it
 * leaves in English: MJML `mj-*` names, composite `-sub` sub-labels the core
 * only keys in English, and MJML-only properties absent from fr.js
 * (`background-url`, `container-background-color`).
 *
 * Add new keys here when visual QA surfaces missed strings — overrides can
 * be extended incrementally without breaking anything.
 */
const GRAPESJS_FR_OVERRIDES = {
  blockManager: {
    labels: {
      'mj-image': 'Image',
      'mj-text': 'Texte',
      'mj-button': 'Bouton',
      'mj-divider': 'Séparateur',
      'mj-spacer': 'Espace',
    },
    categories: {
      Basic: 'Base',
      Variables: 'Variables',
    },
  },
  domComponents: {
    names: {
      // Plan 1.5 (2026-05-23) — `mj-body` n'a plus de mapping FR : le nom
      // affiché dans le Layer panel est imposé en anglais (`Frame`) via
      // `name: 'Frame'` dans `addType('mj-body', ...)` (cf. grapesConfig.ts).
      // Les autres entrées restent inchangées (hors scope Plan 1.5).
      // Racine GrapesJS (wrapper) — libellé du nœud sommet du panneau Calques.
      // Surcharge fr.js (`wrapper: 'Corps'`) → « Modèle » : terme parlant pour
      // l'admin (l'enveloppe globale du gabarit) plutôt que le « Corps » générique.
      wrapper: 'Modèle',
      'mj-section': 'Section',
      'mj-column': 'Colonne',
      'mj-button': 'Bouton',
      'mj-text': 'Texte',
      'mj-image': 'Image',
      'mj-divider': 'Séparateur',
      'mj-spacer': 'Espace',
      'mj-wrapper': 'Conteneur',
      'mj-group': 'Groupe',
      'mj-hero': 'Bandeau',
      'mj-navbar': 'Barre de navigation',
      'mj-social': 'Réseaux sociaux',
      'mj-raw': 'HTML brut',
    },
  },
  traitManager: {
    empty: 'Sélectionnez un élément avant de gérer ses propriétés',
    label: 'Propriétés du composant',
    traits: {
      labels: {
        align: 'Alignement',
        'background-color': 'Couleur de fond',
        'border-color': 'Couleur de bordure',
        'border-width': 'Épaisseur de bordure',
        color: 'Couleur',
        'font-family': 'Police',
        'font-size': 'Taille de police',
        'font-weight': 'Graisse',
        href: 'Lien',
        padding: 'Marge interne',
        'padding-top': 'Marge interne (haut)',
        'padding-right': 'Marge interne (droite)',
        'padding-bottom': 'Marge interne (bas)',
        'padding-left': 'Marge interne (gauche)',
        src: 'Source',
        alt: 'Texte alternatif',
        target: 'Cible',
        title: 'Titre',
        width: 'Largeur',
        height: 'Hauteur',
      },
    },
  },
  styleManager: {
    properties: {
      // Sous-labels des composites : le core les clé en `<prop>-sub` et fr.js
      // ne les traduit pas → resteraient anglais. Padding (sections) + arrondis.
      'padding-top-sub': 'Haut',
      'padding-right-sub': 'Droite',
      'padding-bottom-sub': 'Bas',
      'padding-left-sub': 'Gauche',
      'border-top-left-radius-sub': 'Haut gauche',
      'border-top-right-radius-sub': 'Haut droite',
      'border-bottom-left-radius-sub': 'Bas gauche',
      'border-bottom-right-radius-sub': 'Bas droite',
      // Propriétés MJML-spécifiques absentes de fr.js.
      'background-url': 'Image de fond',
      'container-background-color': 'Couleur de fond',
    },
  },
  panels: {
    buttons: {
      titles: {
        preview: 'Aperçu',
        fullscreen: 'Plein écran',
        'sw-visibility': 'Afficher les composants',
        'export-template': 'Voir le code',
        'open-sm': 'Ouvrir le gestionnaire de styles',
        'open-tm': 'Réglages',
        'open-layers': 'Calques',
        'open-blocks': 'Blocs',
      },
    },
  },
  commands: {
    titles: {
      'delete': 'Supprimer',
      'clone': 'Dupliquer',
      'move': 'Déplacer',
    },
  },
  modal: {
    labels: {
      ok: 'OK',
      cancel: 'Annuler',
      save: 'Enregistrer',
      confirm: 'Confirmer',
    },
  },
}

/**
 * Deep-merge récursif (feuilles = chaînes). L'override gagne sur la base.
 */
type MessageTree = { [key: string]: string | MessageTree }
function isMessageTree(value: unknown): value is MessageTree {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function deepMergeMessages(base: MessageTree, override: MessageTree): MessageTree {
  const out: MessageTree = { ...base }
  for (const [key, value] of Object.entries(override)) {
    const existing = out[key]
    out[key] =
      isMessageTree(existing) && isMessageTree(value)
        ? deepMergeMessages(existing, value)
        : value
  }
  return out
}

/**
 * Locale `fr` native de grapesjs (propriétés/secteurs du Style Manager, asset
 * manager, panneaux…) avec nos overrides MJML fusionnés par-dessus (overrides
 * prioritaires). C'est CET objet — et non `GRAPESJS_FR_OVERRIDES` seul — qui
 * est passé à `grapesjs.init({ i18n: { messages: { fr: ... } } })`.
 */
export const GRAPESJS_FR_MESSAGES = deepMergeMessages(
  frMessages as unknown as MessageTree,
  GRAPESJS_FR_OVERRIDES as MessageTree,
)

/**
 * French labels applied to native MJML block items after `curatePalette` runs.
 * GrapesJS' i18n keys for blocks aren't always honored — this is a safety net.
 */
export const FR_BLOCK_LABELS: Record<string, string> = {
  'mj-image': 'Image',
  'mj-text': 'Texte',
  'mj-button': 'Bouton',
  'mj-divider': 'Séparateur',
  'mj-spacer': 'Espace',
}
