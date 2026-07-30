import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { FileDropzone } from '../file-dropzone'

const png = (name = 'logo.png', bytes = 10) =>
  new File(['x'.repeat(bytes)], name, { type: 'image/png' })

/** `fireEvent.drop` ne fabrique pas de `DataTransfer` en jsdom : on l'injecte. */
const dropFiles = (element: HTMLElement, files: File[]) =>
  fireEvent.drop(element, { dataTransfer: { files, types: ['Files'] } })

describe('FileDropzone', () => {
  it('remonte le fichier déposé', () => {
    const onFileSelected = vi.fn()
    render(<FileDropzone testId="dz" onFileSelected={onFileSelected} />)

    const file = png()
    dropFiles(screen.getByTestId('dz-dropzone'), [file])

    expect(onFileSelected).toHaveBeenCalledWith(file)
  })

  it('remonte le fichier choisi via le sélecteur', async () => {
    const user = userEvent.setup()
    const onFileSelected = vi.fn()
    render(<FileDropzone testId="dz" onFileSelected={onFileSelected} />)

    const file = png()
    await user.upload(screen.getByTestId('dz-input'), file)

    expect(onFileSelected).toHaveBeenCalledWith(file)
  })

  it('ne retient que le premier fichier d\'un dépôt multiple (endpoint mono-fichier)', () => {
    const onFileSelected = vi.fn()
    render(<FileDropzone testId="dz" onFileSelected={onFileSelected} />)

    const first = png('a.png')
    dropFiles(screen.getByTestId('dz-dropzone'), [first, png('b.png')])

    expect(onFileSelected).toHaveBeenCalledTimes(1)
    expect(onFileSelected).toHaveBeenCalledWith(first)
  })

  it('refuse un fichier trop volumineux sans appeler onFileSelected', () => {
    const onFileSelected = vi.fn()
    render(<FileDropzone testId="dz" maxSizeBytes={8} onFileSelected={onFileSelected} />)

    dropFiles(screen.getByTestId('dz-dropzone'), [png('gros.png', 9)])

    expect(onFileSelected).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Fichier trop volumineux')
  })

  it('accepte un fichier exactement à la limite de taille', () => {
    const onFileSelected = vi.fn()
    render(<FileDropzone testId="dz" maxSizeBytes={8} onFileSelected={onFileSelected} />)

    dropFiles(screen.getByTestId('dz-dropzone'), [png('pile.png', 8)])

    expect(onFileSelected).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('refuse un type hors de la liste accept', () => {
    const onFileSelected = vi.fn()
    render(
      <FileDropzone testId="dz" accept="image/png,image/webp" onFileSelected={onFileSelected} />,
    )

    dropFiles(screen.getByTestId('dz-dropzone'), [
      new File(['x'], 'anim.gif', { type: 'image/gif' }),
    ])

    expect(onFileSelected).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Format de fichier non supporté')
  })

  it('efface le message d\'erreur dès qu\'un fichier valide est déposé', () => {
    render(<FileDropzone testId="dz" maxSizeBytes={8} onFileSelected={vi.fn()} />)
    const zone = screen.getByTestId('dz-dropzone')

    dropFiles(zone, [png('gros.png', 9)])
    expect(screen.getByRole('alert')).toBeInTheDocument()

    dropFiles(zone, [png('ok.png', 2)])
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('remonte le message pour ré-annoncer deux erreurs IDENTIQUES consécutives', () => {
    render(<FileDropzone testId="dz" maxSizeBytes={8} onFileSelected={vi.fn()} />)
    const zone = screen.getByTestId('dz-dropzone')

    dropFiles(zone, [png('a.png', 9)])
    const first = screen.getByRole('alert')

    dropFiles(zone, [png('b.png', 10)])
    // Même texte : sans remontage, la live region ne mute pas et le lecteur
    // d'écran reste muet sur la seconde erreur.
    expect(screen.getByRole('alert')).not.toBe(first)
  })

  it('efface l\'erreur quand un aperçu apparaît ou disparaît', () => {
    const { rerender } = render(
      <FileDropzone testId="dz" maxSizeBytes={8} onFileSelected={vi.fn()} />,
    )
    dropFiles(screen.getByTestId('dz-dropzone'), [png('gros.png', 9)])
    expect(screen.getByRole('alert')).toBeInTheDocument()

    rerender(
      <FileDropzone
        testId="dz"
        maxSizeBytes={8}
        onFileSelected={vi.fn()}
        preview={<img alt="" src="x" />}
      />,
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('nomme le champ par le Label externe + la ligne d\'action, décrit par le hint', () => {
    render(
      <>
        <span id="lbl">Logo</span>
        <FileDropzone
          testId="dz"
          aria-labelledby="lbl"
          hint="PNG, JPEG ou WebP — 5 Mo max"
          onFileSelected={vi.fn()}
        />
      </>,
    )

    const input = screen.getByTestId('dz-input')
    const labelledby = input.getAttribute('aria-labelledby')!.split(' ')
    expect(labelledby[0]).toBe('lbl')
    expect(document.getElementById(labelledby[1])).toHaveTextContent(/Glissez un fichier/)
    // Le hint doit DÉCRIRE le champ, pas gonfler son nom.
    const describedby = input.getAttribute('aria-describedby')!
    expect(document.getElementById(describedby)).toHaveTextContent('PNG, JPEG ou WebP — 5 Mo max')
  })

  it('expose aria-invalid et rattache le message d\'erreur au champ', () => {
    render(<FileDropzone testId="dz" maxSizeBytes={8} hint="aide" onFileSelected={vi.fn()} />)
    const input = screen.getByTestId('dz-input')
    expect(input).not.toHaveAttribute('aria-invalid')

    dropFiles(screen.getByTestId('dz-dropzone'), [png('gros.png', 9)])

    expect(input).toHaveAttribute('aria-invalid', 'true')
    const ids = input.getAttribute('aria-describedby')!.split(' ')
    expect(ids).toHaveLength(2)
    expect(document.getElementById(ids[1])).toHaveTextContent('Fichier trop volumineux')
  })

  it('neutralise le comportement par défaut du dragover même quand disabled', () => {
    // Sortir de la garde AVANT preventDefault rendrait la main au navigateur,
    // qui ouvrirait le fichier déposé et détruirait la saisie en cours.
    render(<FileDropzone testId="dz" disabled onFileSelected={vi.fn()} />)
    const zone = screen.getByTestId('dz-dropzone')

    expect(fireEvent.dragOver(zone, { dataTransfer: { files: [], types: ['Files'] } })).toBe(false)
    expect(fireEvent.drop(zone, { dataTransfer: { files: [], types: ['Files'] } })).toBe(false)
  })

  it('bascule le libellé sur « Téléversement… » sous isUploading', () => {
    render(<FileDropzone testId="dz" isUploading onFileSelected={vi.fn()} />)

    expect(screen.getByText('Téléversement…')).toBeInTheDocument()
    expect(screen.queryByText(/Glissez un fichier/)).toBeNull()
  })

  it('bascule le libellé sur « remplacer » dès qu\'un aperçu est fourni', () => {
    render(<FileDropzone testId="dz" preview={<img alt="" src="x" />} onFileSelected={vi.fn()} />)

    expect(screen.getByText(/Glissez un nouveau fichier/)).toBeInTheDocument()
  })

  it('ignore le dépôt quand disabled', () => {
    const onFileSelected = vi.fn()
    render(<FileDropzone testId="dz" disabled onFileSelected={onFileSelected} />)

    dropFiles(screen.getByTestId('dz-dropzone'), [png()])

    expect(onFileSelected).not.toHaveBeenCalled()
  })

  it('rend preview dans la zone et children en dehors', () => {
    render(
      <FileDropzone
        testId="dz"
        onFileSelected={vi.fn()}
        preview={<img src="https://cdn.example/logo.png" alt="" data-testid="dz-preview" />}
      >
        <button type="button">Supprimer</button>
      </FileDropzone>,
    )

    const zone = screen.getByTestId('dz-dropzone')
    expect(zone).toContainElement(screen.getByTestId('dz-preview'))
    // Un bouton DANS le <label> déclencherait le sélecteur de fichier au clic.
    expect(zone).not.toContainElement(screen.getByRole('button', { name: 'Supprimer' }))
  })

  it('signale le survol de dépôt et ne le retire pas au dragleave d\'un enfant', () => {
    render(<FileDropzone testId="dz" onFileSelected={vi.fn()} />)
    const zone = screen.getByTestId('dz-dropzone')
    const child = screen.getByText(/Glissez un fichier/)

    fireEvent.dragEnter(zone)
    fireEvent.dragEnter(child)
    expect(zone).toHaveAttribute('data-dragging', 'true')

    fireEvent.dragLeave(child)
    expect(zone).toHaveAttribute('data-dragging', 'true')

    fireEvent.dragLeave(zone)
    expect(zone).not.toHaveAttribute('data-dragging')
  })
})
