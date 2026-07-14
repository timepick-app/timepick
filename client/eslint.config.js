import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

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
    },
  },
])
