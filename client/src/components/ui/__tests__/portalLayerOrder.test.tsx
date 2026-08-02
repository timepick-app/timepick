import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AlertDialog, AlertDialogContent, AlertDialogTitle } from '../alert-dialog'
import { Dialog, DialogContent, DialogTitle } from '../dialog'
import { Sheet, SheetContent, SheetTitle } from '../sheet'

/**
 * GARDE D'EMPILEMENT DES SURFACES PORTALISÉES — deux invariants, cassés deux fois.
 *
 * Le voile et la fenêtre vivent dans deux portails frères sur `<body>` et
 * partagent le MÊME `z-50` : c'est l'ordre d'arrivée dans le DOM qui arbitre.
 * (1) Le voile est rendu avant la fenêtre, sinon il la recouvre : elle reste
 * visible mais grisée et avale les clics. (2) Monter la fenêtre d'un cran pour
 * « réparer » (1) la fait passer au-dessus des voiles des autres couches et des
 * popovers ouverts dedans — c'est un piège, il a été payé.
 *
 * La cause runtime est traitée dans `MjmlEditorOverlay` (le caractère modal est
 * gelé le temps d'une ouverture). Ce test verrouille l'autre moitié : les `z-*`.
 */

/** Le `z-*` écrit dans la classe du nœud (jsdom ne résout pas la cascade Tailwind). */
function zClass(el: Element): string | undefined {
  return Array.from(el.classList).find((c) => c.startsWith('z-'))
}

const VEILED: { name: string; mount: () => void; testId: string }[] = [
  {
    name: 'Dialog',
    testId: 'guard-dialog',
    mount: () => {
      render(
        <Dialog open>
          <DialogContent data-testid="guard-dialog" aria-describedby={undefined}>
            <DialogTitle>Titre</DialogTitle>
          </DialogContent>
        </Dialog>,
      )
    },
  },
  {
    name: 'AlertDialog',
    testId: 'guard-alert',
    mount: () => {
      render(
        <AlertDialog open>
          <AlertDialogContent data-testid="guard-alert">
            <AlertDialogTitle>Titre</AlertDialogTitle>
          </AlertDialogContent>
        </AlertDialog>,
      )
    },
  },
  {
    name: 'Sheet',
    testId: 'guard-sheet',
    mount: () => {
      render(
        <Sheet open>
          <SheetContent data-testid="guard-sheet" aria-describedby={undefined}>
            <SheetTitle>Titre</SheetTitle>
          </SheetContent>
        </Sheet>,
      )
    },
  },
]

describe('empilement des surfaces portalisées', () => {
  for (const { name, mount, testId } of VEILED) {
    it(`${name} — voile avant fenêtre, même étage`, () => {
      mount()
      const content = screen.getByTestId(testId)
      const overlay = document.querySelector('.bg-black\\/80')!
      expect(overlay.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(zClass(overlay)).toBe('z-50')
      expect(zClass(content)).toBe('z-50')
    })
  }
})
