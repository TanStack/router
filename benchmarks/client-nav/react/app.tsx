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

export type Scenario =
  | 'default'
  | 'static-search-links'
  | 'static-search-links-active-search'

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

function StaticSearchLinks(props: {
  linkId: number
  includeActiveSearch: boolean
}) {
  const activeOptions = props.includeActiveSearch
    ? undefined
    : { includeSearch: false as const }

  return (
    <Link
      to="/links"
      search={{ linkId: `${props.linkId}` }}
      activeOptions={activeOptions}
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

function StaticSearchLinksRoot(props: { includeActiveSearch: boolean }) {
  return (
    <>
      {staticSearchLinkIds.map((linkId) => (
        <StaticSearchLinks
          key={linkId}
          linkId={linkId}
          includeActiveSearch={props.includeActiveSearch}
        />
      ))}
      <Outlet />
    </>
  )
}

export function mountTestApp(
  container: Element,
  scenario: Scenario = 'default',
) {
  const isStaticSearchScenario = scenario !== 'default'

  const rootRoute = createRootRoute({
    component: isStaticSearchScenario
      ? () => (
          <StaticSearchLinksRoot
            includeActiveSearch={
              scenario === 'static-search-links-active-search'
            }
          />
        )
      : Root,
  })

  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: isStaticSearchScenario ? '/links' : '/$id',
    component: () => <div />,
  })

  const router = createRouter({
    history: createMemoryHistory({
      initialEntries: [isStaticSearchScenario ? '/links' : '/0'],
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
