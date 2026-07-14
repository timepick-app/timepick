/**
 * User TypeScript Interfaces
 * TimePick - Gestion Utilisateurs
 *
 * Note: L'API backend renvoie des données en snake_case depuis la DB,
 * mais le middleware jsonConverter.ts les convertit automatiquement en camelCase.
 * Ces interfaces utilisent donc camelCase (firstName, lastName, createdAt, etc.)
 */
import type { UserRole } from '@timepick/shared'

// ============================================
// Core User Types
// ============================================

export type { UserRole }

export interface User {
  id: string
  email: string
  firstName?: string | null
  lastName?: string | null
  profession?: string | null
  informations?: string | null
  phone?: string | null
  role: UserRole
  /** Accès membre : true si l'utilisateur a au moins une ligne event_users (D6 story 1.4). */
  hasMemberAccess: boolean
  createdAt: string
  updatedAt?: string
  bookingCount?: number
}

interface Booking {
  id: string
  slotId: string
  eventId: string
  eventName: string
  startTime: string
  endTime: string
  createdAt: string
}

export interface UserWithBookings extends User {
  bookings: Booking[]
}

// ============================================
// Input Types for API Calls
// ============================================
// NOTE: Les types d'API utilisent snake_case car le backend attend ce format.
// Les types de réponse (User, etc.) utilisent camelCase car le middleware convertit.

export interface ApiCreateUserInput {
  email: string
  first_name?: string
  last_name?: string | null
  profession?: string | null
  informations?: string | null
  phone?: string
  role?: UserRole
  sendInvitation?: boolean
}

export interface ApiUpdateUserInput {
  first_name?: string | null
  last_name?: string | null
  profession?: string | null
  informations?: string | null
  phone?: string | null
  role?: UserRole
  sendRoleNotification?: boolean
}

/**
 * Corps d'un `PATCH /api/me/profile` (espace membre). Snake_case car le backend
 * attend ce format. NE PAS réutiliser `ApiUpdateUserInput` qui contient `role`/
 * `sendRoleNotification` (admin-only) : `patchMeProfileSchema` les strip côté
 * serveur. Tous les champs optionnels (PATCH partiel).
 */
export interface ApiPatchMyProfileInput {
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  profession?: string | null
  informations?: string | null
}

// ============================================
// Pagination Types
// ============================================

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface PaginatedUsersResponse {
  users: User[]
  pagination: Pagination
}

export interface UsersQueryParams {
  page?: number
  limit?: number
  search?: string
  role?: 'user' | 'admin'
  /** Gater la requête React Query (défaut : true). Permet d'inhiber le chargement initial. */
  enabled?: boolean
}

// ============================================
// Bulk Operations
// ============================================

export type BulkDeleteSkipReason = 'self' | 'last_admin' | 'not_found'

export interface BulkDeleteUsersResult {
  deleted: number
  deletedBookings: number
  skipped: Array<{
    id: string
    email: string | null
    reason: BulkDeleteSkipReason
  }>
}

// ============================================
// Hook Return Types
// ============================================


// ============================================
// Import CSV
// ============================================

type ImportAction = 'create' | 'update' | 'error'
interface ImportRowResult {
  line: number
  email: string
  action: ImportAction
  error?: string
}
interface ImportSummary {
  total: number
  created: number
  updated: number
  invited: number
  errors: number
}
export interface ImportResult {
  summary: ImportSummary
  rows: ImportRowResult[]
}
