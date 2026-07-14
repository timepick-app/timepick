import { useQuery, keepPreviousData } from '@tanstack/react-query'
import api from '../services/api'
import type { BookingTimestamps, EngagementStats, EventActivity } from '../types/analytics'
import { usePollingConfig } from './usePollingConfig'

export const useEventActivity = () =>
  useQuery<EventActivity[]>({
    queryKey: ['analytics', 'event-activity'],
    queryFn: async () => {
      const { data } = await api.get<{ data: EventActivity[] }>('/admin/analytics/event-activity')
      return data.data
    },
    staleTime: 60_000,
    retry: false,
  })

export const useDashboardEngagement = (eventId?: string | null) =>
  useQuery<EngagementStats>({
    queryKey: ['analytics', 'engagement', eventId],
    queryFn: async () => {
      const url = eventId
        ? `/admin/analytics/engagement?event_id=${eventId}`
        : '/admin/analytics/engagement'
      const { data } = await api.get<{ data: EngagementStats }>(url)
      return data.data
    },
    staleTime: 30000,
    retry: false,
  })

/**
 * Horodatages bruts des inscriptions d'un événement (POC pics d'inscription) :
 * nom, date d'ouverture et tableau trié des `bookings.created_at` (epoch ms).
 * Sert de matière première au bucketing côté client (`@/lib/peaks`).
 */
export const useBookingTimestamps = (eventId: string | null | undefined) => {
  const { data: pollingConfig, fallbackInterval } = usePollingConfig()
  const interval = pollingConfig?.interval ?? fallbackInterval

  return useQuery<BookingTimestamps>({
    queryKey: ['analytics', 'bookings-raw', eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data } = await api.get<{ data: BookingTimestamps }>(
        `/admin/analytics/bookings-raw?event_id=${encodeURIComponent(eventId!)}`,
      )
      return data.data
    },
    staleTime: 30_000,
    refetchInterval: interval > 0 ? interval : false,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
    retry: false,
  })
}
