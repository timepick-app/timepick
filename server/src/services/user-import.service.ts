import { parse } from 'csv-parse/sync'
import { query, withTransaction } from '../db'
import { sendWelcomeInvitation } from './email.service'
import {
  importEmailSchema,
  IMPORTABLE_COLUMNS,
  PHONE_RE,
  MAX_LEN,
  type ImportableColumn,
} from '../validators/user-import.validator'

export type ImportAction = 'create' | 'update' | 'error'

export interface ImportRowResult {
  line: number // numéro de ligne CSV (1 = en-tête ; données dès 2)
  email: string
  action: ImportAction
  error?: string // présent uniquement si action === 'error'
}

export interface ImportSummary {
  total: number
  created: number
  updated: number
  invited: number // invitations effectivement envoyées (0 si dryRun ou option off)
  errors: number
}

export interface ImportResult {
  summary: ImportSummary
  rows: ImportRowResult[]
}

/**
 * Erreur de format global (CSV illisible / en-tête manquant) → 400 contrôleur.
 *
 * `technicalCause` porte l'exception d'origine — typiquement celle de
 * `csv-parse`, en anglais. Elle est destinée aux journaux : le `message`, lui,
 * part à l'écran sous `CSV_FORMAT_ERROR`, qui est en liste blanche.
 * (`Error.cause` n'est pas typé sous `target: es2016`.)
 */
export class CsvFormatError extends Error {
  constructor(message: string, public readonly technicalCause?: unknown) {
    super(message)
    this.name = 'CsvFormatError'
  }
}

interface ParsedCsv {
  headers: string[] // en-têtes normalisés (minuscule, trim)
  records: Record<string, string>[]
}

/**
 * Parse un CSV `;`-délimité (Excel FR), BOM optionnel, guillemets RFC 4180.
 * En-têtes normalisés en minuscule. Lève CsvFormatError si illisible.
 */
export function parseUsersCsv(content: string): ParsedCsv {
  if (content.includes('\uFFFD')) {
    throw new CsvFormatError('Encodage non pris en charge : enregistrez le fichier en CSV UTF-8.')
  }
  let headers: string[] = []
  let records: Record<string, string>[]
  try {
    records = parse(content, {
      delimiter: ';',
      bom: true,
      columns: (h: string[]) => {
        headers = h.map((c) => c.trim().toLowerCase())
        return headers
      },
      skip_empty_lines: true,
      trim: true,
      skip_records_with_empty_values: true,
    }) as Record<string, string>[]
  } catch (err) {
    // Ne PAS interpoler `err.message` : il vient de `csv-parse`, il est en
    // anglais et cite des positions internes. `CSV_FORMAT_ERROR` est en liste
    // blanche, donc ce texte atteindrait l'écran tel quel. Le détail technique
    // reste attaché à l'exception, pour les journaux.
    throw new CsvFormatError(
      "Le fichier n'a pas pu être lu. Vérifiez qu'il est séparé par des points-virgules et que chaque ligne a le même nombre de colonnes, puis réessayez.",
      err,
    )
  }
  if (!headers.includes('email')) {
    throw new CsvFormatError('En-tête « email » manquant')
  }
  return { headers, records }
}

interface RowPlan {
  email: string
  action: 'create' | 'update'
  set: Partial<Record<ImportableColumn, string | null>>
  id?: string // id du membre existant (présent pour les updates)
}

/** Libellés FR des colonnes « clearables » pour les messages d'erreur de longueur. */
const CLEARABLE_LABELS: Record<string, string> = {
  last_name: 'Le nom',
  profession: 'La profession',
  informations: 'Les informations',
}

/**
 * Upsert par email depuis un CSV.
 * - dryRun : valide + calcule le rapport SANS écrire (et sans inviter).
 * - sendInvitation : envoie une invitation aux lignes CRÉÉES (best-effort, post-commit).
 * - currentUserId : protège le rôle de l'admin courant.
 * Atomique : ≥ 1 ligne en erreur ⇒ AUCUNE écriture.
 */
export async function importUsersCsv(
  content: string,
  opts: { dryRun: boolean; sendInvitation: boolean; currentUserId: string | undefined }
): Promise<ImportResult> {
  const { headers, records } = parseUsersCsv(content)
  const present = new Set(
    headers.filter((h) =>
      (IMPORTABLE_COLUMNS as readonly string[]).includes(h)
    ) as ImportableColumn[]
  )

  // Existence en 1 requête (emails normalisés).
  const emails = records
    .map((r) => (r.email ?? '').trim().toLowerCase())
    .filter(Boolean)
  const existingRes = emails.length
    ? await query<{ id: string; email: string; role: string }>(
        'SELECT id, email, role FROM users WHERE LOWER(email) = ANY($1)',
        [emails]
      )
    : { rows: [] as { id: string; email: string; role: string }[] }
  const existing = new Map(
    existingRes.rows.map((u) => [u.email.toLowerCase(), u])
  )

  const rows: ImportRowResult[] = []
  const plans: RowPlan[] = []

  const seen = new Set<string>()

  records.forEach((rec, i) => {
    const line = i + 2 // ligne 1 = en-tête
    const parsedEmail = importEmailSchema.safeParse(rec.email ?? '')
    if (!parsedEmail.success) {
      rows.push({
        line,
        email: (rec.email ?? '').trim(),
        action: 'error',
        error: parsedEmail.error.issues[0].message,
      })
      return
    }
    const email = parsedEmail.data.toLowerCase()
    if (seen.has(email)) {
      rows.push({ line, email, action: 'error', error: 'Email en double dans le fichier' })
      return
    }
    seen.add(email)
    const found = existing.get(email)
    const action: 'create' | 'update' = found ? 'update' : 'create'
    const set: Partial<Record<ImportableColumn, string | null>> = {}
    let rowError: string | null = null

    const get = (col: ImportableColumn): string | undefined =>
      present.has(col) ? (rec[col] ?? '').trim() : undefined

    // role
    const role = get('role')
    if (role !== undefined && role !== '') {
      if (role !== 'user' && role !== 'admin') {
        rowError = 'Le rôle doit être "user" ou "admin"'
      } else if (found && found.id === opts.currentUserId && role !== found.role) {
        rowError = "Vous ne pouvez pas modifier votre propre rôle via l'import"
      } else if (action === 'create') {
        set.role = role
      } else if (role !== found!.role) {
        set.role = role // changement de rôle d'un AUTRE membre (user↔admin)
      }
    } else if (action === 'create') {
      set.role = 'user' // défaut
    }

    // first_name
    const firstName = get('first_name')
    if (action === 'create') {
      if (!firstName) rowError = rowError ?? 'Le prénom est requis'
      else if (firstName.length > MAX_LEN.first_name)
        rowError = rowError ?? `Le prénom ne peut pas dépasser ${MAX_LEN.first_name} caractères`
      else set.first_name = firstName
    } else if (firstName !== undefined && firstName !== '') {
      if (firstName.length > MAX_LEN.first_name)
        rowError = rowError ?? `Le prénom ne peut pas dépasser ${MAX_LEN.first_name} caractères`
      else set.first_name = firstName
    }
    // update + first_name vide → on ne touche pas (champ requis non clobbéré)

    // colonnes texte « clearables »
    for (const col of ['last_name', 'profession', 'informations'] as ImportableColumn[]) {
      const v = get(col)
      if (v === undefined) continue // en-tête absent → ne pas toucher
      if (v.length > MAX_LEN[col]) {
        rowError = rowError ?? `${CLEARABLE_LABELS[col]} ne peut pas dépasser ${MAX_LEN[col]} caractères`
        continue
      }
      set[col] = v === '' ? null : v
    }

    // phone
    const phone = get('phone')
    if (phone !== undefined) {
      if (phone === '') set.phone = null
      else if (!PHONE_RE.test(phone)) rowError = rowError ?? 'Format de téléphone invalide'
      else set.phone = phone
    }

    if (rowError) {
      rows.push({ line, email, action: 'error', error: rowError })
      return
    }
    rows.push({ line, email, action })
    plans.push({ email, action, set, id: found?.id })
  })

  let invited = 0
  const summary: ImportSummary = {
    total: records.length,
    created: rows.filter((r) => r.action === 'create').length,
    updated: rows.filter((r) => r.action === 'update').length,
    invited: 0,
    errors: rows.filter((r) => r.action === 'error').length,
  }

  // Écriture seulement si demandée ET sans erreur (atomique).
  // NB : les identifiants de colonnes proviennent du whitelist IMPORTABLE_COLUMNS
  // (jamais d'entrée utilisateur) → interpolation sûre ; les VALEURS sont paramétrées.
  if (!opts.dryRun && summary.errors === 0 && plans.length > 0) {
    await withTransaction(async (client) => {
      for (const p of plans) {
        if (p.action === 'create') {
          const cols = ['email', ...Object.keys(p.set)]
          const vals = [p.email, ...Object.values(p.set)]
          const placeholders = cols.map((_, idx) => `$${idx + 1}`)
          await client.query(
            `INSERT INTO users (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`,
            vals
          )
        } else {
          const setCols = Object.keys(p.set)
          if (setCols.length === 0) continue // rien à mettre à jour
          const assignments = setCols.map((c, idx) => `${c} = $${idx + 1}`)
          const vals = [...Object.values(p.set), p.id]
          await client.query(
            `UPDATE users SET ${assignments.join(', ')} WHERE id = $${setCols.length + 1}`,
            vals
          )
        }
      }
    })

    // Invitations APRÈS commit, best-effort (un échec e-mail n'annule pas l'import).
    if (opts.sendInvitation) {
      for (const p of plans) {
        if (p.action !== 'create') continue
        try {
          const sent = await sendWelcomeInvitation(
            p.email,
            p.set.first_name ?? null,
            p.set.last_name ?? null,
            p.set.role === 'admin'
          )
          if (sent) invited++
          else console.error(`[Import] Invitation non envoyée pour ${p.email} (transport SMTP indisponible ?)`)
        } catch (err) {
          console.error(`[Import] Invitation échouée pour ${p.email}:`, err)
        }
      }
    }
  }

  return { summary: { ...summary, invited }, rows }
}
