import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { toast } from 'sonner'
import type { ReactNode } from 'react'
import { CreateEventSheet } from '../CreateEventSheet'

// --- Mocks ---

const mockNavigate = vi.fn()
const mockCreateEvent = vi.fn()

// react-router-dom : useNavigate mocké directement — pas de contexte Router requis
// (vi.importActual évité : le factory vi.mock est hissé avant les imports statiques)
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('@/hooks/useEvents', () => ({
  useCreateEvent: () => ({
    createEvent: mockCreateEvent,
    isCreating: false,
  }),
}))

// Sheet : portails Radix UI non supportés par jsdom — mock passthrough contrôlé par `open`
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ open, children }: { open: boolean; onOpenChange?: (open: boolean) => void; children: ReactNode }) =>
    open ? <div data-testid="sheet">{children}</div> : null,
  SheetContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SheetHeader: ({ children }: { children: ReactNode }) => <>{children}</>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  SheetFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

// RichTextEditor : ProseMirror incompatible avec jsdom (même mock que EventForm.test.tsx)
vi.mock('@/components/ui/rich-text-editor', () => ({
  RichTextEditor: ({
    id,
    value,
    onChange,
    disabled,
    placeholder,
    'aria-labelledby': ariaLabelledby,
  }: {
    id?: string
    value: string
    onChange: (html: string) => void
    disabled?: boolean
    placeholder?: string
    'aria-labelledby'?: string
  }) => (
    <div>
      <textarea
        id={id}
        aria-labelledby={ariaLabelledby}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  ),
}))

// useMediaQuery : jsdom ne fournit pas window.matchMedia → mock desktop par défaut
vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: vi.fn(() => false),
}))

// --- Tests ---

describe('CreateEventSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rend le formulaire Détails quand la sheet est ouverte', () => {
    render(<CreateEventSheet open={true} onOpenChange={vi.fn()} />)

    expect(screen.getByText('Nouvel événement')).toBeInTheDocument()
    expect(screen.getByLabelText(/Nom/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Créer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument()
  })

  it('ne rend rien quand la sheet est fermée', () => {
    render(<CreateEventSheet open={false} onOpenChange={vi.fn()} />)

    expect(screen.queryByText('Nouvel événement')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Nom/i)).not.toBeInTheDocument()
  })

  it('appelle la mutation avec {name, description, opensAt} et navigue après succès', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    mockCreateEvent.mockResolvedValue({ id: 'event-123', name: 'Mon Événement' })

    render(<CreateEventSheet open={true} onOpenChange={onOpenChange} />)

    await user.type(screen.getByLabelText(/Nom/i), 'Mon Événement')
    await user.click(screen.getByRole('button', { name: 'Créer' }))

    await waitFor(() => {
      expect(mockCreateEvent).toHaveBeenCalledWith({
        name: 'Mon Événement',
        description: '',
        opensAt: null,
      })
      expect(onOpenChange).toHaveBeenCalledWith(false)
      expect(mockNavigate).toHaveBeenCalledWith('/admin/events/event-123/edit')
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
        'Événement créé — ajoutez vos créneaux et invités'
      )
    })
  })

  it('affiche une erreur sur le champ Nom en cas de réponse 409 (nom déjà pris)', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    mockCreateEvent.mockRejectedValue({ response: { status: 409 } })

    render(<CreateEventSheet open={true} onOpenChange={onOpenChange} />)

    await user.type(screen.getByLabelText(/Nom/i), 'Événement existant')
    await user.click(screen.getByRole('button', { name: 'Créer' }))

    await waitFor(() => {
      expect(screen.getByText('Un événement porte déjà ce nom')).toBeInTheDocument()
    })
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(vi.mocked(toast.success)).not.toHaveBeenCalled()
  })

  it('n\'appelle pas la mutation si le formulaire est invalide (nom vide)', async () => {
    const user = userEvent.setup()

    render(<CreateEventSheet open={true} onOpenChange={vi.fn()} />)

    // Cliquer Créer sans remplir le nom — EventForm.submit() retourne null
    await user.click(screen.getByRole('button', { name: 'Créer' }))

    await waitFor(() => {
      expect(mockCreateEvent).not.toHaveBeenCalled()
      expect(screen.getByRole('alert')).toHaveTextContent(/nom.*requis/i)
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('ferme la sheet au clic sur Annuler', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()

    render(<CreateEventSheet open={true} onOpenChange={onOpenChange} />)

    await user.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(mockCreateEvent).not.toHaveBeenCalled()
  })

  it('affiche un toast.error pour une erreur serveur non-409 (ex. 500)', async () => {
    const user = userEvent.setup()
    mockCreateEvent.mockRejectedValue({ response: { status: 500, data: { error: 'Boom' } } })

    render(<CreateEventSheet open={true} onOpenChange={vi.fn()} />)

    await user.type(screen.getByLabelText(/Nom/i), 'Événement valide')
    await user.click(screen.getByRole('button', { name: 'Créer' }))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalled()
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('affiche un toast.error en cas d\'erreur réseau (pas de response)', async () => {
    const user = userEvent.setup()
    mockCreateEvent.mockRejectedValue(new Error('Network Error'))

    render(<CreateEventSheet open={true} onOpenChange={vi.fn()} />)

    await user.type(screen.getByLabelText(/Nom/i), 'Événement valide')
    await user.click(screen.getByRole('button', { name: 'Créer' }))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalled()
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
