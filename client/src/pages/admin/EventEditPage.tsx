import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { useNavigate, useLocation, useParams } from 'react-router-dom'
import { FileText, Clock, Users, Mail, BarChart3, Info } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { SlotCalendar } from '@/components/admin/events/SlotCalendar'
import { EventDetailsTab } from '@/components/admin/events/EventDetailsTab'
import type { EventDetailsTabRef } from '@/components/admin/events/EventDetailsTab'
import { EventInvitesTab } from '@/components/admin/events/EventInvitesTab'
import { EventInvitationTemplatePanel } from '@/components/admin/EventInvitationTemplatePanel'
import { BookingsPeaksChart } from '@/components/admin/dashboard/BookingsPeaksChart'
import { InvitationFunnel } from '@/components/admin/dashboard/InvitationFunnel'
import { FillDonut } from '@/components/admin/dashboard/FillDonut'
import { ExportButton } from '@/components/admin/ExportButton'
import { EventEditHeader } from '@/components/admin/events/EventEditHeader'
import { usePublishEvent, useUnpublishEvent, useEventDetails } from '@/hooks/useEvents'
import { useAdminAuth } from '@/hooks/useAdminAuth'
import { useBookingTimestamps, useDashboardEngagement } from '@/hooks/useDashboardAnalytics'
import { useAllEventsStats } from '@/hooks/useStats'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useCompactMode } from '@/hooks/useCompactMode'
import { useCondensedOnScroll } from '@/hooks/useCondensedOnScroll'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Typography } from '@/components/ui/typography'
import { Skeleton } from '@/components/ui/skeleton'

type TabValue = 'details' | 'slots' | 'users' | 'template' | 'stats'

// Valeurs d'onglets valides (constante pour éviter la recréation à chaque rendu)
const VALID_TAB_VALUES: TabValue[] = ['details', 'slots', 'users', 'template', 'stats']

/**
 * EventEditPage — Page d'édition d'un événement existant.
 *
 * Affiche les onglets Détails / Créneaux / Invités / Template / Statistiques
 * pour configurer un événement brouillon ou publié. L'identifiant de l'événement
 * provient du paramètre d'URL `:id`.
 *
 * La création d'événement passe désormais par la Sheet `CreateEventSheet`
 * ouverte depuis `EventsListPage` — il n'y a plus de mode création ici.
 */
export function EventEditPage() {
  const { t } = useTranslation()
  const { id: eventId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()

  // Vérification d'authentification — redirige vers login si non authentifié
  const { isAuthChecked } = useAdminAuth()

  // Refs pour les composants formulaire
  const eventDetailsTabRef = useRef<EventDetailsTabRef>(null)

  // Évite le double toast en React Strict Mode
  const hasShownErrorRef = useRef(false)

  // Hooks de données
  const { data: event, isLoading, error } = useEventDetails(eventId ?? '')
  const { publishEvent, isPublishing } = usePublishEvent()
  const { unpublishEvent, isUnpublishing } = useUnpublishEvent()
  const { data: rawBookings, isLoading: isLoadingBookings, isError: bookingsError } = useBookingTimestamps(eventId)
  const { data: engagement, isLoading: engLoading, isError: engError } = useDashboardEngagement(eventId)
  const { data: eventStats, isLoading: statsLoading, isError: statsError } = useAllEventsStats(eventId)

  // État combiné de mise à jour du statut de publication
  const isUpdatingPublishStatus = isPublishing || isUnpublishing

  // État de l'onglet actif
  const [activeTab, setActiveTab] = useState<TabValue>('details')

  // État de suivi des modifications non sauvegardées
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)

  // Titre du document
  useDocumentTitle({
    title: event?.name ?? (isLoading ? 'Chargement...' : 'Modifier l\'événement')
  })

  // Synchronise l'onglet actif avec le hash de l'URL
  useEffect(() => {
    const hash = location.hash.replace('#', '') as TabValue
    if (hash && VALID_TAB_VALUES.includes(hash)) {
      setActiveTab(hash)
    }
  }, [location.hash])

  // Avertissement navigateur pour les modifications non sauvegardées
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        e.returnValue = ''
        return ''
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  /**
   * Callback après sauvegarde réussie
   */
  const handleUpdateSuccess = () => {
    setHasUnsavedChanges(false)
  }

  /**
   * Gestion du changement d'onglet
   */
  const handleTabChange = useCallback((tab: TabValue) => {
    if (VALID_TAB_VALUES.includes(tab)) {
      setActiveTab(tab)
      window.history.pushState(null, '', `#${tab}`)
    }
  }, [])

  const { ref: tabsRef, compact: compactTabs } = useCompactMode<HTMLDivElement>({
    contentSelector: '[data-measure]',
  })
  const condensed = useCondensedOnScroll()

  const tabItems = useMemo(() => {
    type TabItem = { value: TabValue; label: string; icon: LucideIcon; disabled: boolean }
    const items: TabItem[] = [
      { value: 'details', label: t('tabs.details'), icon: FileText, disabled: false },
      { value: 'slots', label: t('tabs.slots'), icon: Clock, disabled: false },
      { value: 'users', label: t('tabs.users'), icon: Users, disabled: false },
      { value: 'template', label: t('tabs.template'), icon: Mail, disabled: false },
      { value: 'stats', label: t('tabs.stats'), icon: BarChart3, disabled: false },
    ]
    return items
  }, [t])


  /**
   * Gestion du bouton Retour — affiche le dialogue si des modifications sont en cours
   */
  const handleNavigateBack = useCallback(() => {
    if (hasUnsavedChanges) {
      setPendingNavigation('/admin/events')
      setShowUnsavedDialog(true)
    } else {
      navigate('/admin/events')
    }
  }, [hasUnsavedChanges, navigate])

  /**
   * Gestion du bouton Enregistrer — sauvegarde depuis n'importe quel onglet
   */
  const handleSave = useCallback(async () => {
    await eventDetailsTabRef.current?.save()
  }, [])

  /**
   * Gestion du bouton Réinitialiser — réinitialise depuis n'importe quel onglet
   */
  const handleReset = useCallback(() => {
    eventDetailsTabRef.current?.cancel()
  }, [])

  /**
   * Confirme la navigation avec des modifications non sauvegardées
   */
  const handleConfirmLeave = useCallback(async () => {
    setHasUnsavedChanges(false)
    setShowUnsavedDialog(false)
    if (pendingNavigation) {
      navigate(pendingNavigation)
      setPendingNavigation(null)
    }
  }, [pendingNavigation, navigate])

  /**
   * Annule la navigation
   */
  const handleCancelLeave = () => {
    setShowUnsavedDialog(false)
    setPendingNavigation(null)
  }

  // Gestion de l'erreur dans useEffect pour éviter le double toast en React Strict Mode
  useEffect(() => {
    if (error && !hasShownErrorRef.current) {
      hasShownErrorRef.current = true
      toast.error(t('errors.eventNotFound'))
      navigate('/admin/events', { replace: true })
    }
  }, [error, navigate, t])

  // État de chargement — vérification de l'authentification
  if (!isAuthChecked) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AdminLayout>
    )
  }

  // État de chargement
  if (isLoading) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AdminLayout>
    )
  }

  // Retour anticipé si l'événement n'existe pas (après gestion d'erreur dans useEffect)
  if (error || !event) {
    return null
  }

  return (
    <AdminLayout>
      <TooltipProvider>
        <div className="max-w-4xl space-y-6">
          {/* Dialogue de modifications non sauvegardées */}
          <Dialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Modifications non sauvegardées</DialogTitle>
                <DialogDescription>
                  Vous avez des modifications non sauvegardées. Voulez-vous vraiment quitter sans sauvegarder ?
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={handleCancelLeave}>
                  Rester
                </Button>
                <Button
                  variant="outline-destructive"
                  onClick={handleConfirmLeave}
                >
                  Quitter sans sauvegarder
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Onglets */}
          <Tabs value={activeTab} onValueChange={(v) => handleTabChange(v as TabValue)}>
            {/* Wrapper sticky — condense en-tête + onglets au scroll */}
            <div
              className="group/sticky sticky top-[68px] lg:top-0 z-40 bg-background border-b py-3 space-y-4 transition-[padding] duration-200 motion-reduce:transition-none group-data-[condensed]/sticky:py-2"
              data-condensed={condensed || undefined}
            >
              {event && (
                <EventEditHeader
                  event={event}
                  onBack={handleNavigateBack}
                  onSave={handleSave}
                  onReset={handleReset}
                  onPublish={() => eventId && publishEvent(eventId)}
                  onUnpublish={() => eventId && unpublishEvent(eventId)}
                  isUpdating={isUpdatingPublishStatus}
                  hasUnsavedChanges={hasUnsavedChanges}
                />
              )}

              {/* Le ToggleGroup gère lui-même le mode compact : icône + texte réduit
                  sous l'icône quand l'espace se réduit (pas de fallback Select). */}
              <div ref={tabsRef} className="overflow-hidden [contain:inline-size]">
                <ToggleGroup
                  type="single"
                  value={activeTab}
                  onValueChange={(v) => { if (v) handleTabChange(v as TabValue) }}
                  className="inline-flex rounded-md border border-gray-200 p-1 flex-nowrap"
                  aria-label="Sections de l'événement"
                  data-measure
                >
                  {tabItems.map((item) => (
                    <ToggleGroupItem
                      key={item.value}
                      value={item.value}
                      disabled={item.disabled}
                      aria-label={item.label}
                      className={cn(compactTabs ? 'flex-col gap-0.5 px-2 py-1' : 'gap-1.5 px-3 shrink-0')}
                    >
                      <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className={compactTabs ? 'text-[10px] leading-tight' : 'text-sm'}>
                        {item.label}
                      </span>
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            </div>

            {/* Onglet Détails */}
            <TabsContent value="details" forceMount className={cn("mt-6", activeTab !== 'details' && "hidden")}>
              {event ? (
                <EventDetailsTab
                  ref={eventDetailsTabRef}
                  event={event}
                  onSaved={handleUpdateSuccess}
                  onDirtyChange={setHasUnsavedChanges}
                />
              ) : null}
            </TabsContent>

            {/* Onglet Créneaux */}
            <TabsContent value="slots" className="mt-6">
              {eventId ? (
                <SlotCalendar eventId={eventId} />
              ) : (
                <div className="space-y-4">
                  <Skeleton className="h-64 w-full" />
                </div>
              )}
            </TabsContent>

            {/* Onglet Invités — hub fusionné (Drawbridge #42/#43/#44) */}
            <TabsContent value="users" className="mt-6">
              {eventId ? (
                <EventInvitesTab
                  eventId={eventId}
                  isPublished={event?.isPublished}
                />
              ) : (
                <div className="space-y-4">
                  <Skeleton className="h-32 w-full" />
                </div>
              )}
            </TabsContent>

            {/* Onglet Template — éditeur d'email d'invitation */}
            <TabsContent value="template" className="mt-6">
              {eventId ? (
                <EventInvitationTemplatePanel eventId={eventId} />
              ) : (
                <div className="space-y-4">
                  <Skeleton className="h-64 w-full" />
                </div>
              )}
            </TabsContent>

            {/* Onglet Statistiques */}
            <TabsContent value="stats" className="mt-6 space-y-6">
              <div className="flex items-center justify-between">
                <Typography variant="h3" as="h2">Statistiques de l'événement</Typography>
                {event && (
                  <ExportButton
                    eventId={event.id}
                    exportType="reservations"
                  />
                )}
              </div>
              <Card>
                <CardContent className="pt-6">
                  {bookingsError && !rawBookings ? (
                    <Alert variant="warning">
                      <AlertDescription>Impossible de charger les inscriptions.</AlertDescription>
                    </Alert>
                  ) : (
                    <BookingsPeaksChart data={rawBookings} isLoading={isLoadingBookings} />
                  )}
                </CardContent>
              </Card>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-1.5">
                      <CardTitle>Entonnoir des invitations</CardTitle>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" aria-label="Plus d'informations" className="inline-flex text-muted-foreground hover:text-foreground transition-colors">
                            <Info className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          Parcours d'un invité de la réception de l'email à la réservation confirmée, pour cet événement. Chaque barre est relative au nombre total d'invités (100 %).
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {engError ? (
                      <Alert variant="warning"><AlertDescription>Impossible de charger les données d'engagement.</AlertDescription></Alert>
                    ) : engLoading || !engagement ? (
                      <Skeleton className="h-40 w-full" />
                    ) : (
                      <InvitationFunnel engagement={engagement} />
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-1.5">
                      <CardTitle>Répartition des créneaux</CardTitle>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" aria-label="Plus d'informations" className="inline-flex text-muted-foreground hover:text-foreground transition-colors">
                            <Info className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          Créneaux ayant au moins une réservation (Remplis) vs créneaux encore disponibles (Vacants), pour cet événement.
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </CardHeader>
                  <CardContent className="flex justify-center">
                    {statsError ? (
                      <Alert variant="warning"><AlertDescription>Impossible de charger la répartition des créneaux.</AlertDescription></Alert>
                    ) : statsLoading ? (
                      <Skeleton className="h-32 w-32 rounded-full" />
                    ) : (
                      <FillDonut filled={eventStats?.[0]?.filledSlots ?? 0} vacant={eventStats?.[0]?.vacantSlots ?? 0} />
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>

        </div>
      </TooltipProvider>
    </AdminLayout>
  )
}
