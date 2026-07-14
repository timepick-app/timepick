import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { renderWeekDayHeader } from '../calendarDayHeader'
import type { DayHeaderContentArg } from '@fullcalendar/core'

/**
 * Fabrique un faux `DayHeaderContentArg`. Seuls `view.type` et `date` sont
 * pertinents pour `renderWeekDayHeader` ; `text` sert de sentinel pour vérifier
 * le passe-plat des vues autres que la Semaine.
 */
function makeArg(viewType: string, date: Date) {
  return {
    date,
    view: { type: viewType },
    text: 'DEFAULT',
  } as unknown as DayHeaderContentArg
}

describe('renderWeekDayHeader', () => {
  // Mardi 23/06/2026 12:00 (heure locale).
  const tuesday = new Date(2026, 5, 23, 12)

  it('vue Semaine (timeGridWeek) : sépare le libellé (« mar. ») du numéro (« 23 ») et supprime le mois', () => {
    const out = renderWeekDayHeader(makeArg('timeGridWeek', tuesday))
    const { container } = render(<>{out}</>)

    expect(container.querySelector('.tp-week-weekday')?.textContent).toBe('mar.')
    expect(container.querySelector('.tp-week-daynum')?.textContent).toBe('23')
    // Le mois (« /06 ») ne doit plus apparaître dans l'en-tête.
    expect(container.textContent).not.toContain('/06')
  })

  it('vue Mois (dayGridMonth) : passe-plat du texte par défaut (`arg.text`)', () => {
    const out = renderWeekDayHeader(makeArg('dayGridMonth', tuesday))
    expect(out).toBe('DEFAULT')
  })
})
