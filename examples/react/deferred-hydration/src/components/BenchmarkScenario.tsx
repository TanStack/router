import * as React from 'react'
import { ClientOnly } from '@tanstack/react-router'
import { formatBenchmarkNumber } from '~/benchmark'
import type { BenchmarkSettings, BenchmarkVariant } from '~/benchmark'
import { BenchmarkChart } from './BenchmarkChart'

function ChartSkeleton(props: { points: number }) {
  const bars = React.useMemo(
    () =>
      Array.from({ length: 24 }, (_, index) => {
        const height = 28 + ((index * 37) % 58)
        return {
          height,
          offset: 12 + ((index * 23) % 18),
        }
      }),
    [],
  )

  return (
    <div
      className="chart-skeleton"
      data-testid="chart-skeleton"
      aria-label="Chart loading placeholder"
    >
      <div className="skeleton-toolbar">
        <div>
          <span />
          <span />
        </div>
        <span />
      </div>
      <div className="skeleton-plot" aria-hidden="true">
        <svg viewBox="0 0 960 320" role="img">
          <path
            d="M0 226 C120 196 168 116 248 146 C330 176 346 236 440 202 C530 168 560 84 646 116 C734 150 772 240 960 174"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            opacity="0.36"
          />
          <path
            d="M0 260 C150 224 210 190 318 206 C430 222 496 126 584 142 C690 160 748 216 960 132"
            fill="none"
            stroke="currentColor"
            strokeWidth="5"
            strokeLinecap="round"
            opacity="0.22"
          />
          {bars.map((bar, index) => (
            <rect
              key={index}
              x={index * 40 + 10}
              y={284 - bar.height - bar.offset}
              width="18"
              height={bar.height}
              rx="4"
              opacity="0.2"
            />
          ))}
        </svg>
      </div>
      <p>
        {formatBenchmarkNumber(props.points)} chart points reserved for
        hydration.
      </p>
    </div>
  )
}

export function BenchmarkScenario(props: {
  variant: BenchmarkVariant
  settings: BenchmarkSettings
}) {
  const [hydrated, setHydrated] = React.useState(false)

  React.useEffect(() => {
    setHydrated(true)
  }, [])

  return (
    <section
      className="chart-section"
      data-testid="chart-region"
      data-variant={props.variant}
      data-hydrated={hydrated ? 'true' : 'false'}
      data-points={props.settings.points}
    >
      <div className="chart-heading">
        <div>
          <p className="eyebrow">Deferred chart widget</p>
          <h2>LineBarAreaComposedChart</h2>
        </div>
        <span data-testid="chart-hydration-state">
          {hydrated ? 'hydrated' : 'static'}
        </span>
      </div>

      <ClientOnly fallback={<ChartSkeleton points={props.settings.points} />}>
        <BenchmarkChart points={props.settings.points} />
      </ClientOnly>
    </section>
  )
}
