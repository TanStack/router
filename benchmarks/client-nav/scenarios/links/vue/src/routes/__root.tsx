import * as Vue from 'vue'
import {
  Link,
  MatchRoute,
  Outlet,
  createRootRoute,
  useMatchRoute,
} from '@tanstack/vue-router'
import {
  itemIds,
  matchProbeIds,
  stepItemIds,
  variantSearch,
} from '../../../shared'

const StatusPanel = Vue.defineComponent({
  setup() {
    const matchRoute = useMatchRoute()
    const probes = matchProbeIds.map((id) => ({
      id,
      match: matchRoute({ to: '/items/$id', params: { id } }),
    }))

    return () => (
      <aside>
        {probes.map(({ id, match }) => (
          <span key={id}>{match.value ? `on-${id}` : ''}</span>
        ))}
        <MatchRoute to="/">
          {(match: unknown) => (match ? 'at-home' : '')}
        </MatchRoute>
        <MatchRoute to="/about">
          {(match: unknown) => (match ? 'at-about' : '')}
        </MatchRoute>
        <MatchRoute to="/" fuzzy>
          {(match: unknown) => (match ? 'under-root' : '')}
        </MatchRoute>
        <MatchRoute to="/about" fuzzy>
          {(match: unknown) => (match ? 'under-about' : '')}
        </MatchRoute>
        <MatchRoute to="/about" includeSearch>
          {(match: unknown) => (match ? 'about-search' : '')}
        </MatchRoute>
      </aside>
    )
  },
})

const LinkGrid = Vue.defineComponent({
  setup() {
    return () => (
      <div>
        {itemIds.map((id) => (
          <div key={id}>
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
              {({ isActive }: { isActive: boolean }) =>
                isActive ? `Item ${id} on` : `Item ${id} off`
              }
            </Link>
          </div>
        ))}
      </div>
    )
  },
})

const RootComponent = Vue.defineComponent({
  setup() {
    return () => (
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
  },
})

export const Route = createRootRoute({
  component: RootComponent,
})
