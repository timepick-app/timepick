import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DatePicker } from '../date-picker'
import { DateTimePicker } from '../date-time-picker'
import { TimePicker } from '../time-picker'

describe('DatePicker', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-02-10T12:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('affiche le placeholder quand aucune date', () => {
    render(<DatePicker value={null} onChange={vi.fn()} placeholder="Choisir une date" />)
    expect(screen.getByRole('button', { name: /Choisir une date/ })).toBeInTheDocument()
  })

  it('affiche la date formatée en français', () => {
    render(<DatePicker value={new Date(2026, 1, 15)} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /15 février 2026/ })).toBeInTheDocument()
  })

  it('émet la date choisie au clic sur un jour', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onChange = vi.fn()
    render(<DatePicker value={null} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: /Choisir une date/ }))
    await user.click(screen.getByText('15'))

    expect(onChange).toHaveBeenCalledTimes(1)
    const picked = onChange.mock.calls[0][0] as Date
    expect(picked.getFullYear()).toBe(2026)
    expect(picked.getMonth()).toBe(1)
    expect(picked.getDate()).toBe(15)
  })
})

describe('DateTimePicker', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-02-10T12:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('affiche date + heure formatées', () => {
    render(<DateTimePicker value={new Date(2026, 1, 15, 9, 30)} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /15 février 2026 à 09:30/ })).toBeInTheDocument()
  })

  it('abrège le mois en mode compact', () => {
    render(<DateTimePicker value={new Date(2026, 1, 15, 9, 30)} onChange={vi.fn()} compact />)
    expect(
      screen.getByRole('button', { name: /15 fév.* 2026 à 09:30/ })
    ).toBeInTheDocument()
    // Le mois est abrégé : pas le libellé long « février ».
    expect(screen.queryByRole('button', { name: /février/ })).not.toBeInTheDocument()
  })

  it('préserve l\'heure quand on change la date', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onChange = vi.fn()
    render(<DateTimePicker value={new Date(2026, 1, 10, 9, 30)} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: /10 février 2026 à 09:30/ }))
    await user.click(within(screen.getByRole('grid')).getByText('20'))

    const next = onChange.mock.calls.at(-1)?.[0] as Date
    expect(next.getDate()).toBe(20)
    expect(next.getHours()).toBe(9)
    expect(next.getMinutes()).toBe(30)
  })

  it('préserve la date quand on change l\'heure', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onChange = vi.fn()
    render(<DateTimePicker value={new Date(2026, 1, 10, 9, 30)} onChange={onChange} />)

    // Les colonnes d'heure vivent dans le popover : on l'ouvre, puis on choisit 10h.
    await user.click(screen.getByRole('button', { name: /10 février 2026 à 09:30/ }))
    await user.click(
      within(screen.getByRole('listbox', { name: 'Heures' })).getByRole('option', { name: '10' })
    )

    const next = onChange.mock.calls.at(-1)?.[0] as Date
    expect(next.getDate()).toBe(10)
    expect(next.getHours()).toBe(10)
    expect(next.getMinutes()).toBe(30)
  })
})

describe('TimePicker', () => {
  function Harness({ onChange }: { onChange?: (v: string) => void }) {
    const [v, setV] = useState('09:00')
    return (
      <TimePicker value={v} onChange={(nv) => { setV(nv); onChange?.(nv) }} aria-label="Heure de début" />
    )
  }

  it('affiche la valeur sur le déclencheur', () => {
    render(<TimePicker value="09:30" onChange={vi.fn()} aria-label="Heure de début" />)
    expect(screen.getByRole('button', { name: /Heure de début/ })).toHaveTextContent('09:30')
  })

  it('émet la valeur choisie via les colonnes du popover', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: /Heure de début/ }))
    await user.click(
      within(screen.getByRole('listbox', { name: 'Heures' })).getByRole('option', { name: '14' })
    )
    expect(onChange).toHaveBeenLastCalledWith('14:00')

    await user.click(
      within(screen.getByRole('listbox', { name: 'Minutes' })).getByRole('option', { name: '30' })
    )
    expect(onChange).toHaveBeenLastCalledWith('14:30')
    expect(screen.getByRole('button', { name: /Heure de début/ })).toHaveTextContent('14:30')
  })
})
