import { For } from 'solid-js'
import {
  Link,
  MatchRoute,
  Outlet,
  createRootRoute,
  useMatchRoute,
} from '@tanstack/solid-router'
import {
  itemIds,
  matchProbeIds,
  stepItemIds,
  variantSearch,
} from '../../../shared'

export const Route = createRootRoute({
  component: RootComponent,
})

function StatusPanel() {
  const matchRoute = useMatchRoute()

  return (
    <aside>
      <For each={matchProbeIds}>
        {(id) => (
          <span>
            {matchRoute({ to: '/items/$id', params: { id } })()
              ? `on-${id}`
              : ''}
          </span>
        )}
      </For>
      <MatchRoute to="/">{(match) => (match ? 'at-home' : '')}</MatchRoute>
      <MatchRoute to="/about">
        {(match) => (match ? 'at-about' : '')}
      </MatchRoute>
      <MatchRoute to="/" fuzzy>
        {(match) => (match ? 'under-root' : '')}
      </MatchRoute>
      <MatchRoute to="/about" fuzzy>
        {(match) => (match ? 'under-about' : '')}
      </MatchRoute>
      <MatchRoute to="/about" includeSearch>
        {(match) => (match ? 'about-search' : '')}
      </MatchRoute>
    </aside>
  )
}

function LinkGrid() {
  return (
    <div>
      <For each={itemIds}>
        {(id) => (
          <div>
            <Link
              to="/items/$id"
              params={{ id }}
              data-testid={
                stepItemIds.includes(id) ? `go-item-${id}` : undefined
              }
            >
              {`Item ${id}`}
            </Link>
            <Link
              to="/items/$id"
              params={{ id }}
              activeOptions={{ exact: true }}
              activeProps={{ class: 'active-link' }}
              inactiveProps={{ class: 'inactive-link' }}
            >
              {`Item ${id} exact`}
            </Link>
            <Link
              to="/items/$id"
              params={{ id }}
              search={variantSearch}
              activeOptions={{ includeSearch: false }}
            >
              {`Item ${id} search`}
            </Link>
            <Link to="/items/$id" params={{ id }} hash={`section-${id}`}>
              {`Item ${id} hash`}
            </Link>
            <Link
              to="/items/$id"
              params={{ id }}
              activeOptions={{ exact: true }}
            >
              {({ isActive }) =>
                isActive ? `Item ${id} on` : `Item ${id} off`
              }
            </Link>
          </div>
        )}
      </For>
    </div>
  )
}

function RootComponent() {
  return (
    <>
      <nav>
        <Link to="/" data-testid="go-home">
          Home
        </Link>
        <Link to="/about" data-testid="go-about">
          About
        </Link>
      </nav>
      <StatusPanel />
      <LinkGrid />
      <Outlet />
    </>
  )
}
