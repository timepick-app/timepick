/**
 * Manual mock for `isomorphic-dompurify` (Story 23.1, A4 — closes 22-retro action item).
 *
 * The real `isomorphic-dompurify` pulls in `@exodus/bytes` (an ESM-only package)
 * via jsdom. ts-jest's CJS transform cannot parse the ESM syntax and the
 * suite explodes at import time before the test body runs. The 4 test sites
 * below previously inlined byte-identical `jest.mock('isomorphic-dompurify', () => ({...}))`
 * factories to sidestep this; this file collapses them into Jest's manual-mock
 * convention.
 *
 * Location: `server/src/__mocks__/` (NOT `server/__mocks__/`). Jest's documented
 * convention for `node_modules` packages is the directory adjacent to
 * `node_modules/`, but that location is not picked up under the current
 * `jest.config.js` `roots: ['<rootDir>/src']` setting (smoke-tested per Story
 * 23.1 T1.3 → T1.4 — fallback path documented in 23.1 Dev Notes). Sanitizer
 * correctness is covered separately by `scripts/verify-mjml-sanitizer.mjs`,
 * which exercises the real `isomorphic-dompurify` outside of Jest.
 *
 * Test sites that consume this file via the zero-arg `jest.mock('isomorphic-dompurify')`:
 *   - server/src/__tests__/integration/render-email-healthcheck.test.ts
 *   - server/src/__tests__/integration/email-brand-settings.test.ts
 *   - server/src/__tests__/unit/render-email.service.test.ts
 */

const isomorphicDompurifyMock = {
  sanitize: (html: string): string => html,
}

export default isomorphicDompurifyMock
