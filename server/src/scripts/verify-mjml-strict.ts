#!/usr/bin/env ts-node
/**
 * Verify MJML strict — Epic 26 / Story 26-0
 *
 * Validates that every MJML source in the repo compiles under
 * `mjml --strict` and contains no `<mj-raw>` (forbidden by the email-shell
 * customization policy).
 *
 * Two invocation modes:
 *
 *   1. CI / manual mode (0 args)
 *      Scans a fixed whitelist of repo paths and validates each.
 *      Exit 0 if all valid, exit 1 on first failure.
 *
 *   2. lint-staged mode (N args)
 *      Each arg is a file path. The validator picks the right strategy
 *      from the path pattern (render-email.service.ts → shell extraction
 *      via __testing__.buildShell; migrations/*.sql → dollar-quoted body
 *      extraction; *.mjml → file as-is).
 *
 * Architecture note (per Story 26-0 Dev Notes): the shell is extracted by
 * importing __testing__.buildShell directly (not by regex on the TS source).
 * This is more robust than re-parsing the template literal in
 * render-email.service.ts:252.
 */

import mjml2html from 'mjml'
import * as fs from 'fs'
import * as path from 'path'
import { __testing__ } from '../services/render-email.service'
import { DATA_PART_KIND_RE } from '../services/mjml-compile.service'
import type { EmailBrandSettings } from '../db/email-brand-settings.db'

const { buildShell } = __testing__

const PROJECT_ROOT = path.resolve(__dirname, '../../..')

// Stub brand for shell validation. Values mirror migration 006 factory
// defaults so they satisfy validateBrandSettings() (HEX_COLOR_RE +
// FONT_STACK_RE + RADIUS bounds in render-email.service.ts validateBrandSettings()).
// The script never touches the DB — buildShell takes the brand by value.
const BRAND_STUB: EmailBrandSettings = {
  logoUrl: null,
  primaryColor: '#18181b',
  buttonTextColor: '#ffffff',
  fontFamily: 'Inter, Arial, sans-serif',
  buttonBorderRadius: 4,
  updatedAt: new Date('2026-01-01T00:00:00Z'),
}

// Repo-relative paths scanned in CI/manual mode. Add to this list when
// new MJML sources are introduced (Epic 26 S1 will add shell_parts seeds,
// 26-1 will register migration 009 here).
const CI_WHITELISTED_PATHS = [
  'server/src/services/render-email.service.ts',
  'server/src/migrations/006_email_refactoring.sql',
]

const MJ_RAW_RE = /<mj-raw\b/i
const MJML_DOLLAR_QUOTED_RE = /\$mjml\$([\s\S]*?)\$mjml\$/g

// Order matches the migration 006 INSERT VALUES list. Used to label
// dollar-quoted bodies with their template_key when reporting failures.
const MIGRATION_006_TEMPLATE_ORDER = [
  'invitation',
  'magic_link_login',
  'magic_link_recovery',
  'reservation_confirmation',
] as const

interface ValidationFinding {
  label: string
  line?: number
  reason: string
}

function findMjRaw(source: string, label: string): ValidationFinding | null {
  const match = MJ_RAW_RE.exec(source)
  if (!match) return null
  const lineNumber = source.slice(0, match.index).split('\n').length
  return {
    label,
    line: lineNumber,
    reason: 'mj-raw forbidden by the email-shell customization policy',
  }
}

async function validateMjmlSource(source: string, label: string): Promise<ValidationFinding[]> {
  const findings: ValidationFinding[] = []
  // Strip le marqueur data-part-kind (policy write-path) : MJML 5.x le rejette
  // en strict. compileMjml le strippe au rendu — on valide donc le MJML
  // réellement compilé (DATA_PART_KIND_RE partagé), pas la source brute.
  const cleaned = source.replace(DATA_PART_KIND_RE, '')

  // 1. Defense-in-depth: explicit <mj-raw> rejection (would normally also
  //    be caught by mjml --strict, but we want a clear policy-level
  //    message rather than a generic "unknown tag" error).
  const rawFinding = findMjRaw(cleaned, label)
  if (rawFinding) findings.push(rawFinding)

  // 2. mjml --strict: in v5, strict-mode errors come back in result.errors;
  //    we treat any entry as a failure (per Story 26-0 Dev Notes).
  try {
    const result = await mjml2html(cleaned, { validationLevel: 'strict' })
    const errors = result.errors ?? []
    for (const err of errors) {
      findings.push({
        label,
        line: typeof err.line === 'number' ? err.line : undefined,
        reason: `mjml strict: ${err.message}${err.tagName ? ` (tag: ${err.tagName})` : ''}`,
      })
    }
  } catch (err) {
    findings.push({
      label,
      reason: `mjml threw: ${err instanceof Error ? err.message : String(err)}`,
    })
  }

  return findings
}

async function validateShellViaBuildShell(filePath: string): Promise<ValidationFinding[]> {
  // Validates the shell wrapper itself, using __testing__.buildShell with
  // the brand stub and a minimal valid body fragment. Catches any shell-
  // level regression introduced by edits to render-email.service.ts.
  const stubBody = '<mj-section><mj-column><mj-text>stub body</mj-text></mj-column></mj-section>'
  const shellSource = buildShell(BRAND_STUB, stubBody)
  return validateMjmlSource(shellSource, `${path.relative(PROJECT_ROOT, filePath)} (shell via __testing__.buildShell)`)
}

function extractMigration006Bodies(sql: string): Array<{ key: string; body: string; offset: number }> {
  const bodies: Array<{ key: string; body: string; offset: number }> = []
  let match: RegExpExecArray | null
  // Reset regex state — the global flag retains lastIndex between calls.
  MJML_DOLLAR_QUOTED_RE.lastIndex = 0
  let index = 0
  while ((match = MJML_DOLLAR_QUOTED_RE.exec(sql)) !== null) {
    const key = MIGRATION_006_TEMPLATE_ORDER[index] ?? `body_${index}`
    bodies.push({ key, body: match[1], offset: match.index })
    index += 1
  }
  return bodies
}

async function validateMigrationSql(filePath: string): Promise<ValidationFinding[]> {
  const sql = fs.readFileSync(filePath, 'utf-8')
  const bodies = extractMigration006Bodies(sql)
  const relPath = path.relative(PROJECT_ROOT, filePath)

  if (bodies.length === 0) {
    // Migration 006 must seed the 4 factory MJML bodies. Zero bodies means
    // someone edited the file and accidentally broke the $mjml$ delimiters
    // — exactly the silent-regression class Epic 26.S0 is built to catch.
    return [{
      label: relPath,
      reason: `expected ${MIGRATION_006_TEMPLATE_ORDER.length} \$mjml\$…\$mjml\$ bodies, found 0 — delimiters lost or extraction regex stale`,
    }]
  }

  if (bodies.length !== MIGRATION_006_TEMPLATE_ORDER.length) {
    return [{
      label: relPath,
      reason: `expected ${MIGRATION_006_TEMPLATE_ORDER.length} \$mjml\$…\$mjml\$ bodies, found ${bodies.length} — extraction regex may be stale`,
    }]
  }

  const findings: ValidationFinding[] = []
  for (const { key, body } of bodies) {
    // Wrap each body in the runtime shell to validate as a full MJML doc.
    // This matches what renderEmail does at send time.
    const fullMjml = buildShell(BRAND_STUB, body)
    findings.push(...(await validateMjmlSource(fullMjml, `${relPath} (body: ${key})`)))
  }
  return findings
}

async function validateStandaloneMjml(filePath: string): Promise<ValidationFinding[]> {
  const source = fs.readFileSync(filePath, 'utf-8')
  return validateMjmlSource(source, path.relative(PROJECT_ROOT, filePath))
}

async function dispatchForPath(absPath: string): Promise<ValidationFinding[]> {
  const normalized = absPath.replace(/\\/g, '/')

  if (normalized.endsWith('/services/render-email.service.ts')) {
    return validateShellViaBuildShell(absPath)
  }
  // Only migration 006 is validated as MJML-bearing today. Other migrations
  // (007 system markers, 008 column drops, future 009 shell_parts seeds)
  // use different SQL quoting / shapes and would trip extractMigration006Bodies
  // with a misleading "extraction regex may be stale" error. Add new
  // migrations here explicitly when their MJML extraction strategy is known.
  if (normalized.endsWith('/migrations/006_email_refactoring.sql')) {
    return validateMigrationSql(absPath)
  }
  if (normalized.endsWith('.mjml')) {
    return validateStandaloneMjml(absPath)
  }

  // Path routed here by lint-staged but unrelated to MJML — silently OK.
  return []
}

function resolveCliArg(arg: string): string {
  if (path.isAbsolute(arg)) return arg
  // Relative paths resolve from the repo root, not process.cwd().
  // npm scripts may `cd server` before invoking us, so cwd is unreliable.
  // lint-staged passes absolute paths anyway; this branch covers manual
  // invocations from the repo root (e.g. `npm run verify:mjml-strict -- server/...`).
  return path.resolve(PROJECT_ROOT, arg)
}

async function main(): Promise<number> {
  const args = process.argv.slice(2)
  const isCiMode = args.length === 0

  const targets: string[] = isCiMode
    ? CI_WHITELISTED_PATHS.map((rel) => path.join(PROJECT_ROOT, rel))
    : args.map(resolveCliArg)

  let exitCode = 0

  for (const target of targets) {
    const relForLog = path.relative(PROJECT_ROOT, target)

    if (!fs.existsSync(target)) {
      console.error(`[verify:mjml-strict] FAIL ${relForLog} — file does not exist`)
      exitCode = 1
      continue
    }

    const findings = await dispatchForPath(target)
    if (findings.length === 0) {
      console.log(`[verify:mjml-strict] OK ${relForLog}`)
      continue
    }

    for (const f of findings) {
      const lineSuffix = typeof f.line === 'number' ? `:${f.line}` : ''
      console.error(`[verify:mjml-strict] FAIL ${f.label}${lineSuffix} — ${f.reason}`)
    }
    exitCode = 1
  }

  return exitCode
}

if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error('[verify:mjml-strict] FATAL', err)
      process.exit(2)
    },
  )
}

// Exported for unit tests (none today; entry kept for future T2 helpers).
export const __testing__verify_mjml_strict__ = {
  validateMjmlSource,
  extractMigration006Bodies,
  validateShellViaBuildShell,
  validateMigrationSql,
  dispatchForPath,
  BRAND_STUB,
}
