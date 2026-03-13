/** @jsxImportSource solid-js */
import { Show } from 'solid-js'
import type { RequestEntry } from '../store'
import WaterfallBar from './WaterfallBar'

interface RequestRowProps {
  entry: RequestEntry
  maxTime: number
  selected: boolean
  onSelect: () => void
}

const STATUS_COLORS: Record<string, string> = {
  '2': '#22c55e',
  '3': '#eab308',
  '4': '#f97316',
  '5': '#ef4444',
}

const TYPE_COLORS: Record<string, string> = {
  'server-fn': '#f97316',
  ssr: '#a855f7',
  'server-route': '#22c55e',
}

const GRID_COLUMNS = '52px 1fr 42px 60px 90px 2fr'

function displayUrl(entry: RequestEntry): string {
  if (entry.serverFn?.name) return entry.serverFn.name
  try {
    const u = new URL(entry.url, 'http://localhost')
    return u.pathname
  } catch {
    return entry.url
  }
}

export function RequestTableHeader() {
  return (
    <div
      style={{
        display: 'grid',
        'grid-template-columns': GRID_COLUMNS,
        gap: '0',
        padding: '4px 12px',
        background: 'var(--tsd-bg-header, #1e1e32)',
        'border-bottom': '1px solid var(--tsd-border, #333)',
        color: 'var(--tsd-text-secondary, #999)',
        'font-size': '10px',
        'text-transform': 'uppercase',
        'letter-spacing': '0.5px',
        'font-weight': '600',
        'flex-shrink': '0',
      }}
    >
      <span>Method</span>
      <span>Name</span>
      <span>Status</span>
      <span>Time</span>
      <span>Type</span>
      <span>Waterfall</span>
    </div>
  )
}

export default function RequestRow(props: RequestRowProps) {
  const statusColor = () => {
    if (!props.entry.status) return '#6b7280'
    return STATUS_COLORS[String(props.entry.status)[0]!] || '#6b7280'
  }

  const typeColor = () => {
    if (!props.entry.type) return '#6b7280'
    return TYPE_COLORS[props.entry.type] || '#6b7280'
  }

  return (
    <div
      onClick={props.onSelect}
      style={{
        display: 'grid',
        'grid-template-columns': GRID_COLUMNS,
        gap: '0',
        padding: '6px 12px',
        'border-bottom': '1px solid rgba(51,51,51,0.5)',
        cursor: 'pointer',
        'align-items': 'center',
        'background-color': props.selected
          ? 'rgba(99, 102, 241, 0.15)'
          : 'transparent',
        'font-size': '12px',
      }}
      onMouseEnter={(e) => {
        if (!props.selected)
          e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.08)'
      }}
      onMouseLeave={(e) => {
        if (!props.selected)
          e.currentTarget.style.backgroundColor = 'transparent'
      }}
    >
      <span
        style={{
          'font-weight': 'bold',
          color: '#60a5fa',
          'font-size': '10px',
        }}
      >
        {props.entry.method}
      </span>

      <span
        style={{
          overflow: 'hidden',
          'text-overflow': 'ellipsis',
          'white-space': 'nowrap',
          color: 'var(--tsd-text, #ccc)',
        }}
        title={props.entry.url}
      >
        {displayUrl(props.entry)}
      </span>

      <span
        style={{
          color: statusColor(),
          'font-weight': 'bold',
          'font-size': '10px',
        }}
      >
        {props.entry.status ?? '...'}
      </span>

      <span
        style={{
          color: 'var(--tsd-text-secondary, #999)',
          'font-size': '11px',
        }}
      >
        {props.entry.duration !== null
          ? `${props.entry.duration.toFixed(1)}ms`
          : 'pending'}
      </span>

      <Show when={props.entry.type} fallback={<span />}>
        <span
          style={{
            'background-color': typeColor(),
            color: '#fff',
            padding: '1px 6px',
            'border-radius': '3px',
            'font-size': '9px',
            'font-weight': 'bold',
            'text-transform': 'uppercase',
            display: 'inline-block',
            width: 'fit-content',
          }}
        >
          {props.entry.type}
        </span>
      </Show>

      <div style={{ position: 'relative', height: '18px' }}>
        <WaterfallBar
          phases={props.entry.phases}
          totalDuration={props.entry.duration}
          maxTime={props.maxTime}
        />
      </div>
    </div>
  )
}
