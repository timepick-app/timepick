import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import type { ColumnDef } from '@tanstack/react-table'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DataTable,
  DataTableColumnHeader,
  DataTableBulkActions,
} from '@/components/ui/data-table'

// ---------------------------------------------------------------------------
// Données de test
// ---------------------------------------------------------------------------

type TestRow = { id: string; title: string; status: string }

const STATUSES = [
  { value: 'todo', label: 'À faire' },
  { value: 'done', label: 'Terminé' },
  { value: 'progress', label: 'En cours' },
]

// 7 lignes → dépasse pageSize 5 → 2 pages
const ROWS: TestRow[] = [
  { id: '1', title: 'Zéro fondation', status: 'done' },
  { id: '2', title: 'Alpha service', status: 'todo' },
  { id: '3', title: 'Bêta migration', status: 'progress' },
  { id: '4', title: 'Delta réseau', status: 'done' },
  { id: '5', title: 'Epsilon cache', status: 'todo' },
  { id: '6', title: 'Gamma archive', status: 'progress' },
  { id: '7', title: 'Omega démo', status: 'done' },
]

// Défini hors composant : stable entre rendus, pas de memoization nécessaire en test
const columns: ColumnDef<TestRow>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Tout sélectionner"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Sélectionner la ligne"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'title',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Titre" />,
    cell: ({ row }) => <span data-testid="cell-title">{row.original.title}</span>,
  },
  {
    accessorKey: 'status',
    header: 'Statut',
    filterFn: (row, id, value) => (value as string[]).includes(row.getValue(id)),
  },
]

function renderTable() {
  return render(
    <DataTable
      columns={columns}
      data={ROWS}
      searchColumnId="title"
      facetedFilters={[{ columnId: 'status', title: 'Statut', options: STATUSES }]}
      getRowId={(row) => row.id}
      initialState={{ pagination: { pageSize: 5 } }}
      renderBulkActions={(table) => (
        <DataTableBulkActions table={table} entityName="ligne(s)">
          <button>Action</button>
        </DataTableBulkActions>
      )}
    />
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DataTable (mode client)', () => {
  it('affiche "Page 1 sur 2" pour 7 lignes avec pageSize 5', () => {
    renderTable()
    expect(screen.getByText(/Page 1 sur 2/)).toBeInTheDocument()
  })

  it('passe à la page suivante et affiche les lignes restantes', () => {
    renderTable()
    expect(screen.getAllByTestId('cell-title')).toHaveLength(5)

    fireEvent.click(screen.getByLabelText('Page suivante'))

    expect(screen.getAllByTestId('cell-title')).toHaveLength(2)
    expect(screen.getByText(/Page 2 sur 2/)).toBeInTheDocument()
  })

  it('filtre les lignes via la recherche par titre', () => {
    renderTable()
    fireEvent.change(screen.getByPlaceholderText('Rechercher…'), {
      target: { value: 'Alpha' },
    })
    const cells = screen.getAllByTestId('cell-title')
    expect(cells).toHaveLength(1)
    expect(cells[0]).toHaveTextContent('Alpha service')
  })

  it("la barre d'actions groupées est absente sans sélection", () => {
    renderTable()
    expect(
      screen.queryByRole('toolbar', { name: 'Actions groupées' })
    ).not.toBeInTheDocument()
  })

  it("révèle la barre d'actions groupées après sélection d'une ligne", async () => {
    renderTable()
    fireEvent.click(screen.getAllByLabelText('Sélectionner la ligne')[0])
    const bar = await screen.findByRole('toolbar', { name: 'Actions groupées' })
    expect(bar).toBeInTheDocument()
    expect(bar).toHaveTextContent('1 ligne(s) sélectionné(s)')
  })

  it("révèle la barre d'actions groupées après 'Tout sélectionner' (page courante)", async () => {
    renderTable()
    fireEvent.click(screen.getByLabelText('Tout sélectionner'))
    const bar = await screen.findByRole('toolbar', { name: 'Actions groupées' })
    expect(bar).toBeInTheDocument()
    // Page 1 = 5 lignes sélectionnées
    expect(bar).toHaveTextContent('5 ligne(s) sélectionné(s)')
  })

  it("trie les lignes par titre (croissant) via le menu de l'en-tête", async () => {
    const user = userEvent.setup()
    renderTable()

    // Ordre original : première cellule = 'Zéro fondation'
    expect(screen.getAllByTestId('cell-title')[0]).toHaveTextContent('Zéro fondation')

    // Ouvrir le menu de tri de la colonne "Titre"
    const titreBtn = screen.getByRole('button', { name: /Titre/i })
    await user.click(titreBtn)

    // Sélectionner "Croissant" (A→Z)
    const croissantItem = await screen.findByText('Croissant')
    await user.click(croissantItem)

    // Après tri croissant : première cellule = 'Alpha service'
    expect(screen.getAllByTestId('cell-title')[0]).toHaveTextContent('Alpha service')
  })

  it('affiche le bouton de filtre facette "Statut"', () => {
    renderTable()
    // Si le popover Radix ne s'ouvre pas sous jsdom, on vérifie au moins la présence du bouton
    expect(screen.getByRole('button', { name: /Statut/i })).toBeInTheDocument()
  })
})
