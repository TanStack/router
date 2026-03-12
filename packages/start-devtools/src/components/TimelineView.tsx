/** @jsxImportSource solid-js */
import { For, Show } from 'solid-js'
import type { RequestEntry } from '../store'
import WaterfallBar from './WaterfallBar'

interface TimelineViewProps {
  entries: Array<RequestEntry>
}

export default function TimelineView(props: TimelineViewProps) {
  const globalMaxTime = () => {
    let max = 0
    for (const entry of props.entries) {
      const entryMax = entry.duration ?? 0
      if (entryMax > max) max = entryMax
    }
    return max || 100
  }

  return (
    <div style={{ padding: '12px', 'font-size': '12px' }}>
      <Show
        when={props.entries.length > 0}
        fallback={
          <div
            style={{
              color: 'var(--tsd-text-secondary, #999)',
              'text-align': 'center',
              padding: '24px',
            }}
          >
            No requests captured yet
          </div>
        }
      >
        <div
          style={{
            display: 'flex',
            'justify-content': 'space-between',
            'margin-bottom': '8px',
            color: 'var(--tsd-text-secondary, #999)',
            'font-size': '10px',
          }}
        >
          <span>0ms</span>
          <span>{(globalMaxTime() / 2).toFixed(0)}ms</span>
          <span>{globalMaxTime().toFixed(0)}ms</span>
        </div>

        <For each={props.entries}>
          {(entry) => (
            <div
              style={{
                display: 'grid',
                'grid-template-columns': '200px 1fr',
                gap: '8px',
                'align-items': 'center',
                'margin-bottom': '4px',
              }}
            >
              <span
                style={{
                  overflow: 'hidden',
                  'text-overflow': 'ellipsis',
                  'white-space': 'nowrap',
                  color: 'var(--tsd-text, #e0e0e0)',
                }}
                title={`${entry.method} ${entry.url}`}
              >
                {entry.method} {entry.url}
              </span>
              <WaterfallBar
                phases={entry.phases}
                totalDuration={entry.duration}
                maxTime={globalMaxTime()}
              />
            </div>
          )}
        </For>
      </Show>
    </div>
  )
}
