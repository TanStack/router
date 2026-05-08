import * as React from 'react'
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ExpandedState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import { formatBenchmarkNumber } from '~/benchmark'

type Region = 'Americas' | 'EMEA' | 'APAC' | 'Japan'
type Segment = 'Enterprise' | 'Mid-market' | 'SMB' | 'Strategic'
type Health = 'On track' | 'Watch' | 'At risk'

type ReportRow = {
  id: string
  account: string
  region: Region
  segment: Segment
  owner: string
  pipeline: number
  forecast: number
  risk: number
  health: Health
  updated: string
}

const tableCodeMarker = 'deferred-hydration-react-table-child'

const regions: Array<Region> = ['Americas', 'EMEA', 'APAC', 'Japan']
const segments: Array<Segment> = [
  'Enterprise',
  'Mid-market',
  'SMB',
  'Strategic',
]
const owners = [
  'Avery Chen',
  'Mina Patel',
  'Jon Bell',
  'Lina Moore',
  'Noah Keller',
  'Iris Stone',
  'Sofia Rossi',
  'Theo Martin',
]

const moneyFormat = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
  style: 'currency',
  currency: 'USD',
})

function wave(index: number, span: number, amplitude: number, phase = 0) {
  return Math.sin((index / span) * Math.PI * 2 + phase) * amplitude
}

function makeRows(count: number): Array<ReportRow> {
  return Array.from({ length: count }, (_, index): ReportRow => {
    const seed = (index + 1) * 2654435761
    const pipeline =
      82_000 +
      wave(index, 73, 29_000) +
      wave(index, 19, 8_500, 0.7) +
      ((seed >>> 9) % 31_000)
    const forecast =
      pipeline * (0.72 + ((seed >>> 17) % 24) / 100) +
      wave(index, 41, 5_000, 1.2)
    const risk = Math.max(0, pipeline - forecast + ((seed >>> 23) % 18_000))
    const health: Health =
      risk > 34_000 ? 'At risk' : risk > 20_000 ? 'Watch' : 'On track'

    return {
      id: `row-${index + 1}`,
      account: `Northwind ${String(index + 1).padStart(4, '0')}`,
      region: regions[index % regions.length],
      segment: segments[(index * 3) % segments.length],
      owner: owners[(index * 5) % owners.length],
      pipeline: Math.round(pipeline),
      forecast: Math.round(forecast),
      risk: Math.round(risk),
      health,
      updated: `2026-05-${String((index % 28) + 1).padStart(2, '0')}`,
    }
  })
}

function formatMoney(value: number) {
  return moneyFormat.format(value)
}

function createColumns(
  onSortIntent: () => void,
): Array<ColumnDef<ReportRow>> {
  const columns: Array<ColumnDef<ReportRow>> = [
    {
      id: 'select',
      size: 42,
      enableSorting: false,
      enableResizing: false,
      header: ({ table }) => (
        <input
          aria-label="Select all visible rows"
          checked={table.getIsAllPageRowsSelected()}
          onChange={table.getToggleAllPageRowsSelectedHandler()}
          type="checkbox"
        />
      ),
      cell: ({ row }) => (
        <input
          aria-label={`Select ${row.original.account}`}
          checked={row.getIsSelected()}
          data-testid={row.index === 0 ? 'table-select-action' : undefined}
          onChange={row.getToggleSelectedHandler()}
          type="checkbox"
        />
      ),
    },
    {
      id: 'expander',
      size: 48,
      enableSorting: false,
      enableResizing: false,
      header: '',
      cell: ({ row }) => (
        <button
          aria-label={`${row.getIsExpanded() ? 'Collapse' : 'Expand'} ${
            row.original.account
          }`}
          className="table-icon-button"
          data-testid={row.index === 0 ? 'table-expand-action' : undefined}
          onClick={row.getToggleExpandedHandler()}
          type="button"
        >
          {row.getIsExpanded() ? '-' : '+'}
        </button>
      ),
    },
    {
      accessorKey: 'account',
      header: 'Account',
      size: 190,
      cell: (info) => <strong>{info.getValue<string>()}</strong>,
    },
    {
      accessorKey: 'region',
      header: 'Region',
      size: 116,
    },
    {
      accessorKey: 'segment',
      header: 'Segment',
      size: 132,
    },
    {
      accessorKey: 'owner',
      header: 'Owner',
      size: 144,
    },
    {
      accessorKey: 'pipeline',
      header: ({ column }) => (
        <button
          className="table-header-button"
          data-testid="table-sort-action"
          onClick={(event) => {
            onSortIntent()
            column.getToggleSortingHandler()?.(event)
          }}
          type="button"
        >
          Pipeline
          <span aria-hidden="true">
            {column.getIsSorted() === 'asc'
              ? ' up'
              : column.getIsSorted() === 'desc'
                ? ' down'
                : ' sort'}
          </span>
        </button>
      ),
      size: 132,
      cell: (info) => formatMoney(info.getValue<number>()),
    },
    {
      accessorKey: 'forecast',
      header: 'Forecast',
      size: 132,
      cell: (info) => formatMoney(info.getValue<number>()),
    },
    {
      accessorKey: 'risk',
      header: 'Risk',
      size: 116,
      cell: (info) => formatMoney(info.getValue<number>()),
    },
    {
      accessorKey: 'health',
      header: 'Health',
      size: 112,
      cell: (info) => (
        <span className="health-pill" data-health={info.getValue<Health>()}>
          {info.getValue<string>()}
        </span>
      ),
    },
    {
      accessorKey: 'updated',
      header: 'Updated',
      size: 118,
    },
  ]

  return columns
}

export function SsrInteractiveTable(props: { points: number }) {
  const [hydrated, setHydrated] = React.useState(false)
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'risk', desc: true },
  ])
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
  const [expanded, setExpanded] = React.useState<ExpandedState>({})
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({})
  const [globalFilter, setGlobalFilter] = React.useState('')
  const [density, setDensity] = React.useState<'comfortable' | 'compact'>(
    'comfortable',
  )
  const [sortClicks, setSortClicks] = React.useState(0)
  const [densityClicks, setDensityClicks] = React.useState(0)

  React.useEffect(() => {
    setHydrated(true)
  }, [])

  const data = React.useMemo(() => makeRows(props.points), [props.points])
  const columns = React.useMemo(
    () => createColumns(() => setSortClicks((value) => value + 1)),
    [],
  )

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      rowSelection,
      expanded,
      columnVisibility,
      globalFilter,
    },
    columnResizeMode: 'onChange',
    enableColumnResizing: true,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowCanExpand: () => true,
    getRowId: (row) => row.id,
    getSortedRowModel: getSortedRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onExpandedChange: setExpanded,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
  })

  const rows = table.getRowModel().rows
  const selectedCount = Object.keys(rowSelection).length
  const expandedCount =
    expanded === true ? rows.length : Object.keys(expanded).length

  return (
    <section
      className="chart-section table-section"
      data-density={density}
      data-hydrated={hydrated ? 'true' : 'false'}
      data-testid="ssr-table-region"
    >
      <span className="visually-hidden">{tableCodeMarker}</span>
      <div className="chart-heading">
        <div>
          <p className="eyebrow">SSR report table</p>
          <h2>Interactive pipeline grid</h2>
        </div>
        <span data-testid="table-hydration-state">
          {hydrated ? 'hydrated' : 'static'}
        </span>
      </div>

      <div className="table-toolbar">
        <label>
          <span>Filter</span>
          <input
            data-testid="table-filter-action"
            onChange={(event) => setGlobalFilter(event.target.value)}
            placeholder="Region, owner, account"
            type="search"
            value={globalFilter}
          />
        </label>
        <button
          data-testid="table-density-action"
          onClick={() => {
            setDensity((value) =>
              value === 'comfortable' ? 'compact' : 'comfortable',
            )
            setDensityClicks((value) => value + 1)
          }}
          type="button"
        >
          Density <span data-testid="table-density-count">{densityClicks}</span>
        </button>
        <div className="table-column-toggles" aria-label="Column visibility">
          {table
            .getAllLeafColumns()
            .filter((column) => column.getCanHide())
            .slice(2, 8)
            .map((column, index) => (
              <label key={column.id}>
                <input
                  checked={column.getIsVisible()}
                  data-testid={
                    index === 0 ? 'table-visibility-action' : undefined
                  }
                  onChange={column.getToggleVisibilityHandler()}
                  type="checkbox"
                />
                <span>{column.id}</span>
              </label>
            ))}
        </div>
      </div>

      <div className="table-stats" aria-label="Table interaction counters">
        <span>
          Rows <strong>{formatBenchmarkNumber(props.points)}</strong>
        </span>
        <span>
          Selected{' '}
          <strong data-testid="table-select-count">{selectedCount}</strong>
        </span>
        <span>
          Expanded{' '}
          <strong data-testid="table-expand-count">{expandedCount}</strong>
        </span>
        <span>
          Sort clicks{' '}
          <strong data-testid="table-sort-count">{sortClicks}</strong>
        </span>
      </div>

      <div className="table-frame">
        <table
          className="report-table"
          style={{ width: table.getCenterTotalSize() }}
        >
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    colSpan={header.colSpan}
                    style={{ width: header.getSize() }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                    {header.column.getCanResize() ? (
                      <span
                        className="table-resizer"
                        data-testid={
                          header.column.id === 'account'
                            ? 'table-resize-action'
                            : undefined
                        }
                        onDoubleClick={() => header.column.resetSize()}
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                      />
                    ) : null}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row) => (
              <React.Fragment key={row.id}>
                <tr data-selected={row.getIsSelected() ? 'true' : 'false'}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} style={{ width: cell.column.getSize() }}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
                {row.getIsExpanded() ? (
                  <tr className="table-detail-row">
                    <td colSpan={row.getVisibleCells().length}>
                      <strong>{row.original.account}</strong> is owned by{' '}
                      {row.original.owner}. Forecast is{' '}
                      {formatMoney(row.original.forecast)} with{' '}
                      {formatMoney(row.original.risk)} currently at risk.
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
