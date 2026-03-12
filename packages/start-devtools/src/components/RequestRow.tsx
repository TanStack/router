/** @jsxImportSource solid-js */
import { createSignal, Show } from 'solid-js'
import type { RequestEntry } from '../store'
import WaterfallBar from './WaterfallBar'
import DetailPanel from './DetailPanel'

interface RequestRowProps {
  entry: RequestEntry
  maxTime: number
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

export default function RequestRow(props: RequestRowProps) {
  const [expanded, setExpanded] = createSignal(false)
  const [selectedPhase, setSelectedPhase] = createSignal<string | null>(null)

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
      style={{
        'border-bottom': '1px solid var(--tsd-border, #333)',
      }}
    >
      <div
        onClick={() => setExpanded(!expanded())}
        style={{
          display: 'grid',
          'grid-template-columns': '60px 1fr 60px 80px 120px 2fr',
          'align-items': 'center',
          gap: '8px',
          padding: '8px 12px',
          cursor: 'pointer',
          'font-size': '12px',
          'background-color': expanded()
            ? 'var(--tsd-bg-secondary, #2a2a3e)'
            : 'transparent',
        }}
      >
        <span
          style={{
            'font-weight': 'bold',
            color: '#60a5fa',
            'font-size': '11px',
          }}
        >
          {props.entry.method}
        </span>

        <span
          style={{
            overflow: 'hidden',
            'text-overflow': 'ellipsis',
            'white-space': 'nowrap',
            color: 'var(--tsd-text, #e0e0e0)',
          }}
        >
          {props.entry.url}
        </span>

        <span
          style={{
            color: statusColor(),
            'font-weight': 'bold',
            'font-size': '11px',
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
              'font-size': '10px',
              'font-weight': 'bold',
              'text-transform': 'uppercase',
            }}
          >
            {props.entry.type}
          </span>
        </Show>

        <WaterfallBar
          phases={props.entry.phases}
          totalDuration={props.entry.duration}
          maxTime={props.maxTime}
        />
      </div>

      <Show when={expanded()}>
        <div style={{ padding: '0 12px 12px' }}>
          <div style={{ 'margin-bottom': '12px' }}>
            <div
              style={{
                'font-size': '11px',
                'font-weight': 'bold',
                'margin-bottom': '4px',
                color: 'var(--tsd-text-secondary, #999)',
              }}
            >
              Waterfall
            </div>
            <WaterfallBar
              phases={props.entry.phases}
              totalDuration={props.entry.duration}
              maxTime={props.entry.duration || props.maxTime}
              onPhaseClick={(name) => setSelectedPhase(selectedPhase() === name ? null : name)}
            />
          </div>

          <DetailPanel
            entry={props.entry}
            selectedPhase={selectedPhase()}
          />
        </div>
      </Show>
    </div>
  )
}
