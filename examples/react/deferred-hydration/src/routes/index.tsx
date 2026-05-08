import { createFileRoute, Link } from '@tanstack/react-router'
import { benchmarkRoutes } from '~/benchmark'
import type * as React from 'react'

export const Route = createFileRoute('/')({
  component: IndexRoute,
})

function IndexRoute() {
  const barStyle = (height: string) =>
    ({
      '--h': height,
    }) as React.CSSProperties

  return (
    <main className="page-shell overview-page">
      <section className="hero-band">
        <div>
          <p className="eyebrow">TanStack Start benchmark</p>
          <h1>Measure what deferred hydration actually trades.</h1>
          <p>
            This lab compares a client-only chart skeleton and a real
            server-rendered interactive table while measuring startup
            JavaScript, responsiveness, and the latency paid when a deferred
            boundary finally hydrates.
          </p>
        </div>
        <div className="mini-chart" aria-hidden="true">
          <span style={barStyle('72%')} />
          <span style={barStyle('46%')} />
          <span style={barStyle('58%')} />
          <span style={barStyle('30%')} />
          <span style={barStyle('84%')} />
        </div>
      </section>

      <section className="route-grid" aria-label="Benchmark variants">
        {benchmarkRoutes.map((route) => (
          <Link
            key={route.to}
            to={route.to}
            search={{
              points: 1000,
            }}
            className="route-card"
          >
            <strong>{route.label}</strong>
            <span>{route.summary}</span>
          </Link>
        ))}
      </section>

      <section className="metric-strip" aria-label="Measured metrics">
        <div>
          <strong>Bytes</strong>
          <span>Initial and triggered JavaScript loaded by Chrome.</span>
        </div>
        <div>
          <strong>Slowdown</strong>
          <span>Chrome CPU throttling at 1x, 4x, and 6x.</span>
        </div>
        <div>
          <strong>INP</strong>
          <span>Scripted shell and widget interactions via Web Vitals.</span>
        </div>
      </section>
    </main>
  )
}
