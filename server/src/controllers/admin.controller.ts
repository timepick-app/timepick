import { Request, Response } from 'express'
import { query, getClient } from '../db'
import {
  createUserSchema,
  updateUserSchema,
  formatZodError
} from '../validators/user.validator'
import { ZodError } from 'zod'
import { sendWelcomeInvitation, sendRoleChangedEmail } from '../services/email.service'
import { exportService } from '../services/export.service'
import { invalidateRecoveryCodes } from '../services/recovery.service'
import { configService } from '../services/config.service'
import * as authService from '../services/auth.service'
import { UUID_RE } from '../lib/constants'
import { importUsersCsv, CsvFormatError } from '../services/user-import.service'

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const totalSlotsRes = await query('SELECT COUNT(*) FROM slots')
    const totalBookingsRes = await query('SELECT COUNT(*) FROM bookings')
    const slotsWithBookings = await query(`
      SELECT s.id, s.start_time, s.end_time, s.capacity,
      COUNT(b.user_id)::int as filled
      FROM slots s
      LEFT JOIN bookings b ON s.id = b.slot_id
      GROUP BY s.id
    `)

    // Calculate percentage coverage
    const totalCapacity = slotsWithBookings.rows.reduce((acc: number, row: { capacity: number }) => acc + row.capacity, 0)
    const filledSeats = parseInt(totalBookingsRes.rows[0].count)
    const coverage = totalCapacity > 0 ? (filledSeats / totalCapacity) * 100 : 0

    res.json({
      stats: {
        totalSlots: parseInt(totalSlotsRes.rows[0].count),
        totalBookings: filledSeats,
        coverage: coverage.toFixed(1) + '%',
        totalCapacity
      },
      slots: slotsWithBookings.rows
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server Error' })
  }
}

export const createSlots = async (req: Request, res: Response) => {
  const { slots } = req.body
  if (!Array.isArray(slots)) {
    res.status(400).json({ error: 'Invalid payload' })
    return
  }

  const client = await getClient()
  try {
    await client.query('BEGIN')
    for (const s of slots) {
      await client.query('INSERT INTO slots (start_time, end_time, capacity) VALUES ($1, $2, $3)',
        [s.start, s.end, s.capacity || 2]
      )
    }
    await client.query('COMMIT')
    res.json({ message: 'Slots created' })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error(err)
    res.status(500).json({ error: 'Failed to create slots' })
  } finally {
    client.release()
  }
}

// GET /admin/users - List all users with booking count and pagination
export const getUsers = async (req: Request, res: Response) => {
  try {
    // Parse query parameters
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20))
    const search = (req.query.search as string)?.trim() || ''
    const role = req.query.role as string
    const offset = (page - 1) * limit

    // Build WHERE clause
    const conditions: string[] = []
    const params: (string | number)[] = []
    let paramIndex = 1

    if (search) {
      // Échapper les caractères spéciaux SQL (% et _) pour une recherche littérale
      // L'utilisateur peut utiliser * comme wildcard à la place de %
      // IMPORTANT: échapper d'abord les backslashes, puis % et _
      const escapedSearch = search
        .replace(/\\/g, '\\\\')  // Échapper les backslashes d'abord
        .replace(/%/g, '\\%')    // Échapper % pour recherche littérale
        .replace(/_/g, '\\_')    // Échapper _ pour recherche littérale
        .replace(/\*/g, '%')     // Permettre * comme wildcard (plus intuitif)

      conditions.push(`(u.email ILIKE $${paramIndex} OR u.first_name ILIKE $${paramIndex} OR u.last_name ILIKE $${paramIndex})`)
      params.push(`%${escapedSearch}%`)
      paramIndex++
    }

    if (role && (role === 'user' || role === 'admin')) {
      conditions.push(`u.role = $${paramIndex}`)
      params.push(role)
      paramIndex++
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Get total count
    const countResult = await query(
      `SELECT COUNT(DISTINCT u.id)::int as total FROM users u ${whereClause}`,
      params
    )
    const total = countResult.rows[0].total

    // Get paginated users
    const result = await query(`
      SELECT
        u.id, u.email, u.first_name, u.last_name, u.profession, u.informations, u.phone, u.role, u.created_at, u.updated_at,
        COUNT(b.id)::int as booking_count
      FROM users u
      LEFT JOIN bookings b ON u.id = b.user_id
      ${whereClause}
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset])

    res.json({
      users: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server Error' })
  }
}

// GET /admin/users/export - Export users as CSV
export const exportUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    // Extraire les query params pour les filtres
    const search = (req.query.search as string)?.trim()
    const role = req.query.role as 'user' | 'admin' | undefined

    // Utiliser le service d'export avec les filtres
    const { csvContent, filename } = await exportService.exportUsersCSV({
      search,
      role,
    })

    // Envoyer le CSV avec les bons headers
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(csvContent)
  } catch (err) {
    console.error('[Export Users Error]:', err)
    res.status(500).json({ error: 'Erreur lors de la génération du CSV' })
  }
}

// POST /admin/users/import - Import users from CSV (upsert par email)
export const importUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Aucun fichier reçu' })
      return
    }
    if (req.file.size === 0) {
      res.status(400).json({ error: 'Fichier vide' })
      return
    }
    const content = req.file.buffer.toString('utf-8')
    const dryRun = req.query.dryRun === 'true' || req.body?.dryRun === 'true'
    const sendInvitation = req.query.sendInvitation === 'true' || req.body?.sendInvitation === 'true'
    const result = await importUsersCsv(content, {
      dryRun,
      sendInvitation,
      currentUserId: req.user?.userId,
    })
    if (!dryRun && result.summary.errors > 0) {
      res.status(422).json(result) // rien écrit, rapport d'erreurs
      return
    }
    res.json(result)
  } catch (err) {
    if (err instanceof CsvFormatError) {
      res.status(400).json({ error: err.message })
      return
    }
    console.error('[Import Users Error]:', err)
    res.status(500).json({ error: "Erreur lors de l'import" })
  }
}

// GET /admin/users/:id - Get user details with bookings
export const getUserDetails = async (req: Request, res: Response) => {
  const { id } = req.params

  try {
    // Get user info
    const userResult = await query(`
      SELECT
        u.id, u.email, u.first_name, u.last_name, u.profession, u.informations, u.phone, u.role, u.created_at, u.updated_at,
        COUNT(b.id)::int as booking_count
      FROM users u
      LEFT JOIN bookings b ON u.id = b.user_id
      WHERE u.id = $1
      GROUP BY u.id
    `, [id])

    if (userResult.rows.length === 0) {
      res.status(404).json({ error: 'Utilisateur non trouvé' })
      return
    }

    // Get user's bookings with slot info
    const bookingsResult = await query(`
      SELECT
        b.id, b.slot_id, b.created_at,
        s.start_time, s.end_time,
        e.id AS event_id, e.name AS event_name
      FROM bookings b
      JOIN slots s ON b.slot_id = s.id
      JOIN events e ON s.event_id = e.id
      WHERE b.user_id = $1
      ORDER BY s.start_time DESC
    `, [id])

    res.json({
      ...userResult.rows[0],
      bookings: bookingsResult.rows
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server Error' })
  }
}

// POST /admin/users - Create a new user
export const createUser = async (req: Request, res: Response) => {
  try {
    // Validate input
    const validatedData = createUserSchema.parse(req.body)

    // Check if email already exists
    const existingUser = await query(
      'SELECT id FROM users WHERE email = $1',
      [validatedData.email]
    )

    if (existingUser.rows.length > 0) {
      res.status(409).json({ error: 'Un utilisateur avec cet email existe déjà' })
      return
    }

    // Insert new user
    const result = await query(`
      INSERT INTO users (email, first_name, last_name, profession, informations, phone, role)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, email, first_name, last_name, profession, informations, phone, role, created_at
    `, [
      validatedData.email,
      validatedData.first_name,
      validatedData.last_name || null,
      validatedData.profession || null,
      validatedData.informations || null,
      validatedData.phone || null,
      validatedData.role
    ])

    const createdUser = result.rows[0]

    // Send welcome invitation email if requested
    if (req.body.sendInvitation) {
      const invitationSent = await sendWelcomeInvitation(
        createdUser.email,
        createdUser.first_name,
        createdUser.last_name,
        createdUser.role === 'admin'
      )
      if (!invitationSent) {
        console.error(`[AdminController] Invitation de bienvenue non envoyée pour ${createdUser.email} (transport SMTP indisponible ou rendu échoué ?)`)
      }
    }

    res.status(201).json(createdUser)
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: formatZodError(err) })
      return
    }
    console.error(err)
    res.status(500).json({ error: 'Server Error' })
  }
}

// PUT /admin/users/:id - Update a user
export const updateUser = async (req: Request, res: Response) => {
  const { id } = req.params
  const currentUserId = req.user?.userId

  try {
    // Check if user exists
    const existingUser = await query(
      'SELECT id, role FROM users WHERE id = $1',
      [id]
    )

    if (existingUser.rows.length === 0) {
      res.status(404).json({ error: 'Utilisateur non trouvé' })
      return
    }

    // Validate input
    const validatedData = updateUserSchema.parse(req.body)

    // Check if trying to demote the last admin
    if (existingUser.rows[0].role === 'admin' && validatedData.role === 'user') {
      const adminCount = await query(
        "SELECT COUNT(*) FROM users WHERE role = 'admin'"
      )
      if (parseInt(adminCount.rows[0].count) <= 1) {
        res.status(409).json({ error: 'Impossible de rétrograder le dernier administrateur' })
        return
      }
    }

    // Detect self-demotion (admin changing their own role to user)
    const isSelfDemotion = currentUserId !== undefined &&
                          id === currentUserId &&
                          existingUser.rows[0].role === 'admin' &&
                          validatedData.role === 'user'

    // Build dynamic update query
    const updates: string[] = []
    const values: (string | number | null | undefined)[] = []
    let paramCount = 1

    if (validatedData.first_name !== undefined) {
      updates.push(`first_name = $${paramCount}`)
      values.push(validatedData.first_name)
      paramCount++
    }

    if (validatedData.last_name !== undefined) {
      updates.push(`last_name = $${paramCount}`)
      values.push(validatedData.last_name || null)
      paramCount++
    }

    if (validatedData.profession !== undefined) {
      updates.push(`profession = $${paramCount}`)
      values.push(validatedData.profession || null)
      paramCount++
    }

    if (validatedData.informations !== undefined) {
      updates.push(`informations = $${paramCount}`)
      values.push(validatedData.informations || null)
      paramCount++
    }

    if (validatedData.phone !== undefined) {
      updates.push(`phone = $${paramCount}`)
      values.push(validatedData.phone)
      paramCount++
    }

    if (validatedData.role !== undefined) {
      updates.push(`role = $${paramCount}`)
      values.push(validatedData.role)
      paramCount++
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'Aucune donnée à mettre à jour' })
      return
    }

    values.push(id)
    const result = await query(`
      UPDATE users
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, email, first_name, last_name, profession, informations, phone, role, created_at, updated_at
    `, values)

    // --- Effets de bord du changement de rôle (best-effort, fire-and-forget) ---
    // Convention du code existant (createUser, reservation.service) : l'UPDATE du
    // rôle est déjà committé ; un échec d'effet de bord ne ROLLBACK PAS le rôle et
    // n'empêche pas la réponse 200.
    const previousRole = existingUser.rows[0].role
    const updatedUser = result.rows[0]
    const newRole = updatedUser.role
    const roleChanged = previousRole !== newRole
    const isPromotion = previousRole === 'user' && newRole === 'admin'
    const isDemotion = previousRole === 'admin' && newRole === 'user'

    // Rétrogradation Administrateur → Membre : invalide les codes de secours
    // (hygiène). L'emergency login filtre déjà `AND role = 'admin'`, donc ce
    // n'est pas un correctif d'escalade ; on nettoie simplement.
    if (isDemotion) {
      try {
        await invalidateRecoveryCodes(id)
      } catch (invalidateErr) {
        console.error('[AdminController] Échec invalidation codes de secours (rétrogradation):', invalidateErr)
      }
    }

    // Notification de changement de rôle — opt-in via req.body.sendRoleNotification
    // (PAS dans le schema Zod : paramètre comportemental, pas un champ du modèle —
    // pattern sendInvitation de createUser). Fire-and-forget, jamais bloquant.
    if (roleChanged && req.body.sendRoleNotification === true) {
      // Promotion : lien auto-login dans l'email, en réutilisant le flux
      // magic-link admin existant (TTL adminTTL configurable, 24h par défaut).
      // Best-effort : un échec de génération retombe sur /login (repli interne
      // de sendRoleChangedEmail). Pas de magic-link à la rétrogradation.
      let promotionMagicLink: string | undefined
      if (isPromotion) {
        try {
          const magicLinkConfig = await configService.getMagicLinkConfig()
          const generated = await authService.generateMagicLink({ userId: id, ttl: magicLinkConfig.adminTTL })
          promotionMagicLink = generated.link
        } catch (mlErr) {
          console.error('[AdminController] Échec génération magic-link (promotion ; repli /login):', mlErr)
        }
      }
      sendRoleChangedEmail(updatedUser.email, updatedUser.first_name, updatedUser.last_name, isPromotion ? 'promoted' : 'demoted', promotionMagicLink)
        .catch((notifyErr) => console.error('[AdminController] Échec envoi notification changement de rôle:', notifyErr))
    }

    const responseData = {
      ...result.rows[0],
      selfDemoted: isSelfDemotion,
    }

    res.json(responseData)
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: formatZodError(err) })
      return
    }
    console.error(err)
    res.status(500).json({ error: 'Server Error' })
  }
}

// DELETE /admin/users/:id - Delete a user
export const deleteUser = async (req: Request, res: Response) => {
  const { id } = req.params
  const currentUserId = req.user?.userId

  const client = await getClient()
  try {
    await client.query('BEGIN')

    // Check if user exists (with lock for consistency)
    const existingUser = await client.query(
      'SELECT id, email, role FROM users WHERE id = $1 FOR UPDATE',
      [id]
    )

    if (existingUser.rows.length === 0) {
      await client.query('ROLLBACK')
      res.status(404).json({ error: 'Utilisateur non trouvé' })
      return
    }

    // Prevent self-deletion
    if (id === currentUserId) {
      await client.query('ROLLBACK')
      res.status(409).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' })
      return
    }

    // Prevent deleting the last admin
    if (existingUser.rows[0].role === 'admin') {
      const adminCount = await client.query(
        "SELECT COUNT(*) FROM users WHERE role = 'admin'"
      )
      if (parseInt(adminCount.rows[0].count) <= 1) {
        await client.query('ROLLBACK')
        res.status(409).json({ error: 'Impossible de supprimer le dernier administrateur' })
        return
      }
    }

    // Count bookings that will be deleted (CASCADE) - within same transaction for accuracy
    const bookingCount = await client.query(
      'SELECT COUNT(*) FROM bookings WHERE user_id = $1',
      [id]
    )
    const deletedBookings = parseInt(bookingCount.rows[0].count)

    // Delete user (bookings will be cascade deleted by DB constraint)
    await client.query('DELETE FROM users WHERE id = $1', [id])

    await client.query('COMMIT')

    res.json({
      message: 'Utilisateur supprimé avec succès',
      deletedBookings
    })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error(err)
    res.status(500).json({ error: 'Server Error' })
  } finally {
    client.release()
  }
}

// POST /admin/users/bulk-delete — Bulk-delete users; guard violations become skips (never 409)
export const bulkDeleteUsers = async (req: Request, res: Response) => {
  const { ids } = req.body
  const currentUserId = req.user?.userId

  // Validate body
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id: unknown) => typeof id === 'string')) {
    res.status(400).json({ error: 'ids doit être un tableau non vide de chaînes' })
    return
  }
  if (ids.length > 100) {
    res.status(400).json({ error: 'ids ne peut contenir plus de 100 éléments' })
    return
  }

  // Format UUID requis (colonne uuid) : un id malformé ferait échouer toute la
  // requête en 500 au lieu d'un 400 propre.
  if (!(ids as string[]).every((id) => UUID_RE.test(id))) {
    res.status(400).json({ error: 'ids doit contenir des UUID valides' })
    return
  }

  // Deduplicate to avoid double-counting
  const uniqueIds: string[] = [...new Set(ids as string[])]

  const client = await getClient()
  try {
    await client.query('BEGIN')

    // Lock and fetch all requested users atomically
    const found = await client.query<{ id: string; email: string; role: string }>(
      'SELECT id, email, role FROM users WHERE id = ANY($1) FOR UPDATE',
      [uniqueIds]
    )

    const foundMap = new Map(found.rows.map((u) => [u.id, u]))
    const skipped: Array<{ id: string; email: string | null; reason: 'self' | 'last_admin' | 'not_found' }> = []

    // not_found: ids that don't exist in DB
    for (const id of uniqueIds) {
      if (!foundMap.has(id)) {
        skipped.push({ id, email: null, reason: 'not_found' })
      }
    }

    // self: current user, if present — excluded from deletion
    if (currentUserId && foundMap.has(currentUserId)) {
      const selfUser = foundMap.get(currentUserId)!
      skipped.push({ id: selfUser.id, email: selfUser.email, reason: 'self' })
    }

    // candidates = found users minus self
    const candidates = found.rows.filter((u) => u.id !== currentUserId)

    // Last-admin invariant: ensure at least one admin remains in DB after deletion
    const adminCountResult = await client.query<{ count: string }>(
      "SELECT COUNT(*) FROM users WHERE role = 'admin'"
    )
    const totalAdmins = parseInt(adminCountResult.rows[0].count)
    const adminCandidates = candidates
      .filter((u) => u.role === 'admin')
      .sort((a, b) => a.id.localeCompare(b.id)) // deterministic order
    const adminsAfterDeletion = totalAdmins - adminCandidates.length
    const adminsToProtect = Math.max(0, 1 - adminsAfterDeletion)

    const protectedAdmins = new Set(adminCandidates.slice(0, adminsToProtect).map((u) => u.id))
    for (const u of adminCandidates.slice(0, adminsToProtect)) {
      skipped.push({ id: u.id, email: u.email, reason: 'last_admin' })
    }

    // deletable = candidates minus the protected admins
    const deletable = candidates.filter((u) => !protectedAdmins.has(u.id)).map((u) => u.id)

    let deleted = 0
    let deletedBookings = 0

    if (deletable.length > 0) {
      const bookingCountResult = await client.query<{ count: string }>(
        'SELECT COUNT(*) FROM bookings WHERE user_id = ANY($1)',
        [deletable]
      )
      deletedBookings = parseInt(bookingCountResult.rows[0].count)

      // Bookings cascade-deleted by DB constraint
      await client.query('DELETE FROM users WHERE id = ANY($1)', [deletable])
      deleted = deletable.length
    }

    await client.query('COMMIT')

    res.json({ deleted, deletedBookings, skipped })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error(err)
    res.status(500).json({ error: 'Server Error' })
  } finally {
    client.release()
  }
}
