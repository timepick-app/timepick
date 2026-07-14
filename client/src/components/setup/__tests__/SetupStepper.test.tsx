import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SetupStepper } from '../SetupStepper'

describe('SetupStepper', () => {
  it("current='smtp' → numéros 1 et 2 présents, aria-current sur l'étape SMTP", () => {
    const { container } = render(<SetupStepper current="smtp" />)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    const active = container.querySelector('[aria-current="step"]')
    expect(active).not.toBeNull()
    expect(active?.textContent).toContain('Serveur SMTP')
  })

  it("current='admin' → numéro 1 absent (remplacé par check), numéro 2 présent, aria-current sur Administrateur", () => {
    const { container } = render(<SetupStepper current="admin" />)
    expect(screen.queryByText('1')).toBeNull()
    expect(screen.getByText('2')).toBeInTheDocument()
    const active = container.querySelector('[aria-current="step"]')
    expect(active).not.toBeNull()
    expect(active?.textContent).toContain('Administrateur')
  })

  it("current='sent' → aria-current sur Administrateur (étape 2 toujours active)", () => {
    const { container } = render(<SetupStepper current="sent" />)
    const active = container.querySelector('[aria-current="step"]')
    expect(active).not.toBeNull()
    expect(active?.textContent).toContain('Administrateur')
  })

  it("description contextuelle : SMTP vs Administrateur selon l'étape active", () => {
    const { rerender } = render(<SetupStepper current="smtp" />)
    expect(screen.getByText(/achemine tous les emails/i)).toBeInTheDocument()
    expect(screen.queryByText(/premier compte administrateur/i)).toBeNull()

    rerender(<SetupStepper current="admin" />)
    expect(screen.getByText(/premier compte administrateur/i)).toBeInTheDocument()
    expect(screen.queryByText(/achemine tous les emails/i)).toBeNull()
  })
})
