import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Users } from 'lucide-react'
import { OnboardingStepCard } from '../OnboardingStepCard'

describe('OnboardingStepCard', () => {
  it("state 'active' → classes bg-blue-50 text-blue-900", () => {
    const { getByTestId } = render(
      <OnboardingStepCard
        data-testid="step"
        icon={Users}
        title="Ajoutez vos membres"
        state="active"
        eyebrow="Étape 1"
      />
    )
    expect(getByTestId('step')).toHaveClass('bg-blue-50', 'text-blue-900')
  })

  it("state 'todo' → classes bg-blue-50 text-blue-900", () => {
    const { getByTestId } = render(
      <OnboardingStepCard
        data-testid="step"
        icon={Users}
        title="Ajoutez vos membres"
        state="todo"
        eyebrow="Étape 1"
      />
    )
    expect(getByTestId('step')).toHaveClass('bg-blue-50', 'text-blue-900')
  })

  it("state 'done' → classes bg-muted text-muted-foreground et affiche le recap", () => {
    const { getByTestId } = render(
      <OnboardingStepCard
        data-testid="step"
        icon={Users}
        title="Ajoutez vos membres"
        state="done"
        recap="40 membres ajoutés"
        eyebrow="Étape 1"
      />
    )
    expect(getByTestId('step')).toHaveClass('bg-muted', 'text-muted-foreground')
    expect(screen.getByText('40 membres ajoutés')).toBeInTheDocument()
  })

  it("le recap n'est PAS affiché si state !== 'done'", () => {
    render(
      <OnboardingStepCard
        icon={Users}
        title="Ajoutez vos membres"
        state="active"
        recap="40 membres ajoutés"
        eyebrow="Étape 1"
      />
    )
    expect(screen.queryByText('40 membres ajoutés')).not.toBeInTheDocument()
  })

  it("l'icône svg porte la classe mx-auto", () => {
    const { container } = render(
      <OnboardingStepCard
        icon={Users}
        title="Ajoutez vos membres"
        state="active"
        eyebrow="Étape 1"
      />
    )
    expect(container.querySelector('svg')?.classList.contains('mx-auto')).toBe(true)
  })

  it("rend l'action si fournie", () => {
    render(
      <OnboardingStepCard
        icon={Users}
        title="Ajoutez vos membres"
        state="active"
        action={<button>Go</button>}
        eyebrow="Étape 1"
      />
    )
    expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument()
  })

  it("n'affiche pas d'action si non fournie", () => {
    render(
      <OnboardingStepCard
        icon={Users}
        title="Ajoutez vos membres"
        state="active"
        eyebrow="Étape 1"
      />
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('compact → description masquée', () => {
    render(
      <OnboardingStepCard
        icon={Users}
        title="Ajoutez vos membres"
        description="Une description ici"
        state="active"
        compact
        eyebrow="Étape 1"
      />
    )
    expect(screen.queryByText('Une description ici')).not.toBeInTheDocument()
  })

  it('sans compact → description affichée', () => {
    render(
      <OnboardingStepCard
        icon={Users}
        title="Ajoutez vos membres"
        description="Une description ici"
        state="active"
        eyebrow="Étape 1"
      />
    )
    expect(screen.getByText('Une description ici')).toBeInTheDocument()
  })

  it('eyebrow affiché hors compact, masqué en compact', () => {
    const { unmount } = render(
      <OnboardingStepCard
        icon={Users}
        title="Ajoutez vos membres"
        state="active"
        eyebrow="Étape 1"
      />
    )
    expect(screen.getByText('Étape 1')).toBeInTheDocument()
    unmount()

    render(
      <OnboardingStepCard
        icon={Users}
        title="Ajoutez vos membres"
        state="active"
        eyebrow="Étape 1"
        compact
      />
    )
    expect(screen.queryByText('Étape 1')).not.toBeInTheDocument()
  })
})
