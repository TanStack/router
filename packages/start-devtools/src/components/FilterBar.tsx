/** @jsxImportSource solid-js */
import { For } from 'solid-js'

export interface Filters {
  method: string | null
  statusRange: string | null
  type: string | null
  urlSearch: string
}

interface FilterBarProps {
  filters: Filters
  onFilterChange: (filters: Filters) => void
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const STATUS_RANGES = ['2xx', '3xx', '4xx', '5xx']
const TYPES = ['ssr', 'server-fn', 'server-route']

export default function FilterBar(props: FilterBarProps) {
  const selectStyle = {
    'background-color': 'var(--tsd-bg-secondary, #2a2a3e)',
    color: 'var(--tsd-text, #e0e0e0)',
    border: '1px solid var(--tsd-border, #444)',
    'border-radius': '4px',
    padding: '4px 8px',
    'font-size': '12px',
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: '8px',
        padding: '8px 12px',
        'align-items': 'center',
        'border-bottom': '1px solid var(--tsd-border, #333)',
        'flex-wrap': 'wrap',
      }}
    >
      <select
        value={props.filters.method || ''}
        onChange={(e) =>
          props.onFilterChange({
            ...props.filters,
            method: e.currentTarget.value || null,
          })
        }
        style={selectStyle}
      >
        <option value="">All Methods</option>
        <For each={METHODS}>{(m) => <option value={m}>{m}</option>}</For>
      </select>

      <select
        value={props.filters.statusRange || ''}
        onChange={(e) =>
          props.onFilterChange({
            ...props.filters,
            statusRange: e.currentTarget.value || null,
          })
        }
        style={selectStyle}
      >
        <option value="">All Status</option>
        <For each={STATUS_RANGES}>{(s) => <option value={s}>{s}</option>}</For>
      </select>

      <select
        value={props.filters.type || ''}
        onChange={(e) =>
          props.onFilterChange({
            ...props.filters,
            type: e.currentTarget.value || null,
          })
        }
        style={selectStyle}
      >
        <option value="">All Types</option>
        <For each={TYPES}>{(t) => <option value={t}>{t}</option>}</For>
      </select>

      <input
        type="text"
        placeholder="Search URL..."
        value={props.filters.urlSearch}
        onInput={(e) =>
          props.onFilterChange({
            ...props.filters,
            urlSearch: e.currentTarget.value,
          })
        }
        style={{
          ...selectStyle,
          'flex-grow': '1',
          'min-width': '120px',
        }}
      />
    </div>
  )
}
