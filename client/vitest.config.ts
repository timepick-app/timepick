import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // Plafonne le pool (défaut = nb de CPU, soit ~10 ici) : limite la RAM et
    // le nombre de forks par instance vitest. Cf. scripts/run-vitest-single.js.
    maxWorkers: 4
  }
})

