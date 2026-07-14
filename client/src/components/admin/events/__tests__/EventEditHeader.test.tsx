import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TooltipProvider } from '@/components/ui/tooltip'
import { EventEditHeader } from '../EventEditHeader'
import type { Event } from '@/hooks/useEvents'

// Mock react-i18next — mappe les clés eventPublishBanner.* utilisées par le
// header et ses enfants (EventStatusBadge, EventEditActions).
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'eventPublishBanner.draft': 'Brouillon',
        'eventPublishBanner.published': 'Publié',
        'eventPublishBanner.draftHelp': "L'événement sera en brouillon, invisible publiquement",
        'eventPublishBanner.publishedHelp': "L'événement est visible publiquement",
        'eventPublishBanner.save': 'Enregistrer',
        'eventPublishBanner.saving': 'Enregistrement...',
        'eventPublishBanner.publish': 'Publier',
        'eventPublishBanner.unpublish': 'Dépublier',
        'eventPublishBanner.resetChanges': 'Annuler les modifications',
        'eventPublishBanner.draftAriaLabel': 'Publier l\'événement',
        'eventPublishBanner.publishedAriaLabel': 'Dépublier l\'événement',
      }
      return translations[key] || key
    }
  })
}))

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'event-1',
    name: 'Fête de la lune',
    description: null,
    isPublished: false,
    opensAt: null,
    ...overrides,
  } as unknown as Event
}

type HeaderProps = Parameters<typeof EventEditHeader>[0]

function renderHeader(props: Partial<HeaderProps> = {}) {
  const onBack = vi.fn()
  const onSave = vi.fn()
  const onReset = vi.fn()
  const onPublish = vi.fn()
  const onUnpublish = vi.fn()
  const { event: eventProp, ...rest } = props
  const event = eventProp ?? makeEvent()
  render(
    <TooltipProvider>
      <EventEditHeader
        event={event}
        onBack={onBack}
        onSave={onSave}
        onReset={onReset}
        onPublish={onPublish}
        onUnpublish={onUnpublish}
        isUpdating={false}
        hasUnsavedChanges={false}
        {...rest}
      />
    </TooltipProvider>
  )
  return { onBack, onSave, onReset, onPublish, onUnpublish, event }
}

describe('EventEditHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('affiche le nom de l\'événement comme H1 de page', () => {
    renderHeader({ event: makeEvent({ name: 'Fête de la lune' }) })
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent('Fête de la lune')
  })

  it('affiche l\'eyebrow « Modifier l\'événement »', () => {
    renderHeader()
    expect(screen.getByText('Modifier l\'événement')).toBeInTheDocument()
  })

  it('rend le bouton retour avec son aria-label et déclenche onBack au clic', async () => {
    const user = userEvent.setup()
    const { onBack } = renderHeader()
    const back = screen.getByRole('button', { name: 'Retour à la liste des événements' })
    await user.click(back)
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('affiche le chip de statut « Brouillon » quand l\'événement n\'est pas publié', () => {
    renderHeader({ event: makeEvent({ isPublished: false }) })
    expect(screen.getByText('Brouillon')).toBeInTheDocument()
    expect(screen.queryByText('Publié')).not.toBeInTheDocument()
  })

  it('affiche le chip de statut « Publié » quand l\'événement est publié', () => {
    renderHeader({ event: makeEvent({ isPublished: true }) })
    expect(screen.getByText('Publié')).toBeInTheDocument()
    expect(screen.queryByText('Brouillon')).not.toBeInTheDocument()
  })

  it('délègue les actions : boutons Enregistrer et Publier présents (brouillon)', () => {
    renderHeader({ event: makeEvent({ isPublished: false }) })
    expect(screen.getByRole('button', { name: /enregistrer/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /publier/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /dépublier/i })).not.toBeInTheDocument()
  })

  it('délègue les actions : boutons Enregistrer et Dépublier présents (publié)', () => {
    renderHeader({ event: makeEvent({ isPublished: true }) })
    expect(screen.getByRole('button', { name: /enregistrer/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dépublier/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^publier$/i })).not.toBeInTheDocument()
  })

  it('rend le bouton d\'aide sur le statut de publication', () => {
    renderHeader()
    expect(screen.getByRole('button', { name: 'Aide sur le statut de publication' })).toBeInTheDocument()
  })

  describe('Variantes de condensation (classes group-data-[condensed]/sticky)', () => {
    it("le libellé eyebrow reste visible en condensé (pas de classe de masquage)", () => {
      renderHeader()
      const eyebrow = screen.getByText("Modifier l'événement")
      expect(eyebrow).not.toHaveClass('group-data-[condensed]/sticky:hidden')
    })

    it("le bouton d'aide reste visible en condensé (pas de classe de masquage)", () => {
      renderHeader()
      const helpBtn = screen.getByRole('button', { name: 'Aide sur le statut de publication' })
      expect(helpBtn).not.toHaveClass('group-data-[condensed]/sticky:hidden')
    })

    it("le <h1> porte la classe group-data-[condensed]/sticky:text-xl", () => {
      renderHeader({ event: makeEvent({ name: 'Fête de la lune' }) })
      const h1 = screen.getByRole('heading', { level: 1 })
      expect(h1).toHaveClass('group-data-[condensed]/sticky:text-xl')
    })
  })
})
