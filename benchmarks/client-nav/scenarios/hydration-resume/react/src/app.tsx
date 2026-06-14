import {
  Await,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { hydrate } from '@tanstack/router-core/ssr/client'
import { Suspense } from 'react'
import { createRoot } from 'react-dom/client'
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

function PerfSubscriber({ seed }: { seed: number }) {
  void runHydrationResumeComputation(seed)
  return null
}

function HydrateLayout() {
  const loaderData = hydrateRoute.useLoaderData()

  return (
    <>
      {subscriberSlots.map((slot) => (
        <PerfSubscriber
          key={`hydrate-${slot}`}
          seed={loaderData.checksum + slot}
        />
      ))}
      <div
        data-hydration-resume-section="hydrate"
        data-fixture-id={loaderData.fixtureId}
        data-source={loaderData.source}
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
      {subscriberSlots.map((slot) => (
        <PerfSubscriber
          key={`dashboard-${slot}`}
          seed={loaderData.checksum + routeContext.dashboardBeforeSeed + slot}
        />
      ))}
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
      {subscriberSlots.map((slot) => (
        <PerfSubscriber
          key={`team-${slot}`}
          seed={loaderData.checksum + routeContext.teamBeforeSeed + slot}
        />
      ))}
      <div
        data-hydration-resume-marker="dashboard"
        data-team-id={params.teamId}
        data-tab={search.tab}
        data-cursor={search.cursor}
        data-source={loaderData.source}
        data-context-seed={routeContext.teamBeforeSeed}
      />
    </>
  )
}

function LivePage() {
  const params = liveRoute.useParams()
  const loaderData = liveRoute.useLoaderData()

  return (
    <>
      {subscriberSlots.map((slot) => (
        <PerfSubscriber
          key={`live-${slot}`}
          seed={loaderData.checksum + slot}
        />
      ))}
      <div
        data-hydration-resume-marker="live"
        data-item-id={params.itemId}
        data-source={loaderData.source}
        data-sequence={loaderData.sequence}
      />
    </>
  )
}

function DeferredResolved({
  payload,
  source,
}: {
  payload: HydrationResumeDeferredPayload
  source: string
}) {
  void runHydrationResumeComputation(payload.checksum)

  return (
    <div
      data-hydration-resume-marker="deferred-resolved"
      data-item-id={payload.itemId}
      data-source={source}
      data-value={payload.value}
    />
  )
}

function DeferredPage() {
  const loaderData = deferredRoute.useLoaderData()

  return (
    <>
      <div
        data-hydration-resume-marker="deferred-shell"
        data-item-id={loaderData.itemId}
        data-source={loaderData.source}
      />
      <Suspense
        fallback={
          <div
            data-hydration-resume-marker="deferred-fallback"
            data-item-id={loaderData.itemId}
            data-source={loaderData.source}
          />
        }
      >
        <Await promise={loaderData.deferred}>
          {(payload) => (
            <DeferredResolved
              payload={payload as HydrationResumeDeferredPayload}
              source={loaderData.source}
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
  let reactRoot: ReturnType<typeof createRoot> | undefined = undefined

  try {
    await hydrate(router)
    window.$_TSR?.h()
    reactRoot = createRoot(container)
    reactRoot.render(<RouterProvider router={router} />)
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
      reactRoot?.unmount()
    },
  }
}

export function mountTestApp(container: Element) {
  const fixture = createDashboardHydrationFixture(0)
  hydrationResumeRuntime.startCycle(fixture)

  const router = createHydrationResumeRouter('/hydrate/live/live-contract')
  const reactRoot = createRoot(container)
  let didUnmount = false

  reactRoot.render(<RouterProvider router={router} />)

  return {
    router,
    unmount() {
      if (didUnmount) {
        return
      }

      didUnmount = true
      reactRoot.unmount()
    },
  }
}
