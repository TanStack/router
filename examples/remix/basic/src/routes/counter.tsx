/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { createRoute } from '@tanstack/remix-router'
import { IslandCounter } from '../components/IslandCounter'
import { Route as RootRoute } from './__root'
import type { Handle } from '@remix-run/ui'

function CounterPage(_handle: Handle) {
  return () => (
    <main>
      <h1>Interactive island</h1>
      <p>
        The route component is server-rendered static HTML. The counter
        below is a <code>clientEntry()</code>-marked island — only it
        hydrates on the client, the rest stays static. Click "+" to
        verify the island is alive without re-running the route loader
        or re-mounting the surrounding tree.
      </p>
      <div style={{ margin: '1rem 0' }}>
        <IslandCounter label="Clicks" initial={0} />
      </div>
      <p>
        <small>
          Each `+` click runs purely on the client — no network round
          trip, no router re-render. The island state is local to the
          component.
        </small>
      </p>
    </main>
  )
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/counter',
  component: CounterPage,
})
