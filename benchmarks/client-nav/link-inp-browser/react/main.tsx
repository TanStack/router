import { createRoot } from 'react-dom/client'
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import '../shared/probe'
import {
  LANE_INDEXES,
  isUpdaterCase,
  laneFixedTarget,
  laneLinkCounts,
  leafLoader,
  readConfig,
} from '../shared/cases'
import type { CaseId } from '../shared/cases'

const { caseId, loaderMs } = readConfig()
const [layoutCount, leafCount] = laneLinkCounts(caseId)

function laneLink(id: CaseId, index: number) {
  const label = `Link ${index}`
  const itemId = `item-${index % 40}`
  if (isUpdaterCase(id)) {
    const search = (previous: { page?: number }) => ({
      ...previous,
      page: (index % 5) + 1,
    })
    // Both forms read the current location: even hrefs follow the current
    // path, odd hrefs stay unchanged.
    return index % 2 === 0 ? (
      <Link
        key={index}
        data-perf-link={index}
        to="."
        search={search as any}
        preload={false}
      >
        {label}
      </Link>
    ) : (
      <Link
        key={index}
        data-perf-link={index}
        to="/items/$itemId"
        params={{ itemId }}
        search={search as any}
        preload={false}
      >
        {label}
      </Link>
    )
  }
  const target = laneFixedTarget(index)
  return target ? (
    <Link key={index} data-perf-link={index} to={target} preload={false}>
      {label}
    </Link>
  ) : (
    <Link
      key={index}
      data-perf-link={index}
      to="/items/$itemId"
      params={{ itemId }}
      preload={false}
    >
      {label}
    </Link>
  )
}

const rootRoute = createRootRoute({
  component: () => (
    <>
      <nav>
        <Link to="/lane/a" preload={false} data-testid="go-a">
          to a
        </Link>{' '}
        <Link to="/lane/b" preload={false} data-testid="go-b">
          to b
        </Link>
      </nav>
      <Outlet />
    </>
  ),
})
const laneRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'lane',
  component: () => (
    <>
      <section data-owner="layout">
        {LANE_INDEXES.slice(0, layoutCount).map((index) =>
          laneLink(caseId, index),
        )}
      </section>
      <Outlet />
    </>
  ),
})
const laneARoute = createRoute({
  getParentRoute: () => laneRoute,
  path: 'a',
  loader: leafLoader(loaderMs),
  component: () => (
    <section data-owner="leaf" data-leaf="a">
      {LANE_INDEXES.slice(layoutCount, layoutCount + leafCount).map((index) =>
        laneLink(caseId, index),
      )}
    </section>
  ),
})
const laneBRoute = createRoute({
  getParentRoute: () => laneRoute,
  path: 'b',
  loader: leafLoader(loaderMs),
  component: () => <section data-leaf="b">b</section>,
})
const itemsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'items/$itemId',
})

const router = createRouter({
  routeTree: rootRoute.addChildren([
    laneRoute.addChildren([laneARoute, laneBRoute]),
    itemsRoute,
  ]),
  defaultPreload: false,
  // Loaders block every navigation instead of revalidating cached data.
  defaultStaleReloadMode: 'blocking',
  scrollRestoration: false,
})

createRoot(document.getElementById('app')!).render(
  <RouterProvider router={router} />,
)
