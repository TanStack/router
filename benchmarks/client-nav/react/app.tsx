import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useParams,
  useSearch,
} from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'

export type Scenario = 'default' | 'static-search-links'

function runPerfSelectorComputation(seed: number) {
  let value = Math.trunc(seed) | 0

  for (let index = 0; index < 100; index++) {
    value = (value * 1664525 + 1013904223 + index) >>> 0
  }

  return value
}

const selectors = Array.from({ length: 20 }, (_, index) => index)
const staticSearchLinkIds = Array.from({ length: 200 }, (_, index) => index)

function Params() {
  const params = useParams({
    strict: false,
    select: (params) => runPerfSelectorComputation(Number(params.id ?? 0)),
  })
  void params
  return null
}

function Search() {
  const search = useSearch({
    strict: false,
    select: (search) => runPerfSelectorComputation(Number(search.id ?? 0)),
  })
  void search
  return null
}

function Links() {
  return (
    <Link to="/$id" params={{ id: '0' }} search={{ id: '0' }}>
      Link
    </Link>
  )
}

function StaticSearchLinks(props: { linkId: number }) {
  return (
    <Link
      to="/links"
      search={{ linkId: `${props.linkId}` }}
      activeOptions={{ includeSearch: false }}
    >
      Link
    </Link>
  )
}

function Root() {
  return (
    <>
      {selectors.map((selector) => (
        <Params key={selector} />
      ))}
      {selectors.map((selector) => (
        <Search key={selector} />
      ))}
      {selectors.map((selector) => (
        <Links key={selector} />
      ))}
      <Outlet />
    </>
  )
}

function StaticSearchLinksRoot() {
  return (
    <>
      {staticSearchLinkIds.map((linkId) => (
        <StaticSearchLinks key={linkId} linkId={linkId} />
      ))}
      <Outlet />
    </>
  )
}

export function mountTestApp(
  container: Element,
  scenario: Scenario = 'default',
) {
  const rootRoute = createRootRoute({
    component: scenario === 'default' ? Root : StaticSearchLinksRoot,
  })

  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: scenario === 'default' ? '/$id' : '/links',
    component: () => <div />,
  })

  const router = createRouter({
    history: createMemoryHistory({
      initialEntries: [scenario === 'default' ? '/0' : '/links'],
    }),
    scrollRestoration: true,
    routeTree: rootRoute.addChildren([route]),
  })

  const reactRoot = createRoot(container)
  reactRoot.render(<RouterProvider router={router} />)

  return {
    router,
    unmount() {
      reactRoot.unmount()
    },
  }
}
