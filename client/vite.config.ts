import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
// Version depuis le package.json RACINE — source unique de vérité pour la version.
// Import statique (pas readFileSync) : le fichier entre dans le graphe de la config,
// donc Vite REDÉMARRE le dev server quand la racine change (bump de version) au lieu
// de servir une valeur figée à l'évaluation initiale — 5 jours de dérive constatés
// le 2026-07-26 (dev server du 21/07 affichant 0.30.0 alors que la racine était 0.32.2).
import rootPackageJson from '../package.json'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(rootPackageJson.version),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@timepick/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
})
