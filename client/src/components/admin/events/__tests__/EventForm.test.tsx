import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EventForm } from '../EventForm'
import type { EventFormRef } from '../EventForm'

// Tiptap/ProseMirror est inutilisable sous jsdom — cf. @/test/mockRichTextEditor.
vi.mock('@/components/ui/rich-text-editor', () => import('@/test/mockRichTextEditor'))

describe('EventForm', () => {
  const defaultProps = {
    isSubmitting: false
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ==========================================
  // Story 18.6: Tests pour interface simplifiée
  // ==========================================

  it('should render name and description fields only (no État field)', () => {
    render(<EventForm {...defaultProps} />)

    expect(screen.getByLabelText(/Nom/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Description/i)).toBeInTheDocument()

    // Story 18.6: Le champ État a été supprimé (géré hors de ce formulaire — EventEditActions en édition / EventCreateBanner en création)
    expect(screen.queryByLabelText(/État/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Brouillon')).not.toBeInTheDocument()
    expect(screen.queryByText('Publié')).not.toBeInTheDocument()
  })

  it('should NOT have onCancel prop - Story 18.6', () => {
    // This test verifies the interface change
    // onCancel has been removed - buttons are handled by parent
    const onFormChange = vi.fn()
    render(<EventForm {...defaultProps} onFormChange={onFormChange} />)

    // Should NOT have an Annuler button inside the form
    expect(screen.queryByRole('button', { name: /Annuler/i })).not.toBeInTheDocument()
  })

  it('should render Date ouverture toggle (OFF by default)', () => {
    render(<EventForm {...defaultProps} />)

    // Le label "Date d'ouverture" est présent
    expect(screen.getByText(/Date d'ouverture/i)).toBeInTheDocument()
    // Le toggle switch pour la date d'ouverture est décoché par défaut
    const toggleButton = screen.getByRole('switch', { name: /Date d'ouverture/i })
    expect(toggleButton).toHaveAttribute('aria-checked', 'false')
  })

  it('should enable datetime input when Date ouverture toggle is ON', async () => {
    const user = userEvent.setup()
    render(<EventForm {...defaultProps} />)

    // Par défaut, le champ datetime est désactivé
    const datetimeInput = screen.getByTestId('opensAt-input')
    expect(datetimeInput).toBeDisabled()

    // Activer le toggle
    const toggleButton = screen.getByRole('switch', { name: /Date d'ouverture/i })
    await user.click(toggleButton)

    // Maintenant le champ est activé
    expect(datetimeInput).not.toBeDisabled()
  })

  // ==========================================
  // Ref-based submission tests (Story 18.6)
  // ==========================================

  it('should expose validate method via ref', async () => {
    const ref = { current: null as EventFormRef | null }
    render(<EventForm ref={ref} {...defaultProps} />)

    // Without name, should return false
    let isValid: boolean | undefined
    act(() => {
      isValid = ref.current?.validate()
    })

    expect(isValid).toBe(false)

    // Should show error message after state update
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/nom de l'événement est requis/i)
    })
  })

  it('should expose submit method via ref', async () => {
    const user = userEvent.setup()
    const ref = { current: null as EventFormRef | null }
    const onFormChange = vi.fn()

    render(<EventForm ref={ref} {...defaultProps} onFormChange={onFormChange} />)

    // Without name, submit should return null
    expect(ref.current?.submit()).toBeNull()

    // Type name
    const nameInput = screen.getByLabelText(/Nom/i)
    await user.type(nameInput, 'Mon Événement')

    // Now submit should return data
    const data = ref.current?.submit()
    expect(data).toEqual({
      name: 'Mon Événement',
      description: '',
      opensAt: null
    })
  })

  it('should expose getData method via ref', async () => {
    const user = userEvent.setup()
    const ref = { current: null as EventFormRef | null }
    const onFormChange = vi.fn()

    render(<EventForm ref={ref} {...defaultProps} onFormChange={onFormChange} />)

    // Initial data
    expect(ref.current?.getData()).toEqual({
      name: '',
      description: '',
      opensAt: null
    })

    // Type name and description
    await user.type(screen.getByLabelText(/Nom/i), 'Test Event')
    await user.type(screen.getByLabelText(/Description/i), 'Test Description')

    expect(ref.current?.getData()).toEqual({
      name: 'Test Event',
      description: 'Test Description',
      opensAt: null
    })
  })

  it('should NOT include isPublished in form data - Story 18.6', async () => {
    const user = userEvent.setup()
    const ref = { current: null as EventFormRef | null }

    render(<EventForm ref={ref} {...defaultProps} />)

    // Type name
    await user.type(screen.getByLabelText(/Nom/i), 'Test Event')

    const data = ref.current?.submit()
    // isPublished should NOT be in the data
    expect(data).not.toHaveProperty('isPublished')
    expect(data).toEqual({
      name: 'Test Event',
      description: '',
      opensAt: null
    })
  })

  // ==========================================
  // onFormChange callback tests
  // ==========================================

  it('should call onFormChange when form data changes', async () => {
    const user = userEvent.setup()
    const onFormChange = vi.fn()

    render(<EventForm {...defaultProps} onFormChange={onFormChange} />)

    // Type name
    await user.type(screen.getByLabelText(/Nom/i), 'A')

    // onFormChange should be called (for each character typed)
    expect(onFormChange).toHaveBeenCalled()
    const lastCall = onFormChange.mock.calls[onFormChange.mock.calls.length - 1][0]
    expect(lastCall.name).toBe('A')
  })

  // ==========================================
  // Disabled state tests
  // ==========================================

  it('should NOT have disabled prop - Story 18.x unified banner', () => {
    // The disabled prop has been removed - form is always editable after creation
    // Use isSubmitting for loading states only
    render(<EventForm {...defaultProps} />)

    // Fields should be enabled by default
    expect(screen.getByLabelText(/Nom/i)).not.toBeDisabled()
    expect(screen.getByLabelText(/Description/i)).not.toBeDisabled()
  })

  it('should disable all fields when isSubmitting is true', () => {
    render(<EventForm {...defaultProps} isSubmitting={true} />)

    expect(screen.getByLabelText(/Nom/i)).toBeDisabled()
    expect(screen.getByLabelText(/Description/i)).toBeDisabled()
    expect(screen.getByRole('switch', { name: /Date d'ouverture/i })).toBeDisabled()
  })

  // ==========================================
  // Validation tests
  // ==========================================

  it('should show validation error when name is empty and validate is called', async () => {
    const ref = { current: null as EventFormRef | null }
    render(<EventForm ref={ref} {...defaultProps} />)

    // Initially no error
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    // Call validate within act
    act(() => {
      ref.current?.validate()
    })

    // Wait for state update
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/nom de l'événement est requis/i)
    })
  })

  it('should hide validation error when user types in name field', async () => {
    const user = userEvent.setup()
    const ref = { current: null as EventFormRef | null }

    render(<EventForm ref={ref} {...defaultProps} />)

    // Trigger error
    act(() => {
      ref.current?.validate()
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    // Type in name field
    await user.type(screen.getByLabelText(/Nom/i), 'Test')

    // Error should be hidden
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  it('should return true from validate when name has content', async () => {
    const user = userEvent.setup()
    const ref = { current: null as EventFormRef | null }

    render(<EventForm ref={ref} {...defaultProps} />)

    // Type name
    await user.type(screen.getByLabelText(/Nom/i), 'Valid Name')

    // Validate should return true
    expect(ref.current?.validate()).toBe(true)
  })

  // ==========================================
  // opensAt date tests
  // ==========================================

  it('should include opensAt in form data when set', async () => {
    const user = userEvent.setup()
    const ref = { current: null as EventFormRef | null }

    render(<EventForm ref={ref} {...defaultProps} />)

    // Type name
    await user.type(screen.getByLabelText(/Nom/i), 'Test Event')

    // Enable date toggle
    const toggleButton = screen.getByRole('switch', { name: /Date d'ouverture/i })
    await user.click(toggleButton)

    const data = ref.current?.getData()
    expect(data?.opensAt).not.toBeNull()
    // Should be a datetime-local format string
    expect(data?.opensAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })

  // ==========================================
  // External error tests (server-side errors)
  // ==========================================

  it('should display external nameError prop when provided', () => {
    render(<EventForm {...defaultProps} nameError="Un événement avec ce nom existe déjà" />)

    expect(screen.getByRole('alert')).toHaveTextContent('Un événement avec ce nom existe déjà')
  })

  it('should apply error styling to name input when nameError is provided', () => {
    render(<EventForm {...defaultProps} nameError="Duplicate name" />)

    const nameInput = screen.getByLabelText(/Nom/i)
    expect(nameInput).toHaveClass('border-destructive')
    expect(nameInput).toHaveAttribute('aria-invalid', 'true')
  })

  it('should clear external error when user types in name field', async () => {
    const user = userEvent.setup()
    const onClearNameError = vi.fn()

    render(<EventForm {...defaultProps} nameError="Duplicate name" onClearNameError={onClearNameError} />)

    // Error is initially shown
    expect(screen.getByRole('alert')).toBeInTheDocument()

    // Type in name field
    await user.type(screen.getByLabelText(/Nom/i), 'New')

    // Callback should be called to clear external error
    expect(onClearNameError).toHaveBeenCalled()
  })
})
