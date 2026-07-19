import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SetupStepper } from '../SetupStepper'

describe('SetupStepper — flux à 2 étapes (source env)', () => {
  const twoSteps = ['smtp', 'admin'] as const

  it("current='smtp' → numéros 1 et 2 présents, aria-current sur l'étape SMTP", () => {
    const { container } = render(<SetupStepper current="smtp" steps={[...twoSteps]} />)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    const active = container.querySelector('[aria-current="step"]')
    expect(active).not.toBeNull()
    expect(active?.textContent).toContain('Serveur SMTP')
  })

  it("current='admin' → numéro 1 absent (remplacé par check), numéro 2 présent, aria-current sur Administrateur", () => {
    const { container } = render(<SetupStepper current="admin" steps={[...twoSteps]} />)
    expect(screen.queryByText('1')).toBeNull()
    expect(screen.getByText('2')).toBeInTheDocument()
    const active = container.querySelector('[aria-current="step"]')
    expect(active).not.toBeNull()
    expect(active?.textContent).toContain('Administrateur')
  })

  it("current='sent' → aria-current sur Administrateur (dernière étape toujours active)", () => {
    const { container } = render(<SetupStepper current="sent" steps={[...twoSteps]} />)
    const active = container.querySelector('[aria-current="step"]')
    expect(active).not.toBeNull()
    expect(active?.textContent).toContain('Administrateur')
  })

  it("description contextuelle : SMTP vs Administrateur selon l'étape active", () => {
    const { rerender } = render(<SetupStepper current="smtp" steps={[...twoSteps]} />)
    expect(screen.getByText(/achemine tous les emails/i)).toBeInTheDocument()
    expect(screen.queryByText(/premier compte administrateur/i)).toBeNull()

    rerender(<SetupStepper current="admin" steps={[...twoSteps]} />)
    expect(screen.getByText(/premier compte administrateur/i)).toBeInTheDocument()
    expect(screen.queryByText(/achemine tous les emails/i)).toBeNull()
  })
})

describe('SetupStepper — flux à 3 étapes (source file)', () => {
  const threeSteps = ['key', 'smtp', 'admin'] as const

  it("current='key' → 3 pastilles numérotées, aria-current sur Clé de chiffrement", () => {
    const { container } = render(<SetupStepper current="key" steps={[...threeSteps]} />)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    const active = container.querySelector('[aria-current="step"]')
    expect(active?.textContent).toContain('Clé de chiffrement')
    expect(screen.getByText(/clé de chiffrement a été générée/i)).toBeInTheDocument()
  })

  it("current='smtp' → l'étape 1 (clé) devient un check, aria-current sur SMTP", () => {
    const { container } = render(<SetupStepper current="smtp" steps={[...threeSteps]} />)
    expect(screen.queryByText('1')).toBeNull()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    const active = container.querySelector('[aria-current="step"]')
    expect(active?.textContent).toContain('Serveur SMTP')
  })

  it("current='sent' → aria-current sur la dernière étape (Administrateur)", () => {
    const { container } = render(<SetupStepper current="sent" steps={[...threeSteps]} />)
    const active = container.querySelector('[aria-current="step"]')
    expect(active?.textContent).toContain('Administrateur')
  })

  it("current='admin' → étapes 1 et 2 remplacées par des checks", () => {
    const { container } = render(<SetupStepper current="admin" steps={[...threeSteps]} />)
    expect(screen.queryByText('1')).toBeNull()
    expect(screen.queryByText('2')).toBeNull()
    expect(screen.getByText('3')).toBeInTheDocument()
    const checks = container.querySelectorAll('svg')
    expect(checks.length).toBeGreaterThanOrEqual(2)
  })
})

describe('SetupStepper — copie sautable (smtpSkippable=true, A1)', () => {
  const twoSteps = ['smtp', 'admin'] as const

  it("current='smtp' → l'étape reste visible et numérotée, description devenue facultative", () => {
    const { container } = render(<SetupStepper current="smtp" steps={[...twoSteps]} smtpSkippable />)
    // A1 : toujours visible/numérotée dans le stepper, jamais masquée.
    expect(screen.getByText('1')).toBeInTheDocument()
    const active = container.querySelector('[aria-current="step"]')
    expect(active?.textContent).toContain('Serveur SMTP')
    // Copie révisée : ne prétend plus que l'étape est un préalable bloquant.
    expect(screen.getByText(/facultative/i)).toBeInTheDocument()
    expect(screen.queryByText(/sans lui, personne ne peut se connecter/i)).toBeNull()
  })

  it("current='admin' → la description n'affirme plus que SMTP doit être fait au préalable", () => {
    render(<SetupStepper current="admin" steps={[...twoSteps]} smtpSkippable />)
    expect(screen.getByText(/premier compte administrateur/i)).toBeInTheDocument()
    expect(screen.queryByText(/la configuration smtp doit être faite au préalable/i)).toBeNull()
  })

  it('smtpSkippable=false (défaut) conserve la copie originale pour le même flux de steps', () => {
    render(<SetupStepper current="smtp" steps={[...twoSteps]} />)
    expect(screen.getByText(/sans lui, personne ne peut se connecter/i)).toBeInTheDocument()
  })

  it('source fallback → message intercepteur local précis (127.0.0.1:1025), Mailpit cité en exemple', () => {
    render(<SetupStepper current="smtp" steps={[...twoSteps]} smtpSkippable smtpTransportSource="fallback" />)
    expect(screen.getByText(/127\.0\.0\.1:1025/)).toBeInTheDocument()
    expect(screen.getByText(/typiquement Mailpit/i)).toBeInTheDocument()
    expect(screen.getByText(/capturés au lieu d'être réellement envoyés/i)).toBeInTheDocument()
  })

  it('source db → message « configuration déjà enregistrée » (champs pré-remplis)', () => {
    render(<SetupStepper current="smtp" steps={[...twoSteps]} smtpSkippable smtpTransportSource="db" />)
    expect(screen.getByText(/déjà enregistrée et répond/i)).toBeInTheDocument()
  })

  it("source env → message « défini par l'environnement du serveur »", () => {
    render(<SetupStepper current="smtp" steps={[...twoSteps]} smtpSkippable smtpTransportSource="env" />)
    expect(screen.getByText(/environnement du serveur/i)).toBeInTheDocument()
  })
})
