import { useState, useEffect } from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { SheetShell } from './SheetShell'
import api from '../services/api'
import type { UserWithBookings } from '../types/user'
import { formatFullName } from '@/lib/formatFullName'
import { userFacingErrorMessage } from '@/lib/userFacingErrorMessage'
import { getInitials } from '@/lib/getInitials'
import { Link } from 'react-router-dom'
import { isMultiDaySlot, formatSlotRangeCompact } from '@/lib/utils'
import { Ticket } from 'lucide-react'
import { Typography } from '@/components/ui/typography'

export interface UserDetailsModalProps {
  userId: string
  onClose: () => void
}

export const UserDetailsModal = ({ userId, onClose }: UserDetailsModalProps) => {
  const [user, setUser] = useState<UserWithBookings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchUser = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await api.get(`/admin/users/${userId}`)
        setUser(res.data)
      } catch (err) {
        setError(userFacingErrorMessage(err, 'Le chargement des informations du membre a échoué. Réessayez.'))
      } finally {
        setLoading(false)
      }
    }
    fetchUser()
  }, [userId])

  return (
    <SheetShell open onOpenChange={(o) => { if (!o) onClose() }} title="Détails du membre">
      <div>
        {loading && (
          <div className="text-center py-8 text-muted-foreground">Chargement...</div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!loading && !error && !user && (
          <p className="text-sm text-muted-foreground">Aucune donnée disponible.</p>
        )}

        {user && !loading && (
          <div className="space-y-6">
            {/* User Profile */}
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                  {getInitials(user.firstName ?? '', user.lastName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h4 className="text-xl font-semibold text-foreground truncate">
                  {formatFullName(user.firstName, user.lastName) || 'Sans nom'}
                </h4>
                <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                <Badge variant={user.role === 'admin' ? 'default' : 'success'} size="sm" className="mt-1">
                  {user.role === 'admin' ? 'Administrateur' : 'Membre'}
                </Badge>
              </div>
            </div>

            {/* User Info */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Téléphone</span>
                <p className="font-medium text-foreground">{user.phone || '-'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Inscrit le</span>
                <p className="font-medium text-foreground">
                  {format(new Date(user.createdAt), 'dd MMMM yyyy', { locale: fr })}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Total réservations</span>
                <p className="font-medium text-foreground">{user.bookingCount ?? 0}</p>
              </div>
              {user.profession && (
                <div>
                  <span className="text-muted-foreground">Profession</span>
                  <p className="font-medium text-foreground">{user.profession}</p>
                </div>
              )}
            </div>

            {user.informations && (
              <div className="text-sm">
                <span className="text-muted-foreground">Informations</span>
                <p className="font-medium text-foreground whitespace-pre-wrap">{user.informations}</p>
              </div>
            )}

            {/* Bookings List */}
            <div>
              <h5 className="text-sm font-medium text-foreground mb-3">Historique des réservations</h5>
              {user.bookings && user.bookings.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {user.bookings.map(booking => {
                    const isMulti = isMultiDaySlot(booking.startTime, booking.endTime)
                    return (
                      <div key={booking.id} className="flex items-center justify-between gap-2 py-2 px-3 bg-muted rounded-md">
                        <Link
                          to={`/admin/events/${booking.eventId}/edit`}
                          title={booking.eventName}
                          aria-label={booking.eventName}
                          className="min-w-0 flex-1 truncate text-sm font-medium text-foreground hover:underline"
                        >
                          {booking.eventName}
                        </Link>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {isMulti
                            ? formatSlotRangeCompact(booking.startTime, booking.endTime)
                            : `${format(new Date(booking.startTime), 'EEE d MMM', { locale: fr })} · ${formatSlotRangeCompact(booking.startTime, booking.endTime)}`}
                        </span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-6 px-4 bg-muted/50 rounded-lg border border-dashed border-border">
                  <Ticket className="mx-auto h-8 w-8 text-muted-foreground" />
                  <Typography variant="body-sm" color="muted" className="mt-1">
                    Aucune réservation
                  </Typography>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </SheetShell>
  )
}
