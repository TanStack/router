/** @jsxImportSource solid-js */
import { createSignal, Show, For } from 'solid-js'
import { JsonTree } from '@tanstack/devtools-ui'
import type { RequestEntry } from '../store'

interface DetailPanelProps {
  entry: RequestEntry
  selectedPhase: string | null
}

export default function DetailPanel(props: DetailPanelProps) {
  const [viewMode, setViewMode] = createSignal<'structured' | 'raw'>(
    'structured',
  )

  const phaseData = () => {
    if (!props.selectedPhase) return null
    return props.entry.phases.find((p) => p.name === props.selectedPhase)
  }

  return (
    <div
      style={{
        padding: '12px',
        'border-top': '1px solid var(--tsd-border, #333)',
        'font-size': '12px',
        'max-height': '300px',
        'overflow-y': 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: '8px',
          'margin-bottom': '8px',
        }}
      >
        <button
          onClick={() => setViewMode('structured')}
          style={{
            padding: '2px 8px',
            'border-radius': '4px',
            border: 'none',
            'background-color':
              viewMode() === 'structured'
                ? 'var(--tsd-accent, #6366f1)'
                : 'transparent',
            color: 'var(--tsd-text, #e0e0e0)',
            cursor: 'pointer',
          }}
        >
          Structured
        </button>
        <button
          onClick={() => setViewMode('raw')}
          style={{
            padding: '2px 8px',
            'border-radius': '4px',
            border: 'none',
            'background-color':
              viewMode() === 'raw'
                ? 'var(--tsd-accent, #6366f1)'
                : 'transparent',
            color: 'var(--tsd-text, #e0e0e0)',
            cursor: 'pointer',
          }}
        >
          Raw
        </button>
      </div>

      <Show when={viewMode() === 'structured'}>
        <div
          style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}
        >
          <Show when={props.entry.headers}>
            <div>
              <strong>Request Headers</strong>
              <JsonTree
                value={props.entry.headers}
                copyable
                defaultExpansionDepth={1}
              />
            </div>
          </Show>

          <Show when={props.entry.responseHeaders}>
            <div>
              <strong>Response Headers</strong>
              <JsonTree
                value={props.entry.responseHeaders}
                copyable
                defaultExpansionDepth={1}
              />
            </div>
          </Show>

          <Show when={props.entry.routeMatch}>
            <div>
              <strong>Route Match</strong>
              <JsonTree
                value={props.entry.routeMatch}
                copyable
                defaultExpansionDepth={2}
              />
            </div>
          </Show>

          <Show when={props.entry.serverFn}>
            <div>
              <strong>Server Function</strong>
              <JsonTree
                value={props.entry.serverFn}
                copyable
                defaultExpansionDepth={2}
              />
            </div>
          </Show>

          <Show when={props.entry.serialization}>
            <div>
              <strong>Serialization</strong>
              <JsonTree
                value={props.entry.serialization}
                copyable
                defaultExpansionDepth={2}
              />
            </div>
          </Show>

          <Show when={props.entry.redirect}>
            <div>
              <strong>Redirect</strong>
              <JsonTree
                value={props.entry.redirect}
                copyable
                defaultExpansionDepth={2}
              />
            </div>
          </Show>

          <Show when={props.entry.streamChunks.length > 0}>
            <div>
              <strong>Stream Progress</strong>
              <span
                style={{
                  'margin-left': '8px',
                  color: 'var(--tsd-text-secondary, #999)',
                }}
              >
                {props.entry.streamChunks.length} chunks
              </span>
            </div>
          </Show>

          <Show when={props.entry.errors.length > 0}>
            <div>
              <strong style={{ color: '#ef4444' }}>Errors</strong>
              <For each={props.entry.errors}>
                {(err) => (
                  <div style={{ 'margin-top': '4px', color: '#fca5a5' }}>
                    <div>
                      [{err.phase}] {err.message}
                    </div>
                    <Show when={err.stack}>
                      <pre
                        style={{
                          'font-size': '10px',
                          'white-space': 'pre-wrap',
                          'margin-top': '2px',
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

          <Show when={phaseData()}>
            <div>
              <strong>Selected Phase: {phaseData()!.name}</strong>
              <JsonTree
                value={phaseData()}
                copyable
                defaultExpansionDepth={2}
              />
            </div>
          </Show>
        </div>
      </Show>

      <Show when={viewMode() === 'raw'}>
        <pre
          style={{
            'white-space': 'pre-wrap',
            'word-break': 'break-all',
            'font-size': '11px',
            color: 'var(--tsd-text, #e0e0e0)',
          }}
        >
          {JSON.stringify(props.entry, null, 2)}
        </pre>
      </Show>
    </div>
  )
}
