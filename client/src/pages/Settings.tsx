import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AdminLayout } from '@/components/layout/AdminLayout'
import {
  PollingConfigPanel,
  MagicLinkTTLCard,
  SessionTTLCard,
  SmtpConfigPanel,
  EmailSettingsSubtabs,
  VALID_EMAIL_SUBTABS,
  DEFAULT_EMAIL_SUBTAB,
  LEGACY_EMAIL_SUBTAB_REDIRECTS,
  type EmailSubtabId,
} from '@/components/admin'
import { useAdminAuth } from '@/hooks/useAdminAuth'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useCompactMode } from '@/hooks/useCompactMode'
import { Typography } from '@/components/ui/typography'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Calendar, LayoutTemplate, Lock, Mail } from 'lucide-react'
import { cn } from '@/lib/utils'

type TabId = 'calendar' | 'auth' | 'email' | 'email-template'
const VALID_TABS: TabId[] = ['calendar', 'auth', 'email', 'email-template']

const TAB_ITEMS = [
  { value: 'email' as const, label: "Serveur d'email", icon: Mail },
  { value: 'email-template' as const, label: "Modèle d'email", icon: LayoutTemplate },
  { value: 'calendar' as const, label: 'Calendrier', icon: Calendar },
  { value: 'auth' as const, label: 'Authentification', icon: Lock },
]

export default function Settings() {
  const { isAuthChecked } = useAdminAuth()
  useDocumentTitle()
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab')
  const rawSubtab = searchParams.get('subtab')

  // Plan 2 (review EH6) — le redirect subtab legacy n'est appliqué que sous
  // les onglets email/email-template. Sinon une URL accidentelle comme
  // `?tab=brand&subtab=identite-visuelle` réécrirait juste le subtab tout en
  // gardant `tab=brand`, créant une combinaison incohérente.
  const isEmailScopedTab = rawTab === 'email' || rawTab === 'email-template'

  const legacySubtabReplacement: EmailSubtabId | null =
    isEmailScopedTab &&
    rawSubtab !== null &&
    rawSubtab in LEGACY_EMAIL_SUBTAB_REDIRECTS
      ? LEGACY_EMAIL_SUBTAB_REDIRECTS[rawSubtab]
      : null

  const isKnownEmailSubtab =
    rawSubtab !== null &&
    (VALID_EMAIL_SUBTABS.includes(rawSubtab as EmailSubtabId) ||
      legacySubtabReplacement !== null)

  const isLegacyEmailTabUrl = rawTab === 'email' && isKnownEmailSubtab

  const activeTab: TabId = isLegacyEmailTabUrl
    ? 'email-template'
    : VALID_TABS.includes(rawTab as TabId)
      ? (rawTab as TabId)
      : 'email'

  const handleTabChange = (next: TabId) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        params.set('tab', next)
        // Le subtab n'a de sens que sous l'onglet modèle d'email.
        if (next !== 'email-template') params.delete('subtab')
        return params
      },
      { replace: false },
    )
  }

  useEffect(() => {
    if (!isLegacyEmailTabUrl && legacySubtabReplacement === null) return
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        if (isLegacyEmailTabUrl) params.set('tab', 'email-template')
        if (legacySubtabReplacement !== null) {
          params.set('subtab', legacySubtabReplacement)
        }
        return params
      },
      { replace: true },
    )
  }, [isLegacyEmailTabUrl, legacySubtabReplacement, setSearchParams])

  const activeSubtab: EmailSubtabId = VALID_EMAIL_SUBTABS.includes(
    rawSubtab as EmailSubtabId,
  )
    ? (rawSubtab as EmailSubtabId)
    : legacySubtabReplacement ?? DEFAULT_EMAIL_SUBTAB

  const handleSubtabChange = (next: EmailSubtabId) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        params.set('tab', 'email-template')
        params.set('subtab', next)
        return params
      },
      { replace: false },
    )
  }

  const { ref: tabsRef, compact: compactTabs } = useCompactMode<HTMLDivElement>({
    contentSelector: '[data-measure]',
  })

  if (!isAuthChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40">
        <Typography color="muted">Chargement...</Typography>
      </div>
    )
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div ref={tabsRef} className={cn('overflow-hidden [contain:inline-size]')}>
          <ToggleGroup
            type="single"
            value={activeTab}
            onValueChange={(v) => { if (v) handleTabChange(v as TabId) }}
            className="inline-flex rounded-md border border-gray-200 p-1 flex-nowrap"
            aria-label="Sections des paramètres"
            data-measure
          >
            {TAB_ITEMS.map((item) => (
              <ToggleGroupItem
                key={item.value}
                value={item.value}
                aria-label={item.label}
                className={cn(
                  compactTabs ? 'flex-col gap-0.5 px-2 py-1' : 'gap-1.5 px-3 shrink-0',
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className={compactTabs ? 'text-[10px] leading-tight' : 'text-sm'}>
                  {item.label}
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => handleTabChange(v as TabId)}>
          <TabsContent value="calendar" forceMount className={cn('mt-6', activeTab !== 'calendar' && 'hidden')}>
            <PollingConfigPanel />
          </TabsContent>
          <TabsContent value="auth" forceMount className={cn('mt-6', activeTab !== 'auth' && 'hidden')}>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <MagicLinkTTLCard />
              <SessionTTLCard />
            </div>
          </TabsContent>
          <TabsContent value="email" forceMount className={cn('mt-6', activeTab !== 'email' && 'hidden')}>
            <SmtpConfigPanel />
          </TabsContent>
          <TabsContent value="email-template" forceMount className={cn('mt-6', activeTab !== 'email-template' && 'hidden')}>
            <EmailSettingsSubtabs
              activeSubtab={activeSubtab}
              onSubtabChange={handleSubtabChange}
            />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  )
}
