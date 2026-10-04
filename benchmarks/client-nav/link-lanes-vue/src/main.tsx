import * as Vue from 'vue'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/vue-router'

export const LANE_CASES = [
  'lane-departing',
  'lane-retained',
  'lane-retained-updaters',
  'lane-mixed',
] as const

export type LaneCase = (typeof LANE_CASES)[number]

/** Measured Links rendered by the staying `/lane` layout and the `/lane/a` leaf. */
function laneLinkCounts(caseId: LaneCase): [layout: number, leaf: number] {
  switch (caseId) {
    case 'lane-departing':
      return [0, 1_000]
    case 'lane-mixed':
      return [500, 500]
    default:
      return [1_000, 0]
  }
}

const indexes = Array.from({ length: 1_000 }, (_, index) => index)

function laneLink(caseId: LaneCase, index: number) {
  const label = `Link ${index}`
  const itemId = `item-${index % 40}`
  if (caseId === 'lane-retained-updaters') {
    const search = (previous: { page?: number }) => ({
      ...previous,
      page: (index % 5) + 1,
    })
    // Both forms read the current location: even hrefs follow the current
    // path, odd hrefs stay unchanged.
    return index % 2 === 0 ? (
      <Link
        key={index}
        data-perf-link
        to="."
        search={search as any}
        preload={false}
      >
        {label}
      </Link>
    ) : (
      <Link
        key={index}
        data-perf-link
        to="/items/$itemId"
        params={{ itemId }}
        search={search as any}
        preload={false}
      >
        {label}
      </Link>
    )
  }
  // 20 Links per 1,000 target each leaf, so 40 flip active per navigation.
  const target =
    index % 50 === 0 ? '/lane/a' : index % 50 === 1 ? '/lane/b' : undefined
  return target ? (
    <Link key={index} data-perf-link to={target} preload={false}>
      {label}
    </Link>
  ) : (
    <Link
      key={index}
      data-perf-link
      to="/items/$itemId"
      params={{ itemId }}
      preload={false}
    >
      {label}
    </Link>
  )
}

function createLaneRouter(caseId: LaneCase) {
  const [layout, leaf] = laneLinkCounts(caseId)
  // Built once per route component: route components render without props,
  // so they never re-render their Links.
  const LaneComponent = Vue.defineComponent(() => {
    const links = indexes.slice(0, layout).map((i) => laneLink(caseId, i))
    return () => (
      <>
        <section data-owner="layout">{links}</section>
        <Outlet />
      </>
    )
  })
  const LaneAComponent = Vue.defineComponent(() => {
    const links = indexes
      .slice(layout, layout + leaf)
      .map((i) => laneLink(caseId, i))
    return () => <section data-owner="leaf">{links}</section>
  })
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <Link to="/lane/a" replace data-testid="go-a">
          a
        </Link>
        <Link to="/lane/b" replace data-testid="go-b">
          b
        </Link>
        <Outlet />
      </>
    ),
  })
  const laneRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'lane',
    component: () => <LaneComponent />,
  })
  const laneARoute = createRoute({
    getParentRoute: () => laneRoute,
    path: 'a',
    component: () => <LaneAComponent />,
  })
  const laneBRoute = createRoute({
    getParentRoute: () => laneRoute,
    path: 'b',
  })
  const itemsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'items/$itemId',
  })
  return createRouter({
    routeTree: rootRoute.addChildren([
      laneRoute.addChildren([laneARoute, laneBRoute]),
      itemsRoute,
    ]),
    history: createMemoryHistory({ initialEntries: ['/lane/a'] }),
  })
}

export function mountLaneApp(container: HTMLElement, caseId: LaneCase) {
  const router = createLaneRouter(caseId)
  const app = Vue.createApp({
    render: () => <RouterProvider router={router} />,
  })
  app.mount(container)
  return { router, unmount: () => app.unmount() }
}
