import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { UserModal } from '@/components/UserModal'
import { DeleteConfirmModal } from '@/components/DeleteConfirmModal'
import { UserDetailsModal } from '@/components/UserDetailsModal'
import { ExportButton, ImportUsersDialog } from '@/components/admin'
import { UsersDataTable } from '@/components/admin/users/UsersDataTable'
import { useUsers, useDeleteUser } from '@/hooks/useUsers'
import { useDebounce } from '@/hooks/useDebounce'
import { toast } from 'sonner'
import { useAdminAuth } from '@/hooks/useAdminAuth'
import { useAuth } from '@/hooks/useAuth'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { Button } from '@/components/ui/button'
import { Typography } from '@/components/ui/typography'
import { Badge } from '@/components/ui/badge'
import { UserPlus } from 'lucide-react'
import type { User, ApiCreateUserInput, ApiUpdateUserInput } from '@/types/user'

export default function Users() {
  const navigate = useNavigate()
  const { isAuthChecked } = useAdminAuth()
  const { user: currentUser, logout } = useAuth()
  useDocumentTitle()

  // User management state
  const [showUserModal, setShowUserModal] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [deletingUser, setDeletingUser] = useState<User | null>(null)
  const [viewingUserId, setViewingUserId] = useState<string | null>(null)

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearchQuery = useDebounce(searchQuery, 300)
  const [roleFilter, setRoleFilter] = useState<'' | 'user' | 'admin'>('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // React Query hook
  const {
    users,
    loading: usersLoading,
    error: usersError,
    pagination,
    createUser,
    updateUser,
    refetch,
  } = useUsers({
    page: currentPage,
    limit: pageSize,
    search: debouncedSearchQuery.trim() || undefined,
    role: roleFilter || undefined,
  })

  const { mutate: deleteUser, isPending: isDeletingUser } = useDeleteUser()

  // Reset à la page 1 quand un filtre change. Ajustement pendant le rendu plutôt
  // qu'un setState dans un effet : évite le double rendu. (isAuthChecked conserve le
  // comportement d'origine ; les filtres ne changent pas avant l'auth de toute façon.)
  const [prevFilters, setPrevFilters] = useState({ search: debouncedSearchQuery, role: roleFilter })
  if (debouncedSearchQuery !== prevFilters.search || roleFilter !== prevFilters.role) {
    setPrevFilters({ search: debouncedSearchQuery, role: roleFilter })
    if (isAuthChecked) {
      setCurrentPage(1)
    }
  }

  // Recale la page si elle sort de la plage (suppression vidant la dernière
  // page). Ajustement pendant le rendu, comme le reset de filtre ci-dessus.
  if (pagination && pagination.totalPages >= 1 && currentPage > pagination.totalPages) {
    setCurrentPage(pagination.totalPages)
  }

  const handleCreateUser = async (data: ApiCreateUserInput | ApiUpdateUserInput) => {
    await createUser(data as ApiCreateUserInput)
    toast.success('Membre créé avec succès')
  }

  const handleUpdateUser = async (data: ApiCreateUserInput | ApiUpdateUserInput) => {
    if (!editingUser) return

    const response = await updateUser(editingUser.id, data as ApiUpdateUserInput)

    // Check if self-demotion occurred (response contains selfDemoted flag)
    if (response?.selfDemoted) {
      // Show confirmation toast before logging out
      toast.success('Votre rôle a été modifié. Vous allez être déconnecté...')
      // Small delay to let the toast be seen before logout
      setTimeout(() => {
        logout()
        navigate('/', { replace: true })
      }, 1500)
      return
    }

    toast.success('Membre modifié avec succès')
  }

  const handleDeleteUser = async () => {
    if (!deletingUser) return
    try {
      await new Promise<void>((resolve, reject) => {
        deleteUser(deletingUser.id, {
          onSuccess: () => {
            // Le toast est déjà affiché par useDeleteUser (useUsers.ts ligne 30)
            resolve()
          },
          onError: (err: Error) => reject(err)
        })
      })
      setDeletingUser(null)
    } catch {
      // L'erreur est déjà gérée par le hook useDeleteUser (toast affiché)
    }
  }

  const openCreateModal = () => {
    setEditingUser(null)
    setShowUserModal(true)
  }

  const openEditModal = useCallback((user: User) => {
    setEditingUser(user)
    setShowUserModal(true)
  }, [])

  const closeUserModal = () => {
    setShowUserModal(false)
    setEditingUser(null)
  }

  const handlePaginationChange = (next: { pageIndex: number; pageSize: number }) => {
    if (next.pageSize !== pageSize) {
      setPageSize(next.pageSize)
      setCurrentPage(1)
    } else {
      setCurrentPage(next.pageIndex + 1)
    }
  }

  if (!isAuthChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40">
        <Typography color="muted">Chargement...</Typography>
      </div>
    )
  }

  const memberTotal = pagination?.total ?? users.length

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* En-tête de page : actions primaires hors de la data-table (h-9). */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <Badge variant="default">
              {memberTotal} {memberTotal > 1 ? 'membres' : 'membre'}
            </Badge>
            <Typography variant="body-sm" color="muted">
              Gérez les comptes et les accès des membres
            </Typography>
          </div>
          <div className="flex flex-wrap justify-end gap-2 max-sm:[&>button]:flex-1">
            <ImportUsersDialog disabled={usersLoading} />
            <ExportButton
              exportType="users"
              filters={{
                search: debouncedSearchQuery.trim() || undefined,
                role: roleFilter || undefined,
              }}
              disabled={usersLoading}
            />
            <Button onClick={openCreateModal}>
              <UserPlus />
              Nouveau membre
            </Button>
          </div>
        </div>

        <UsersDataTable
          users={users}
          pageIndex={currentPage - 1}
          pageSize={pageSize}
          pageCount={pagination?.totalPages ?? 1}
          isLoading={usersLoading}
          error={usersError}
          onRetry={refetch}
          search={searchQuery}
          onSearchChange={setSearchQuery}
          role={roleFilter}
          onRoleChange={setRoleFilter}
          onPaginationChange={handlePaginationChange}
          onEdit={openEditModal}
          onViewDetails={setViewingUserId}
          onDelete={setDeletingUser}
        />

        {/* Modals */}
        {showUserModal && (
          <UserModal
            mode={editingUser ? 'edit' : 'create'}
            user={editingUser || undefined}
            currentUser={currentUser}
            onSave={editingUser ? handleUpdateUser : handleCreateUser}
            onClose={closeUserModal}
          />
        )}
        {deletingUser && (
          <DeleteConfirmModal
            user={deletingUser}
            onConfirm={handleDeleteUser}
            onCancel={() => setDeletingUser(null)}
            isLoading={isDeletingUser}
          />
        )}
        {viewingUserId && (
          <UserDetailsModal
            userId={viewingUserId}
            onClose={() => setViewingUserId(null)}
          />
        )}
      </div>
    </AdminLayout>
  )
}
