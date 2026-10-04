import { For } from 'solid-js'
import { render } from 'solid-js/web'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/solid-router'

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

// Measured Links opt out of preloading unless the router preloads on intent
// (`mountLaneApp(..., { preload: 'intent' })`), the usual app configuration.
let linkPreload: false | undefined = false

const indexes = Array.from({ length: 1_000 }, (_, index) => index)

function LaneLink(props: { caseId: LaneCase; index: number }) {
  const { caseId, index } = props
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
      <Link data-perf-link to="." search={search as any} preload={linkPreload}>
        {label}
      </Link>
    ) : (
      <Link
        data-perf-link
        to="/items/$itemId"
        params={{ itemId }}
        search={search as any}
        preload={linkPreload}
      >
        {label}
      </Link>
    )
  }
  // 20 Links per 1,000 target each leaf, so 40 flip active per navigation.
  const target =
    index % 50 === 0 ? '/lane/a' : index % 50 === 1 ? '/lane/b' : undefined
  return target ? (
    <Link data-perf-link to={target} preload={linkPreload}>
      {label}
    </Link>
  ) : (
    <Link
      data-perf-link
      to="/items/$itemId"
      params={{ itemId }}
      preload={linkPreload}
    >
      {label}
    </Link>
  )
}

function createLaneRouter(caseId: LaneCase) {
  const [layout, leaf] = laneLinkCounts(caseId)
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
    component: () => (
      <>
        <section data-owner="layout">
          <For each={indexes.slice(0, layout)}>
            {(index) => <LaneLink caseId={caseId} index={index} />}
          </For>
        </section>
        <Outlet />
      </>
    ),
  })
  const laneARoute = createRoute({
    getParentRoute: () => laneRoute,
    path: 'a',
    component: () => (
      <section data-owner="leaf">
        <For each={indexes.slice(layout, layout + leaf)}>
          {(index) => <LaneLink caseId={caseId} index={index} />}
        </For>
      </section>
    ),
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
    defaultPreload: linkPreload === false ? undefined : 'intent',
  })
}

export function mountLaneApp(
  container: HTMLElement,
  caseId: LaneCase,
  options: { preload?: 'intent' } = {},
) {
  linkPreload = options.preload ? undefined : false
  const router = createLaneRouter(caseId)
  const unmount = render(() => <RouterProvider router={router} />, container)
  return { router, unmount }
}
