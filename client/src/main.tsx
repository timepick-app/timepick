import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'
import i18n from './i18n/config'
import './index.css'
import App from './App.tsx'

// E4 cleanup: evict orphan localStorage keys from deleted POC pages.
// One-shot — gated by 'timepick:e4-cleanup-done' flag so subsequent boots are no-op.
try {
  if (localStorage.getItem('timepick:e4-cleanup-done') === null) {
    localStorage.removeItem('timepick:email-poc:slots')
    localStorage.removeItem('timepick:email-poc-v2:body-mjml')
    localStorage.setItem('timepick:e4-cleanup-done', '1')
  }
} catch {
  // localStorage unavailable (private mode, quota exceeded) — ignore.
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <App />
    </I18nextProvider>
  </StrictMode>,
)
