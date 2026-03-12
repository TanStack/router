/** @jsxImportSource solid-js */
import { For, Show } from 'solid-js'

const PHASE_COLORS: Record<string, string> = {
  'request-middleware': '#3b82f6',
  'route-middleware': '#60a5fa',
  'server-fn-middleware': '#93c5fd',
  'server-fn': '#f97316',
  ssr: '#a855f7',
  routing: '#22c55e',
  error: '#ef4444',
}

interface Phase {
  name: string
  startTime: number
  endTime: number | null
  duration: number | null
  children?: Array<{
    name: string
    startTime: number
    endTime: number
    exclusiveDuration: number
  }>
}

interface WaterfallBarProps {
  phases: Array<Phase>
  totalDuration: number | null
  maxTime: number
  onPhaseClick?: (phaseName: string) => void
}

export default function WaterfallBar(props: WaterfallBarProps) {
  const scale = () => (props.maxTime > 0 ? 100 / props.maxTime : 1)

  return (
    <div
      style={{
        position: 'relative',
        height: '24px',
        'background-color': 'var(--tsd-bg-secondary, #1a1a2e)',
        'border-radius': '4px',
        overflow: 'hidden',
        width: '100%',
      }}
    >
      <For each={props.phases}>
        {(phase) => {
          const left = () => phase.startTime * scale()
          const width = () =>
            phase.duration !== null
              ? phase.duration * scale()
              : (props.maxTime - phase.startTime) * scale()
          const color = () => PHASE_COLORS[phase.name] || '#6b7280'

          return (
            <div
              style={{
                position: 'absolute',
                left: `${left()}%`,
                width: `${Math.max(width(), 0.5)}%`,
                height: '100%',
                'background-color': color(),
                opacity: phase.endTime === null ? '0.7' : '1',
                animation:
                  phase.endTime === null
                    ? 'tsd-pulse 1.5s ease-in-out infinite'
                    : 'none',
                'border-radius': '2px',
                transition: 'width 0.1s ease-out',
                cursor: props.onPhaseClick ? 'pointer' : 'default',
              }}
              title={`${phase.name}: ${phase.duration !== null ? `${phase.duration.toFixed(1)}ms` : 'in-flight'}`}
              onClick={(e: Event) => {
                e.stopPropagation()
                props.onPhaseClick?.(phase.name)
              }}
            >
              <Show when={phase.children && phase.children.length > 0}>
                <For each={phase.children}>
                  {(child) => {
                    const childLeft = () =>
                      ((child.startTime - phase.startTime) /
                        (phase.duration || 1)) *
                      100
                    const childWidth = () =>
                      (child.exclusiveDuration / (phase.duration || 1)) * 100

                    return (
                      <div
                        style={{
                          position: 'absolute',
                          left: `${childLeft()}%`,
                          width: `${Math.max(childWidth(), 1)}%`,
                          height: '6px',
                          bottom: '0',
                          'background-color': 'rgba(255,255,255,0.3)',
                          'border-radius': '1px',
                        }}
                        title={`${child.name}: ${child.exclusiveDuration.toFixed(1)}ms`}
                      />
                    )
                  }}
                </For>
              </Show>
            </div>
          )
        }}
      </For>
    </div>
  )
}
