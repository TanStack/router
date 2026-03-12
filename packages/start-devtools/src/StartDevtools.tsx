/** @jsxImportSource solid-js */
import { createSignal, createMemo, For, Show, onCleanup } from 'solid-js'
import { MainPanel, Header, HeaderLogo, Button } from '@tanstack/devtools-ui'
import { createRequestStore, type RequestEntry } from './store'
import FilterBar, { type Filters } from './components/FilterBar'
import RequestRow from './components/RequestRow'
import TimelineView from './components/TimelineView'

export default function StartDevtools() {
  const store = createRequestStore()
  onCleanup(() => store.cleanup())

  const [view, setView] = createSignal<'rows' | 'timeline'>('rows')
  const [filters, setFilters] = createSignal<Filters>({
    method: null,
    statusRange: null,
    type: null,
    urlSearch: '',
  })

  const filteredEntries = createMemo(() => {
    const f = filters()
    const all = Array.from(store.entries.values())

    return all.filter((entry: RequestEntry) => {
      if (f.method && entry.method !== f.method) return false
      if (f.statusRange && entry.status !== null) {
        const range = String(entry.status)[0] + 'xx'
        if (range !== f.statusRange) return false
      }
      if (f.type && entry.type !== f.type) return false
      if (f.urlSearch && !entry.url.includes(f.urlSearch)) return false
      return true
    })
  })

  const maxTime = createMemo(() => {
    const entries = filteredEntries()
    let max = 0
    for (const e of entries) {
      if (e.duration && e.duration > max) max = e.duration
    }
    return max || 100
  })

  return (
    <MainPanel>
      <Header>
        <HeaderLogo flavor={{ light: '#1a1a2e', dark: '#e0e0e0' }}>
          TanStack Start
        </HeaderLogo>
        <div
          style={{
            display: 'flex',
            gap: '8px',
            'align-items': 'center',
            'margin-left': 'auto',
          }}
        >
          <Button
            variant={view() === 'rows' ? 'primary' : 'secondary'}
            onClick={() => setView('rows')}
          >
            Rows
          </Button>
          <Button
            variant={view() === 'timeline' ? 'primary' : 'secondary'}
            onClick={() => setView('timeline')}
          >
            Timeline
          </Button>
          <Button variant="danger" onClick={() => store.clear()}>
            Clear
          </Button>
        </div>
      </Header>

      <FilterBar filters={filters()} onFilterChange={setFilters} />

      <div
        style={{
          'overflow-y': 'auto',
          'flex-grow': '1',
        }}
      >
        <Show
          when={view() === 'rows'}
          fallback={<TimelineView entries={filteredEntries()} />}
        >
          <Show
            when={filteredEntries().length > 0}
            fallback={
              <div
                style={{
                  color: 'var(--tsd-text-secondary, #999)',
                  'text-align': 'center',
                  padding: '24px',
                  'font-size': '13px',
                }}
              >
                No requests captured yet. Make a request to see it here.
              </div>
            }
          >
            <For each={filteredEntries()}>
              {(entry) => (
                <RequestRow entry={entry} maxTime={maxTime()} />
              )}
            </For>
          </Show>
        </Show>
      </div>

      {/* CSS keyframes for pulse animation */}
      <style>{`
        @keyframes tsd-pulse {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </MainPanel>
  )
}
