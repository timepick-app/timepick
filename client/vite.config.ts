import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Read version from root package.json (single source of truth)
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootPackageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf-8')
)

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
