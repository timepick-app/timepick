import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { useCondensedOnScroll } from '../useCondensedOnScroll'

function Probe() {
  const condensed = useCondensedOnScroll()
  return <span data-testid="c">{String(condensed)}</span>
}

function setScroll(y: number) {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: y })
}

function fireScroll() {
  act(() => {
    window.dispatchEvent(new Event('scroll'))
  })
}

describe('useCondensedOnScroll', () => {
  afterEach(() => setScroll(0))

  it('condense dès que la page est défilée, s étend de nouveau au sommet', () => {
    setScroll(0)
    render(<Probe />)
    const c = () => screen.getByTestId('c').textContent

    // Au sommet → étendu
    expect(c()).toBe('false')

    // Premier pixel de défilement → condensé
    setScroll(1)
    fireScroll()
    expect(c()).toBe('true')

    // Retour au sommet → étendu
    setScroll(0)
    fireScroll()
    expect(c()).toBe('false')
  })

  it('retire le listener scroll au démontage', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<Probe />)
    unmount()
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function))
    remove.mockRestore()
  })
})
