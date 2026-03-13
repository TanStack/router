/** @jsxImportSource solid-js */
import { createSignal, Show, For } from 'solid-js'
import type { RequestEntry } from '../store'

type Tab = 'timing' | 'middleware' | 'headers' | 'response'

interface DetailSidebarProps {
  entry: RequestEntry
  onClose: () => void
}

const STATUS_COLORS: Record<string, string> = {
  '2': '#22c55e',
  '3': '#eab308',
  '4': '#f97316',
  '5': '#ef4444',
}

const PHASE_COLORS: Record<string, string> = {
  'request-middleware': '#3b82f6',
  'route-middleware': '#60a5fa',
  'server-fn-middleware': '#93c5fd',
  'server-fn': '#f97316',
  ssr: '#a855f7',
}

const MW_SCOPE_COLORS: Record<string, string> = {
  request: '#3b82f6',
  route: '#60a5fa',
  'server-fn': '#93c5fd',
  global: '#93c5fd',
  function: '#93c5fd',
}

function displayUrl(entry: RequestEntry): string {
  if (entry.serverFn?.name) return entry.serverFn.name
  try {
    const u = new URL(entry.url, 'http://localhost')
    return u.pathname
  } catch {
    return entry.url
  }
}

export default function DetailSidebar(props: DetailSidebarProps) {
  const [tab, setTab] = createSignal<Tab>('timing')

  const statusColor = () => {
    if (!props.entry.status) return '#6b7280'
    return STATUS_COLORS[String(props.entry.status)[0]!] ?? '#6b7280'
  }

  const maxPhaseDuration = () => {
    let max = 0
    for (const p of props.entry.phases) {
      if (p.duration && p.duration > max) max = p.duration
    }
    return max || 1
  }

  return (
    <div
      style={{
        'border-left': '1px solid var(--tsd-border, #333)',
        background: 'var(--tsd-bg-tertiary, #16162a)',
        display: 'flex',
        'flex-direction': 'column',
        overflow: 'hidden',
        height: '100%',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '8px 12px',
          'border-bottom': '1px solid var(--tsd-border, #333)',
          display: 'flex',
          'align-items': 'center',
          gap: '8px',
          'flex-shrink': '0',
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
            color: 'var(--tsd-text, #ccc)',
            'font-size': '11px',
            overflow: 'hidden',
            'text-overflow': 'ellipsis',
            'white-space': 'nowrap',
            flex: '1',
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
        <button
          onClick={props.onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--tsd-text-secondary, #999)',
            cursor: 'pointer',
            'font-size': '16px',
            padding: '0 4px',
            'line-height': '1',
          }}
          title="Close"
        >
          &times;
        </button>
      </div>

      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          'border-bottom': '1px solid var(--tsd-border, #333)',
          'flex-shrink': '0',
        }}
      >
        <For each={['timing', 'middleware', 'headers', 'response'] as Tab[]}>
          {(t) => (
            <button
              onClick={() => setTab(t)}
              style={{
                padding: '6px 14px',
                'font-size': '11px',
                color:
                  tab() === t
                    ? 'var(--tsd-text, #e0e0e0)'
                    : 'var(--tsd-text-secondary, #999)',
                cursor: 'pointer',
                'border-bottom':
                  tab() === t ? '2px solid #6366f1' : '2px solid transparent',
                background: 'none',
                border: 'none',
                'border-bottom-width': '2px',
                'border-bottom-style': 'solid',
                'border-bottom-color':
                  tab() === t ? '#6366f1' : 'transparent',
                'text-transform': 'capitalize',
              }}
            >
              {t}
            </button>
          )}
        </For>
      </div>

      {/* Content */}
      <div
        style={{
          'overflow-y': 'auto',
          flex: '1',
          padding: '12px',
        }}
      >
        <Show when={tab() === 'timing'}>
          <TimingTab entry={props.entry} maxDuration={maxPhaseDuration()} />
        </Show>
        <Show when={tab() === 'middleware'}>
          <MiddlewareTab entry={props.entry} />
        </Show>
        <Show when={tab() === 'headers'}>
          <HeadersTab entry={props.entry} />
        </Show>
        <Show when={tab() === 'response'}>
          <ResponseTab entry={props.entry} />
        </Show>
      </div>
    </div>
  )
}

/* ── Timing Tab ─────────────────────────────────────── */

function TimingTab(props: { entry: RequestEntry; maxDuration: number }) {
  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '16px' }}>
      {/* Phase bars */}
      <div>
        <SectionTitle>Request Phases</SectionTitle>
        <div
          style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}
        >
          <For each={props.entry.phases}>
            {(phase) => (
              <div
                style={{
                  display: 'grid',
                  'grid-template-columns': '120px 1fr 60px',
                  gap: '8px',
                  'align-items': 'center',
                }}
              >
                <span
                  style={{
                    'font-size': '10px',
                    color: 'var(--tsd-text, #ccc)',
                    'text-align': 'right',
                    overflow: 'hidden',
                    'text-overflow': 'ellipsis',
                    'white-space': 'nowrap',
                  }}
                  title={phase.name}
                >
                  {phase.name}
                </span>
                <div
                  style={{
                    height: '14px',
                    background: 'var(--tsd-bg-secondary, #1a1a2e)',
                    'border-radius': '3px',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      height: '100%',
                      'border-radius': '3px',
                      top: '0',
                      left: '0',
                      width: `${((phase.duration ?? 0) / props.maxDuration) * 100}%`,
                      'background-color':
                        PHASE_COLORS[phase.name] ?? '#6b7280',
                      transition: 'width 0.2s ease',
                    }}
                  />
                </div>
                <span
                  style={{
                    'font-size': '10px',
                    color: 'var(--tsd-text-secondary, #999)',
                    'font-family': 'monospace',
                  }}
                >
                  {phase.duration !== null
                    ? `${phase.duration.toFixed(1)}ms`
                    : '...'}
                </span>
              </div>
            )}
          </For>
          <Show when={props.entry.phases.length === 0}>
            <EmptyMessage>No phase data yet</EmptyMessage>
          </Show>
        </div>
      </div>

      {/* Summary */}
      <div>
        <SectionTitle>Summary</SectionTitle>
        <div
          style={{
            display: 'grid',
            'grid-template-columns': 'auto 1fr',
            gap: '4px 12px',
            'font-size': '11px',
          }}
        >
          <DetailKey>URL</DetailKey>
          <DetailVal mono>{props.entry.url}</DetailVal>
          <DetailKey>Method</DetailKey>
          <DetailVal>{props.entry.method}</DetailVal>
          <DetailKey>Status</DetailKey>
          <DetailVal>
            {props.entry.status !== null ? String(props.entry.status) : '...'}
          </DetailVal>
          <DetailKey>Total Duration</DetailKey>
          <DetailVal>
            {props.entry.duration !== null
              ? `${props.entry.duration.toFixed(1)}ms`
              : 'pending'}
          </DetailVal>
          <Show when={props.entry.type}>
            <DetailKey>Type</DetailKey>
            <DetailVal>{props.entry.type}</DetailVal>
          </Show>
          <Show when={props.entry.serverFn}>
            <DetailKey>Server Function</DetailKey>
            <DetailVal mono>{props.entry.serverFn!.name}</DetailVal>
            <DetailKey>Filename</DetailKey>
            <DetailVal mono>{props.entry.serverFn!.filename}</DetailVal>
          </Show>
        </div>
      </div>
    </div>
  )
}

/* ── Middleware Tab ──────────────────────────────────── */

function MiddlewareTab(props: { entry: RequestEntry }) {
  const middlewarePhases = () =>
    props.entry.phases.filter((p) => p.name.endsWith('-middleware'))

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '16px' }}>
      <For each={middlewarePhases()}>
        {(phase) => (
          <div>
            <SectionTitle>{phase.name}</SectionTitle>
            <Show
              when={phase.children && phase.children.length > 0}
              fallback={
                <div
                  style={{
                    padding: '8px',
                    background: 'var(--tsd-bg-secondary, #1a1a2e)',
                    'border-radius': '4px',
                    'font-size': '11px',
                    color: 'var(--tsd-text-secondary, #999)',
                  }}
                >
                  {phase.duration !== null
                    ? `Total: ${phase.duration.toFixed(1)}ms`
                    : 'In progress...'}
                </div>
              }
            >
              <div
                style={{
                  display: 'flex',
                  'flex-direction': 'column',
                  gap: '4px',
                }}
              >
                <For each={phase.children}>
                  {(mw) => {
                    const scope = phase.name.replace('-middleware', '')
                    const borderColor =
                      MW_SCOPE_COLORS[scope] ?? '#6b7280'
                    return (
                      <div
                        style={{
                          display: 'flex',
                          'align-items': 'center',
                          gap: '8px',
                          padding: '4px 8px',
                          background: 'var(--tsd-bg-secondary, #1a1a2e)',
                          'border-radius': '4px',
                          'border-left': `3px solid ${borderColor}`,
                        }}
                      >
                        <span
                          style={{
                            flex: '1',
                            'font-size': '11px',
                            color: 'var(--tsd-text, #e0e0e0)',
                          }}
                        >
                          {mw.name}
                        </span>
                        <span
                          style={{
                            'font-size': '9px',
                            color: 'var(--tsd-text-secondary, #999)',
                            'text-transform': 'uppercase',
                            padding: '1px 4px',
                            background: 'var(--tsd-bg-primary, #2a2a3e)',
                            'border-radius': '2px',
                          }}
                        >
                          {scope}
                        </span>
                        <span
                          style={{
                            'font-size': '11px',
                            color: '#60a5fa',
                            'font-family': 'monospace',
                          }}
                        >
                          {mw.exclusiveDuration.toFixed(1)}ms
                        </span>
                      </div>
                    )
                  }}
                </For>
              </div>
            </Show>
          </div>
        )}
      </For>
      <Show when={middlewarePhases().length === 0}>
        <EmptyMessage>No middleware executed for this request</EmptyMessage>
      </Show>
    </div>
  )
}

/* ── Headers Tab ────────────────────────────────────── */

function HeadersTab(props: { entry: RequestEntry }) {
  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '16px' }}>
      <div>
        <SectionTitle>Request Headers</SectionTitle>
        <HeaderList headers={props.entry.headers} />
      </div>
      <Show when={props.entry.responseHeaders}>
        <div>
          <SectionTitle>Response Headers</SectionTitle>
          <HeaderList headers={props.entry.responseHeaders!} />
        </div>
      </Show>
    </div>
  )
}

function HeaderList(props: { headers: Record<string, string> }) {
  const entries = () => Object.entries(props.headers)

  return (
    <div
      style={{
        display: 'grid',
        'grid-template-columns': 'auto 1fr',
        gap: '2px 12px',
        'font-size': '11px',
      }}
    >
      <Show
        when={entries().length > 0}
        fallback={<EmptyMessage>No headers</EmptyMessage>}
      >
        <For each={entries()}>
          {([key, value]) => (
            <>
              <span
                style={{
                  color: 'var(--tsd-text-secondary, #999)',
                  'font-family': 'monospace',
                  'font-size': '10px',
                }}
              >
                {key}
              </span>
              <span
                style={{
                  color: 'var(--tsd-text, #e0e0e0)',
                  'word-break': 'break-all',
                  'font-family': 'monospace',
                  'font-size': '10px',
                }}
              >
                {value}
              </span>
            </>
          )}
        </For>
      </Show>
    </div>
  )
}

/* ── Response Tab ───────────────────────────────────── */

function ResponseTab(props: { entry: RequestEntry }) {
  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '16px' }}>
      <Show when={props.entry.serverFn}>
        <div>
          <SectionTitle>Server Function</SectionTitle>
          <div
            style={{
              display: 'grid',
              'grid-template-columns': 'auto 1fr',
              gap: '4px 12px',
              'font-size': '11px',
            }}
          >
            <DetailKey>Name</DetailKey>
            <DetailVal mono>{props.entry.serverFn!.name}</DetailVal>
            <DetailKey>ID</DetailKey>
            <DetailVal mono>{props.entry.serverFn!.id}</DetailVal>
            <DetailKey>Filename</DetailKey>
            <DetailVal mono>{props.entry.serverFn!.filename}</DetailVal>
            <DetailKey>Input Type</DetailKey>
            <DetailVal>{props.entry.serverFn!.inputType}</DetailVal>
            <Show when={props.entry.serverFn!.resultType}>
              <DetailKey>Result Type</DetailKey>
              <DetailVal>{props.entry.serverFn!.resultType}</DetailVal>
            </Show>
          </div>
        </div>
      </Show>

      <Show when={props.entry.serialization}>
        <div>
          <SectionTitle>Serialization</SectionTitle>
          <div
            style={{
              display: 'grid',
              'grid-template-columns': 'auto 1fr',
              gap: '4px 12px',
              'font-size': '11px',
            }}
          >
            <DetailKey>Format</DetailKey>
            <DetailVal>{props.entry.serialization!.format}</DetailVal>
            <DetailKey>Content-Type</DetailKey>
            <DetailVal mono>
              {props.entry.serialization!.contentType}
            </DetailVal>
            <DetailKey>Raw Streams</DetailKey>
            <DetailVal>
              {props.entry.serialization!.hasRawStreams ? 'Yes' : 'No'}
            </DetailVal>
          </div>
        </div>
      </Show>

      <Show when={props.entry.redirect}>
        <div>
          <SectionTitle>Redirect</SectionTitle>
          <div
            style={{
              display: 'grid',
              'grid-template-columns': 'auto 1fr',
              gap: '4px 12px',
              'font-size': '11px',
            }}
          >
            <DetailKey>From</DetailKey>
            <DetailVal mono>{props.entry.redirect!.from}</DetailVal>
            <DetailKey>To</DetailKey>
            <DetailVal mono>{props.entry.redirect!.to}</DetailVal>
            <DetailKey>Status</DetailKey>
            <DetailVal>{String(props.entry.redirect!.status)}</DetailVal>
          </div>
        </div>
      </Show>

      <Show when={props.entry.streamChunks.length > 0}>
        <div>
          <SectionTitle>Stream Progress</SectionTitle>
          <span
            style={{
              'font-size': '11px',
              color: 'var(--tsd-text-secondary, #999)',
            }}
          >
            {props.entry.streamChunks.length} chunks received
          </span>
        </div>
      </Show>

      <Show when={props.entry.errors.length > 0}>
        <div>
          <SectionTitle style={{ color: '#ef4444' }}>Errors</SectionTitle>
          <For each={props.entry.errors}>
            {(err) => (
              <div
                style={{
                  'margin-bottom': '8px',
                  padding: '8px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  'border-radius': '4px',
                  'border-left': '3px solid #ef4444',
                }}
              >
                <div
                  style={{ 'font-size': '11px', color: '#fca5a5' }}
                >
                  <strong>[{err.phase}]</strong> {err.message}
                </div>
                <Show when={err.stack}>
                  <pre
                    style={{
                      'font-size': '9px',
                      'white-space': 'pre-wrap',
                      'margin-top': '4px',
                      color: 'var(--tsd-text-secondary, #999)',
                    }}
                  >
                    {err.stack}
                  </pre>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show
        when={
          !props.entry.serverFn &&
          !props.entry.serialization &&
          !props.entry.redirect &&
          props.entry.errors.length === 0 &&
          props.entry.streamChunks.length === 0
        }
      >
        <EmptyMessage>No response data available</EmptyMessage>
      </Show>
    </div>
  )
}

/* ── Shared small components ────────────────────────── */

function SectionTitle(props: {
  children: any
  style?: Record<string, string>
}) {
  return (
    <h3
      style={{
        'font-size': '11px',
        color: 'var(--tsd-text-secondary, #999)',
        'text-transform': 'uppercase',
        'letter-spacing': '0.5px',
        'margin-bottom': '8px',
        'padding-bottom': '4px',
        'border-bottom': '1px solid var(--tsd-bg-secondary, #2a2a3e)',
        ...props.style,
      }}
    >
      {props.children}
    </h3>
  )
}

function DetailKey(props: { children: any }) {
  return (
    <span style={{ color: 'var(--tsd-text-secondary, #999)' }}>
      {props.children}
    </span>
  )
}

function DetailVal(props: { children: any; mono?: boolean }) {
  return (
    <span
      style={{
        color: 'var(--tsd-text, #e0e0e0)',
        'word-break': 'break-all',
        ...(props.mono
          ? {
              'font-family':
                "'SF Mono', 'Fira Code', monospace",
              'font-size': '10px',
            }
          : {}),
      }}
    >
      {props.children}
    </span>
  )
}

function EmptyMessage(props: { children: any }) {
  return (
    <div
      style={{
        color: 'var(--tsd-text-secondary, #999)',
        'font-size': '11px',
        'font-style': 'italic',
        padding: '8px 0',
      }}
    >
      {props.children}
    </div>
  )
}
