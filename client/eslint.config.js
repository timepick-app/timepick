import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

/** Palette Tailwind brute : famille + échelon, avec préfixe de variante (`hover:`) et suffixe d'opacité (`/50`). */
const RAW_PALETTE =
  '(^|[\\s:])(bg|text|border|ring|divide|fill|outline|placeholder|decoration|accent|shadow|from|via|to)' +
  '-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)' +
  '-(50|100|200|300|400|500|600|700|800|900|950)([\\s/]|$)'
const PALETTE_MESSAGE =
  'Palette Tailwind brute dans un className : utiliser un composant ui/ (Banner, Badge, Alert) ou un token sémantique (text-destructive, bg-muted).'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Honore la convention `_` (args/vars/catch volontairement inutilisés)
      // et le strip de prop via rest (`const { asChild, ...props } = ...`).
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      // Confort HMR uniquement (pas de correctness) : autorise les exports de
      // constantes (variants shadcn) et ne bloque pas la CI.
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Règles React-Compiler introduites par eslint-plugin-react-hooks v7 :
      // remontées en avertissement (dette à traiter incrémentalement). Les
      // rules-of-hooks classiques restent en erreur (héritées de recommended).
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      // `any` toléré (surtout mocks de test) mais signalé.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Garde anti-dérive : une couleur de palette brute dans un `className`
      // signale presque toujours une primitive `ui/` refaite à la main. En
      // `warn` comme les règles react-hooks ci-dessus — dette incrémentale.
      // Capte aussi des usages légitimes (icônes, `hover:`) : esquery ne lit
      // pas l'intention, et un filet bruyant vaut mieux qu'un filet troué.
      'no-restricted-syntax': ['warn',
        {
          selector: `JSXAttribute[name.name="className"] Literal[value=/${RAW_PALETTE}/]`,
          message: PALETTE_MESSAGE,
        },
        {
          selector: `JSXAttribute[name.name="className"] TemplateElement[value.raw=/${RAW_PALETTE}/]`,
          message: PALETTE_MESSAGE,
        },
      ],
    },
  },
  {
    // Primitives shadcn vendorées : chaque fichier exporte son objet `cva`
    // (`buttonVariants`, `badgeVariants`…) à côté du composant — pattern shadcn
    // standard. Le fast-refresh de ces fichiers est sans enjeu ; on tait la
    // règle ici plutôt que d'altérer les primitives.
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
      // C'est ICI que la palette brute est légitime : ces fichiers SONT la
      // source des tokens (cva des primitives). Les interdire y serait absurde.
      'no-restricted-syntax': 'off',
    },
  },
  {
    // Pages de démonstration du design system : elles affichent volontairement
    // des exemples « incorrects » colorés pour illustrer les anti-patterns.
    files: ['src/pages/design-system/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
])
