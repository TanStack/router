import * as React from 'react'
import { formatBenchmarkNumber } from '~/benchmark'
import type { BenchmarkSettings, BenchmarkVariant } from '~/benchmark'
import { StartupMarker } from './StartupMarker'

const labels: Record<BenchmarkVariant, string> = {
  full: 'Full hydration',
  'defer-visible': 'Deferred: visible',
  'defer-visible-prefetch': 'Deferred: visible + idle prefetch',
  'defer-runtime-only': 'Deferred: runtime only',
  'ssr-full': 'SSR table: full hydration',
  'ssr-defer-visible': 'SSR table: visible',
  'ssr-defer-visible-prefetch': 'SSR table: visible + idle prefetch',
  'ssr-defer-runtime-only': 'SSR table: runtime only',
  'ssr-defer-interaction': 'SSR table: interaction',
}

const descriptions: Record<BenchmarkVariant, string> = {
  full: 'The chart dependency is part of startup JavaScript and the client-only chart mounts as soon as the app hydrates.',
  'defer-visible':
    'The skeleton stays server-rendered until the chart boundary enters the viewport.',
  'defer-visible-prefetch':
    'The child chunk can load during idle time, but hydration still waits for visibility.',
  'defer-runtime-only':
    'The chart code remains eager, while the client-only chart mount waits for visibility.',
  'ssr-full':
    'A real server-rendered report table hydrates during startup and becomes an app-like grid immediately.',
  'ssr-defer-visible':
    'The table HTML is useful on the initial document, while sorting, selection, expansion, visibility, density, and resizing wait for visibility.',
  'ssr-defer-visible-prefetch':
    'The table chunk may load during idle time, but the SSR table does not hydrate until it enters the viewport.',
  'ssr-defer-runtime-only':
    'The table runtime remains in startup JavaScript, but hydration of the SSR table waits for visibility.',
  'ssr-defer-interaction':
    'The SSR table stays static until the first click intent asks for client-side interactivity.',
}

export function ScenarioPage(props: {
  variant: BenchmarkVariant
  settings: BenchmarkSettings
  children: React.ReactNode
}) {
  const [shellClicks, setShellClicks] = React.useState(0)

  return (
    <main className="page-shell scenario-page" data-variant={props.variant}>
      <StartupMarker />
      <section className="report-header">
        <p className="eyebrow">Analytics report</p>
        <h1>{labels[props.variant]}</h1>
        <p>{descriptions[props.variant]}</p>
        <dl className="settings-list" aria-label="Benchmark settings">
          <div>
            <dt>Points</dt>
            <dd>{formatBenchmarkNumber(props.settings.points)}</dd>
          </div>
        </dl>
        <button
          type="button"
          className="shell-action"
          data-testid="shell-action"
          onClick={() => setShellClicks((value) => value + 1)}
        >
          Refresh shell <span data-testid="shell-click-count">{shellClicks}</span>
        </button>
      </section>

      <section className="summary-band" aria-label="Report summary">
        <div>
          <strong>Pipeline health</strong>
          <span>93.4%</span>
        </div>
        <div>
          <strong>Revenue at risk</strong>
          <span>$184k</span>
        </div>
        <div>
          <strong>Regions watched</strong>
          <span>12</span>
        </div>
      </section>

      <div className="scroll-spacer" data-testid="scroll-spacer">
          <span>Scroll to the benchmark widget</span>
      </div>

      {props.children}
    </main>
  )
}
