/// <reference types="vite/client" />

declare const __APP_VERSION__: string

declare module 'grapesjs/locale/fr' {
  const messages: Record<string, unknown>
  export default messages
}
