#!/usr/bin/env node
/**
 * Design System Manifest Generator
 *
 * Reads all `client/src/components/ui/*.meta.ts` files and emits
 * `docs/DESIGN_SYSTEM.md` — an auto-generated, LLM-readable manifest of
 * the design system.
 *
 * Run via: `npm run generate:ds` (uses tsx to load `.meta.ts` at runtime).
 */
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const UI_DIR = join(ROOT, 'client/src/components/ui')
const OUT_DIR = join(ROOT, 'docs')
const OUT_FILE = join(OUT_DIR, 'DESIGN_SYSTEM.md')

async function loadAllMetas() {
  const files = readdirSync(UI_DIR).filter((f) => f.endsWith('.meta.ts') && !f.startsWith('_'))
  const metas = []
  for (const file of files) {
    const url = pathToFileURL(join(UI_DIR, file)).href
    const mod = await import(url)
    const metaExport = Object.values(mod).find(
      (v) => v && typeof v === 'object' && 'name' in v && 'variants' in v,
    )
    if (!metaExport) {
      throw new Error(
        `No meta export found in ${file}. Expected a value with shape { name, variants, ... }.`,
      )
    }
    metas.push(metaExport)
  }
  return metas.sort((a, b) => a.name.localeCompare(b.name))
}

function renderGlobalConventions(gc) {
  const lines = []
  lines.push(`## ${gc.title}`)
  lines.push('')
  lines.push(`> ${gc.intro}`)
  lines.push('')
  for (const section of gc.sections) {
    lines.push(`### ${section.heading}`)
    lines.push('')
    lines.push(section.body)
    lines.push('')
    if (section.examples && section.examples.length) {
      for (const ex of section.examples) {
        lines.push(`**${ex.label}**`)
        lines.push('```tsx')
        lines.push(ex.code)
        lines.push('```')
        lines.push('')
      }
    }
  }
  return lines.join('\n')
}

function renderMeta(meta) {
  const lines = []
  lines.push(`## ${meta.name}`)
  lines.push('')
  lines.push(`**Import:** \`${meta.importPath}\``)
  lines.push('')
  lines.push(meta.summary)
  lines.push('')

  if (meta.variants && meta.variants.length) {
    lines.push('### Variantes')
    lines.push('')
    lines.push("| Nom | Description | Quand l'utiliser |")
    lines.push('|---|---|---|')
    for (const v of meta.variants) {
      lines.push(`| \`${v.name}\` | ${v.description} | ${v.whenToUse ?? '—'} |`)
    }
    lines.push('')
  }

  if (meta.sizes && meta.sizes.length) {
    lines.push('### Sizes')
    lines.push('')
    for (const s of meta.sizes) {
      const css = s.cssHint ? ` (\`${s.cssHint}\`)` : ''
      lines.push(`- \`${s.name}\`${css} — ${s.description}`)
    }
    lines.push('')
  }

  if (meta.extraAxes && meta.extraAxes.length) {
    for (const axis of meta.extraAxes) {
      lines.push(`### Axe : ${axis.name}`)
      lines.push('')
      lines.push(axis.description)
      lines.push('')
      lines.push("| Nom | Description | Quand l'utiliser |")
      lines.push('|---|---|---|')
      for (const item of axis.items) {
        lines.push(`| \`${item.name}\` | ${item.description} | ${item.whenToUse ?? '—'} |`)
      }
      lines.push('')
    }
  }

  if (meta.guidelines && meta.guidelines.length) {
    lines.push('### Bonnes pratiques')
    lines.push('')
    for (const g of meta.guidelines) {
      lines.push(`**${g.rule}**`)
      lines.push('')
      lines.push('✅ Correct :')
      lines.push('```tsx')
      lines.push(g.correct)
      lines.push('```')
      lines.push('')
      lines.push('❌ Incorrect :')
      lines.push('```tsx')
      lines.push(g.wrong)
      lines.push('```')
      lines.push('')
    }
  }

  if (meta.antiPatterns && meta.antiPatterns.length) {
    lines.push('### Anti-patterns')
    lines.push('')
    for (const ap of meta.antiPatterns) {
      lines.push(`- **${ap.title}** — ${ap.description}`)
    }
    lines.push('')
  }

  if (meta.examples && meta.examples.length) {
    lines.push('### Exemples')
    lines.push('')
    for (const e of meta.examples) {
      lines.push(`**${e.label}**`)
      lines.push('```tsx')
      lines.push(e.code)
      lines.push('```')
      lines.push('')
    }
  }

  return lines.join('\n')
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const metas = await loadAllMetas()
  const { globalConventions: globalConv } = await import(pathToFileURL(join(UI_DIR, '_global.meta.ts')).href)
  const header = [
    '# TimePick Design System Manifest',
    '',
    '> ⚠️ **Auto-generated file — généré automatiquement.**',
    '> Ne pas éditer à la main. Source : `client/src/components/ui/*.meta.ts`.',
    '> Régénérer via `npm run generate:ds` (lancé automatiquement au pre-commit via `lint-staged`).',
    '',
    `Généré le : ${new Date().toISOString().split('T')[0]}`,
    `Composants documentés : ${metas.length}`,
    '',
    '---',
    '',
  ].join('\n')
  const globalSection = renderGlobalConventions(globalConv)
  const body = metas.map(renderMeta).join('\n---\n\n')
  writeFileSync(OUT_FILE, header + globalSection + '\n---\n\n' + body, 'utf8')
  console.log(`✓ Manifest written to ${OUT_FILE} (${metas.length} components)`)
}

main().catch((err) => {
  console.error('Manifest generation failed:', err)
  process.exit(1)
})
