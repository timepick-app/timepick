import { query } from '../db'
import { NotFoundError } from '../errors/NotFoundError'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ERROR_CODES } from '@timepick/shared'

/**
 * Interface pour les données de réservation utilisées dans l'export CSV
 * Les données viennent de la DB en snake_case et seront formatées pour le CSV
 */
interface ReservationExportData {
  first_name: string
  last_name: string | null
  email: string
  phone: string | null
  created_at: Date
  start_time: Date
  end_time: Date
  event_name: string
}

/**
 * Interface pour les données d'utilisateur utilisées dans l'export CSV
 */
interface UserExportData {
  email: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  role: string
  profession: string | null
  informations: string | null
}

/**
 * Interface pour les filtres d'export utilisateurs
 */
export interface UserExportFilters {
  search?: string
  role?: 'user' | 'admin'
}

/**
 * Type pour le résultat de l'export CSV
 */
interface ExportResult {
  csvContent: string
  filename: string
  eventName?: string
}


/**
 * UTF-8 BOM pour qu'Excel reconnaisse l'encodage correctement
 * CRITICAL pour Excel français qui sinon affiche des caractères incorrects
 */
const UTF8_BOM = '\uFEFF'

/**
 * Délimiteur CSV pour Excel français
 * Le point-virgule est le standard pour Excel en configuration française
 */
const CSV_DELIMITER = ';'

/**
 * Service d'export de données en CSV
 *
 * Ce service gère la génération de fichiers CSV pour l'export de données
 * depuis la base de données, avec un formatage adapté à Excel français.
 *
 * FORMAT CSV:
 * - Encodage: UTF-8 avec BOM (pour Excel)
 * - Délimiteur: point-virgule (;)
 * - Dates: format français (JJ/MM/AAAA HH:MM)
 */
export const exportService = {
  /**
   * Exporter les réservations d'un événement en CSV
   *
   * Le CSV généré contient:
   * - Nom du participant
   * - Email
   * - Téléphone
   * - Date de réservation
   * - Créneau réservé (date, heure)
   * - Événement
   *
   * @param eventId - UUID de l'événement
   * @returns Objet avec contenu CSV et nom de fichier
   * @throws NotFoundError si l'événement n'existe pas
   */
  async exportEventReservationsCSV(eventId: string): Promise<ExportResult> {
    // Récupérer d'abord le nom de l'événement pour le nom de fichier
    const eventResult = await query(
      'SELECT id, name FROM events WHERE id = $1',
      [eventId]
    )

    if (eventResult.rows.length === 0) {
      throw new NotFoundError('Événement non trouvé', ERROR_CODES.EVENT_NOT_FOUND)
    }

    const eventName = eventResult.rows[0].name as string

    // Récupérer toutes les réservations avec détails utilisateur et créneau
    const result = await query(
      `SELECT
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        b.created_at,
        s.start_time,
        s.end_time,
        e.name as event_name
       FROM bookings b
       JOIN users u ON b.user_id = u.id
       JOIN slots s ON b.slot_id = s.id
       JOIN events e ON s.event_id = e.id
       WHERE e.id = $1
       ORDER BY s.start_time ASC, u.last_name ASC NULLS LAST, u.first_name ASC`,
      [eventId]
    )

    const reservations = result.rows as ReservationExportData[]

    // Générer le CSV
    const csvContent = this.generateReservationsCSV(reservations, eventName)

    // Générer le nom de fichier
    const dateStr = format(new Date(), 'yyyy-MM-dd')
    // Nettoyer le nom de l'événement pour le nom de fichier (remplacer les espaces et caractères spéciaux)
    const sanitizedName = eventName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // retire les diacritiques (é → e, ê → e)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') // retire les underscores de début/fin
      .substring(0, 50) || 'evenement' // garde-fou si le nom n'a aucun caractère alphanumérique
    const filename = `reservations_${sanitizedName}_${dateStr}.csv`

    return {
      csvContent,
      filename,
      eventName,
    }
  },

  /**
   * Exporter les utilisateurs en CSV
   *
   * Format réimportable : en-tête machine (snake_case), rôle brut (user/admin),
   * sans colonnes dérivées (réservations) ni gérées par la DB (date inscription).
   *
   * Colonnes : email, first_name, last_name, phone, role, profession, informations
   * Nom de fichier : AAAA-MM-JJ-utilisateurs.csv
   * @param filters - Filtres optionnels (search, role)
   * @returns Objet avec contenu CSV et nom de fichier
   */
  async exportUsersCSV(filters?: UserExportFilters): Promise<ExportResult> {
    const { search, role } = filters || {}

    // Construire la clause WHERE pour les filtres
    const conditions: string[] = []
    const params: (string | number)[] = []
    let paramIndex = 1

    if (search) {
      // Échapper les caractères spéciaux SQL (% et _) pour une recherche littérale
      // L'utilisateur peut utiliser * comme wildcard à la place de %
      const escapedSearch = search
        .replace(/\\/g, '\\\\')  // Échapper les backslashes d'abord
        .replace(/%/g, '\\%')    // Échapper % pour recherche littérale
        .replace(/_/g, '\\_')    // Échapper _ pour recherche littérale
        .replace(/\*/g, '%')     // Permettre * comme wildcard

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

    // Récupérer les utilisateurs avec filtres
    const result = await query(
      `SELECT
        u.email,
        u.first_name,
        u.last_name,
        u.phone,
        u.role,
        u.profession,
        u.informations
      FROM users u
      ${whereClause}
      ORDER BY u.created_at DESC`,
      params
    )

    const users = result.rows as UserExportData[]

    // Générer le CSV
    const csvContent = this.generateUsersCSV(users)

    // Générer le nom de fichier
    const dateStr = format(new Date(), 'yyyy-MM-dd')
    const filename = `${dateStr}-utilisateurs.csv`

    return {
      csvContent,
      filename,
    }
  },

  /**
   * Générer le contenu CSV pour les utilisateurs
   *
   * Format réimportable : noms de colonnes DB (snake_case), rôle brut (user/admin),
   * sans colonnes dérivées (réservations) ni gérées par la DB (date inscription).
   *
   * En-tête : email;first_name;last_name;phone;role;profession;informations
   *
   * @param users - Liste des utilisateurs
   * @returns Contenu CSV avec BOM UTF-8
   */
  generateUsersCSV(users: UserExportData[]): string {
    // En-têtes CSV (noms de colonnes DB, format réimportable)
    const headers = ['email', 'first_name', 'last_name', 'phone', 'role', 'profession', 'informations']

    // Construire les lignes CSV
    const rows = users.map((user) => {
      return [
        escapeCSVField(user.email),
        escapeCSVField(user.first_name || ''),
        escapeCSVField(user.last_name || ''),
        escapeCSVField(user.phone || ''),
        escapeCSVField(user.role),
        escapeCSVField(user.profession || ''),
        escapeCSVField(user.informations || ''),
      ].join(CSV_DELIMITER)
    })

    // Assembler le CSV avec BOM UTF-8
    return UTF8_BOM + [headers.join(CSV_DELIMITER), ...rows].join('\n')
  },

  /**
   * Générer le contenu CSV pour les réservations
   *
   * @param reservations - Liste des réservations
   * @param eventName - Nom de l'événement
   * @returns Contenu CSV avec BOM UTF-8
   */
  generateReservationsCSV(reservations: ReservationExportData[], eventName: string): string {
    // En-têtes CSV
    const headers = [
      'Prénom',
      'Nom',
      'Email',
      'Téléphone',
      'Date de réservation',
      'Créneau',
      'Événement',
    ]

    // Construire les lignes CSV
    const rows = reservations.map((reservation) => {
      const formattedDate = format(new Date(reservation.created_at), 'dd/MM/yyyy HH:mm', { locale: fr })
      const formattedSlot = `${format(new Date(reservation.start_time), 'dd/MM/yyyy HH:mm', { locale: fr })} - ${format(new Date(reservation.end_time), 'HH:mm', { locale: fr })}`

      return [
        escapeCSVField(reservation.first_name || ''),
        escapeCSVField(reservation.last_name || ''),
        escapeCSVField(reservation.email),
        escapeCSVField(reservation.phone || ''),
        escapeCSVField(formattedDate),
        escapeCSVField(formattedSlot),
        escapeCSVField(eventName),
      ].join(CSV_DELIMITER)
    })

    // Assembler le CSV avec BOM UTF-8
    return UTF8_BOM + [headers.join(CSV_DELIMITER), ...rows].join('\n')
  },

}

/**
 * Échapper un champ CSV selon la RFC 4180
 *
 * Comportement:
 * - Les champs vides (null, undefined, '') sont retournés comme chaîne vide
 * - Si le champ contient le délimiteur (;), des guillemets ou des sauts de ligne,
 *   il est entouré de guillemets et les guillemets internes sont échappés ("")
 *
 * @param field - Valeur du champ (peut être null/undefined)
 * @returns Champ échappé pour CSV, ou chaîne vide si field est falsy
 */
function escapeCSVField(field: string): string {
  if (!field) {
    return ''
  }

  // Si le champ contient le délimiteur, des guillemets ou des sauts de ligne
  if (field.includes(CSV_DELIMITER) || field.includes('"') || field.includes('\n')) {
    // Échapper les guillemets en les doublant (standard CSV RFC 4180)
    const escaped = field.replace(/"/g, '""')
    return `"${escaped}"`
  }

  return field
}
