import { For, Suspense, createRenderEffect } from 'solid-js'
import { render } from 'solid-js/web'
import {
  Await,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/solid-router'
import { hydrate } from '@tanstack/router-core/ssr/client'
import {
  buildDashboardLoaderData,
  buildHydrateLoaderData,
  buildLiveLoaderData,
  buildTeamLoaderData,
  createDashboardHydrationFixture,
  createHydrationResumeRuntime,
  normalizeDashboardSearch,
  runHydrationResumeComputation,
  seedHydrationResumeSsrGlobal,
  type HydrationResumeDeferredPayload,
  type HydrationResumeFixture,
  type HydrationResumeRouteIds,
} from '../../shared.ts'

export const hydrationResumeRuntime = createHydrationResumeRuntime()

const subscriberSlots = Array.from({ length: 4 }, (_, index) => index)

function getDashboardFixture() {
  const fixture = hydrationResumeRuntime.getActiveFixture()

  if (fixture.kind !== 'dashboard') {
    throw new Error('Expected dashboard hydration fixture')
  }

  return fixture
}

function Root() {
  return <Outlet />
}

function PerfSubscriber(props: { seed: number }) {
  createRenderEffect(() => {
    void runHydrationResumeComputation(props.seed)
  })

  return null
}

function HydrateLayout() {
  const loaderData = hydrateRoute.useLoaderData()

  return (
    <>
      <For each={subscriberSlots}>
        {(slot) => <PerfSubscriber seed={loaderData().checksum + slot} />}
      </For>
      <div
        data-hydration-resume-section="hydrate"
        data-fixture-id={loaderData().fixtureId}
        data-source={loaderData().source}
      />
      <Outlet />
    </>
  )
}

function DashboardLayout() {
  const loaderData = dashboardRoute.useLoaderData()
  const routeContext = dashboardRoute.useRouteContext()

  return (
    <>
      <For each={subscriberSlots}>
        {(slot) => (
          <PerfSubscriber
            seed={
              loaderData().checksum + routeContext().dashboardBeforeSeed + slot
            }
          />
        )}
      </For>
      <Outlet />
    </>
  )
}

function TeamPage() {
  const params = teamRoute.useParams()
  const search = teamRoute.useSearch()
  const loaderData = teamRoute.useLoaderData()
  const routeContext = teamRoute.useRouteContext()

  return (
    <>
      <For each={subscriberSlots}>
        {(slot) => (
          <PerfSubscriber
            seed={loaderData().checksum + routeContext().teamBeforeSeed + slot}
          />
        )}
      </For>
      <div
        data-hydration-resume-marker="dashboard"
        data-team-id={params().teamId}
        data-tab={search().tab}
        data-cursor={search().cursor}
        data-source={loaderData().source}
        data-context-seed={routeContext().teamBeforeSeed}
      />
    </>
  )
}

function LivePage() {
  const params = liveRoute.useParams()
  const loaderData = liveRoute.useLoaderData()

  return (
    <>
      <For each={subscriberSlots}>
        {(slot) => <PerfSubscriber seed={loaderData().checksum + slot} />}
      </For>
      <div
        data-hydration-resume-marker="live"
        data-item-id={params().itemId}
        data-source={loaderData().source}
        data-sequence={loaderData().sequence}
      />
    </>
  )
}

function DeferredResolved(props: {
  payload: HydrationResumeDeferredPayload
  source: string
}) {
  createRenderEffect(() => {
    void runHydrationResumeComputation(props.payload.checksum)
  })

  return (
    <div
      data-hydration-resume-marker="deferred-resolved"
      data-item-id={props.payload.itemId}
      data-source={props.source}
      data-value={props.payload.value}
    />
  )
}

function DeferredPage() {
  const loaderData = deferredRoute.useLoaderData()

  return (
    <>
      <div
        data-hydration-resume-marker="deferred-shell"
        data-item-id={loaderData().itemId}
        data-source={loaderData().source}
      />
      <Suspense
        fallback={
          <div
            data-hydration-resume-marker="deferred-fallback"
            data-item-id={loaderData().itemId}
            data-source={loaderData().source}
          />
        }
      >
        <Await promise={loaderData().deferred}>
          {(payload) => (
            <DeferredResolved
              payload={payload as HydrationResumeDeferredPayload}
              source={loaderData().source}
            />
          )}
        </Await>
      </Suspense>
    </>
  )
}

const rootRoute = createRootRoute({
  component: Root,
})

const hydrateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/hydrate',
  loader: () => {
    const sequence = hydrationResumeRuntime.recordLoader('hydrate')
    return buildHydrateLoaderData(
      hydrationResumeRuntime.getActiveFixture(),
      'client',
      sequence,
    )
  },
  staleTime: Infinity,
  gcTime: Infinity,
  component: HydrateLayout,
})

const dashboardRoute = createRoute({
  getParentRoute: () => hydrateRoute,
  path: 'dashboard',
  beforeLoad: () => {
    const fixture = getDashboardFixture()
    hydrationResumeRuntime.recordBeforeLoad('dashboardBeforeLoad')
    return {
      dashboardBeforeSeed: fixture.seed + 7,
    }
  },
  loader: () => {
    const sequence = hydrationResumeRuntime.recordLoader('dashboard')
    return buildDashboardLoaderData(getDashboardFixture(), 'client', sequence)
  },
  staleTime: Infinity,
  gcTime: Infinity,
  component: DashboardLayout,
})

const teamRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '$teamId',
  validateSearch: (search: Record<string, unknown>) =>
    normalizeDashboardSearch(search),
  loaderDeps: ({ search }) => ({
    tab: search.tab,
    cursor: search.cursor,
  }),
  beforeLoad: () => {
    const fixture = getDashboardFixture()
    hydrationResumeRuntime.recordBeforeLoad('teamBeforeLoad')
    return {
      teamBeforeSeed: fixture.seed + 11,
    }
  },
  loader: () => {
    const sequence = hydrationResumeRuntime.recordLoader('team')
    return buildTeamLoaderData(getDashboardFixture(), 'client', sequence)
  },
  staleTime: Infinity,
  gcTime: Infinity,
  component: TeamPage,
})

const liveRoute = createRoute({
  getParentRoute: () => hydrateRoute,
  path: 'live/$itemId',
  loader: ({ params }) => {
    const sequence = hydrationResumeRuntime.recordLoader('live')
    return buildLiveLoaderData(
      hydrationResumeRuntime.getActiveFixture(),
      String(params.itemId),
      sequence,
    )
  },
  staleTime: Infinity,
  gcTime: Infinity,
  component: LivePage,
})

const deferredRoute = createRoute({
  getParentRoute: () => hydrateRoute,
  path: 'deferred/$itemId',
  loader: ({ params }) => {
    const sequence = hydrationResumeRuntime.recordLoader('deferred')
    return hydrationResumeRuntime.createClientDeferredLoaderData(
      String(params.itemId),
      sequence,
    )
  },
  staleTime: Infinity,
  gcTime: Infinity,
  component: DeferredPage,
})

const routeTree = rootRoute.addChildren([
  hydrateRoute.addChildren([
    dashboardRoute.addChildren([teamRoute]),
    deferredRoute,
    liveRoute,
  ]),
])

function getHydrationResumeRouteIds(): HydrationResumeRouteIds {
  return {
    hydrate: hydrateRoute.id,
    dashboard: dashboardRoute.id,
    team: teamRoute.id,
    deferred: deferredRoute.id,
    live: liveRoute.id,
  }
}

function createHydrationResumeRouter(initialEntry: string) {
  return createRouter({
    history: createMemoryHistory({
      initialEntries: [initialEntry],
    }),
    routeTree,
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
    hydrate: (dehydratedData: unknown) => {
      hydrationResumeRuntime.recordCustomHydrate(dehydratedData)
    },
  })
}

export async function mountHydratedTestApp(
  container: Element,
  fixture: HydrationResumeFixture,
) {
  hydrationResumeRuntime.startCycle(fixture)

  const router = createHydrationResumeRouter(fixture.href)
  const cleanup = seedHydrationResumeSsrGlobal(
    router,
    getHydrationResumeRouteIds(),
    hydrationResumeRuntime,
    fixture,
  )
  let didUnmount = false
  let dispose: (() => void) | undefined = undefined

  try {
    await hydrate(router)
    window.$_TSR?.h()
    dispose = render(() => <RouterProvider router={router} />, container)
  } catch (error) {
    cleanup()
    router.history.destroy()
    hydrationResumeRuntime.clearCycle()
    throw error
  }

  return {
    router,
    cleanup,
    unmount() {
      if (didUnmount) {
        return
      }

      didUnmount = true
      dispose?.()
    },
  }
}

export function mountTestApp(container: Element) {
  const fixture = createDashboardHydrationFixture(0)
  hydrationResumeRuntime.startCycle(fixture)

  const router = createHydrationResumeRouter('/hydrate/live/live-contract')
  const dispose = render(() => <RouterProvider router={router} />, container)
  let didUnmount = false

  return {
    router,
    unmount() {
      if (didUnmount) {
        return
      }

      didUnmount = true
      dispose()
    },
  }
}
