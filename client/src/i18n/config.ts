import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import frTranslation from './locales/fr/translation.json'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      fr: {
        translation: frTranslation
      }
    },
    lng: 'fr',
    fallbackLng: 'fr',
    defaultNS: 'translation',
    ns: ['translation'],
    interpolation: {
      escapeValue: false // React already escapes
    },
    react: {
      useSuspense: false // Set to false for simpler integration
    }
  })

export default i18n
