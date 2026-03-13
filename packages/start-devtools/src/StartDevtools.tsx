/** @jsxImportSource solid-js */
import { createSignal, createMemo, For, Show, onCleanup } from 'solid-js'
import { MainPanel, Header, HeaderLogo, Button } from '@tanstack/devtools-ui'
import { createRequestStore, type RequestEntry } from './store'
import FilterBar, { type Filters } from './components/FilterBar'
import RequestRow, { RequestTableHeader } from './components/RequestRow'
import TimelineOverview from './components/TimelineOverview'
import DetailSidebar from './components/DetailSidebar'

export default function StartDevtools() {
  const store = createRequestStore()
  onCleanup(() => store.cleanup())

  const [selectedId, setSelectedId] = createSignal<string | null>(null)
  const [timelineRange, setTimelineRange] = createSignal<[number, number]>([
    0, 1,
  ])
  const [filters, setFilters] = createSignal<Filters>({
    method: null,
    statusRange: null,
    type: null,
    urlSearch: '',
  })

  const allEntries = createMemo(() => Array.from(store.entries.values()))

  // Time span across all entries (for timeline)
  const timeSpan = createMemo(() => {
    const entries = allEntries()
    if (entries.length === 0) return { start: 0, end: 1000 }
    let minStart = Infinity
    let maxEnd = -Infinity
    for (const e of entries) {
      if (e.startTimestamp < minStart) minStart = e.startTimestamp
      const end = e.startTimestamp + (e.duration ?? 0)
      if (end > maxEnd) maxEnd = end
    }
    if (maxEnd <= minStart) maxEnd = minStart + 1000
    return { start: minStart, end: maxEnd }
  })

  // Filter by type/method/status/url, then by timeline range
  const filteredEntries = createMemo(() => {
    const f = filters()
    const [rangeLeft, rangeRight] = timelineRange()
    const span = timeSpan()
    const totalMs = span.end - span.start

    return allEntries().filter((entry: RequestEntry) => {
      // Standard filters
      if (f.method && entry.method !== f.method) return false
      if (f.statusRange && entry.status !== null) {
        const range = String(entry.status)[0] + 'xx'
        if (range !== f.statusRange) return false
      }
      if (f.type && entry.type !== f.type) return false
      if (f.urlSearch && !entry.url.includes(f.urlSearch)) return false

      // Timeline range filter
      const entryStart = (entry.startTimestamp - span.start) / totalMs
      const entryEnd =
        (entry.startTimestamp + (entry.duration ?? 0) - span.start) / totalMs
      // Show entry if it overlaps with the range
      if (entryEnd < rangeLeft || entryStart > rangeRight) return false

      return true
    })
  })

  const maxTime = createMemo(() => {
    let max = 0
    for (const e of filteredEntries()) {
      if (e.duration && e.duration > max) max = e.duration
    }
    return max || 100
  })

  const selectedEntry = createMemo(() => {
    const id = selectedId()
    if (!id) return null
    return store.entries.get(id) ?? null
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
          <Button variant="danger" onClick={() => store.clear()}>
            Clear
          </Button>
        </div>
      </Header>

      <FilterBar filters={filters()} onFilterChange={setFilters} />

      {/* Timeline overview */}
      <TimelineOverview
        entries={allEntries()}
        range={timelineRange()}
        onRangeChange={setTimelineRange}
      />

      {/* Main content: request table + optional detail sidebar */}
      <div
        style={{
          display: 'flex',
          'flex-grow': '1',
          'min-height': '0',
          overflow: 'hidden',
        }}
      >
        {/* Request table */}
        <div
          style={{
            flex: selectedEntry() ? '1 1 0' : '1 1 100%',
            'min-width': '0',
            display: 'flex',
            'flex-direction': 'column',
            overflow: 'hidden',
          }}
        >
          <RequestTableHeader />
          <div
            style={{
              'overflow-y': 'auto',
              flex: '1',
            }}
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
                  <RequestRow
                    entry={entry}
                    maxTime={maxTime()}
                    selected={selectedId() === entry.requestId}
                    onSelect={() =>
                      setSelectedId(
                        selectedId() === entry.requestId
                          ? null
                          : entry.requestId,
                      )
                    }
                  />
                )}
              </For>
            </Show>
          </div>
        </div>

        {/* Detail sidebar */}
        <Show when={selectedEntry()}>
          {(entry) => (
            <div
              style={{
                width: '380px',
                'flex-shrink': '0',
                'min-height': '0',
              }}
            >
              <DetailSidebar
                entry={entry()}
                onClose={() => setSelectedId(null)}
              />
            </div>
          )}
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
