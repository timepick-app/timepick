import { useState, useMemo } from 'react'
import { useUsers } from '../../hooks/useUsers'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Typography } from '../ui/typography'
import { Checkbox } from '../ui/checkbox'
import { formatFullName } from '@/lib/formatFullName'

interface UserMultiSelectProps {
  eventId: string
  selectedUserIds: string[]
  onSelectionChange: (userIds: string[]) => void
  disabled?: boolean
}

/**
 * UserMultiSelect Component
 * Composant de sélection multiple d'invités avec recherche
 * Permet de sélectionner les invités pour un événement
 */
export function UserMultiSelect({ selectedUserIds, onSelectionChange, disabled }: UserMultiSelectProps) {
  // Récupérer tous les utilisateurs (sans pagination pour la sélection)
  const { users, loading } = useUsers({ limit: 1000 })
  const [searchQuery, setSearchQuery] = useState('')

  // Filtrer les utilisateurs par recherche
  const filteredUsers = useMemo(() => {
    if (!users) return []
    const query = searchQuery.toLowerCase()
    return users.filter((u) =>
      formatFullName(u.firstName, u.lastName).toLowerCase().includes(query) ||
      u.email?.toLowerCase().includes(query)
    )
  }, [users, searchQuery])

  // État de sélection pour chaque utilisateur
  const isSelected = (userId: string) => selectedUserIds.includes(userId)

  // Toggle sélection d'un utilisateur
  const toggleUser = (userId: string) => {
    if (isSelected(userId)) {
      onSelectionChange(selectedUserIds.filter((id) => id !== userId))
    } else {
      onSelectionChange([...selectedUserIds, userId])
    }
  }

  // Sélectionner/désélectionner tout
  const toggleSelectAll = () => {
    const visibleIds = filteredUsers.map((u) => u.id)
    if (visibleIds.length > 0 && visibleIds.every((id) => isSelected(id))) {
      // Tout désélectionner
      onSelectionChange(selectedUserIds.filter((id) => !visibleIds.includes(id)))
    } else {
      // Tout sélectionner (sans doublons)
      const newSelection = [...new Set([...selectedUserIds, ...visibleIds])]
      onSelectionChange(newSelection)
    }
  }

  const allVisibleSelected = filteredUsers.length > 0 &&
    filteredUsers.every((u) => isSelected(u.id))

  if (loading) {
    return <div className="p-4 text-center text-gray-500">Chargement...</div>
  }

  return (
    <div className="space-y-4">
      {/* Header avec badge de progression */}
      <Typography variant="h3" as="h2" className="mb-3 flex items-center gap-2">
        Sélection des invités
        {users && users.length > 0 && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
            {selectedUserIds.length}/{users.length}
          </span>
        )}
      </Typography>
      {/* Recherche et actions */}
      <div className="flex gap-2">
        <Input
          type="search"
          size="sm"
          placeholder="Rechercher par nom ou email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          disabled={disabled}
          className="flex-1"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={toggleSelectAll}
          disabled={disabled || filteredUsers.length === 0}
        >
          {allVisibleSelected ? 'Tout désélectionner' : 'Sélectionner tout'}
        </Button>
      </div>

      {/* Liste des invités */}
      <div className="border border-gray-200 rounded-md max-h-64 overflow-y-auto">
        {filteredUsers.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            {searchQuery ? 'Aucun invité trouvé' : 'Les invités apparaîtront ici'}
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {filteredUsers.map((user) => (
              <li key={user.id} className="flex items-center px-4 py-2 hover:bg-gray-50">
                <Checkbox
                  id={`user-${user.id}`}
                  checked={isSelected(user.id)}
                  onCheckedChange={() => toggleUser(user.id)}
                  disabled={disabled}
                />
                <label
                  htmlFor={`user-${user.id}`}
                  className={`ml-3 flex-1 cursor-pointer ${disabled ? 'opacity-50' : ''}`}
                >
                  <div className="text-sm font-medium text-gray-900">
                    {formatFullName(user.firstName, user.lastName) || 'Sans nom'}
                  </div>
                  <div className="text-xs text-gray-500">
                    {user.email}
                  </div>
                </label>
                <span className="ml-2 text-xs px-2 py-1 bg-gray-100 rounded text-gray-600">
                  {user.role}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

    </div>
  )
}
