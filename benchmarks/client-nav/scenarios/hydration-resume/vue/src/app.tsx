import * as Vue from 'vue'
import { Suspense } from 'vue'
import {
  Await,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/vue-router'
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

const Root = Vue.defineComponent({
  setup() {
    return () => <Outlet />
  },
})

const PerfSubscriber = Vue.defineComponent({
  props: {
    seed: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    return () => {
      void runHydrationResumeComputation(props.seed)
      return null
    }
  },
})

const HydrateLayout = Vue.defineComponent({
  setup() {
    const loaderData = hydrateRoute.useLoaderData()

    return () => (
      <>
        {subscriberSlots.map((slot) => (
          <PerfSubscriber
            key={`hydrate-${slot}`}
            seed={loaderData.value.checksum + slot}
          />
        ))}
        <div
          data-hydration-resume-section="hydrate"
          data-fixture-id={loaderData.value.fixtureId}
          data-source={loaderData.value.source}
        />
        <Outlet />
      </>
    )
  },
})

const DashboardLayout = Vue.defineComponent({
  setup() {
    const loaderData = dashboardRoute.useLoaderData()
    const routeContext = dashboardRoute.useRouteContext()

    return () => (
      <>
        {subscriberSlots.map((slot) => (
          <PerfSubscriber
            key={`dashboard-${slot}`}
            seed={
              loaderData.value.checksum +
              routeContext.value.dashboardBeforeSeed +
              slot
            }
          />
        ))}
        <Outlet />
      </>
    )
  },
})

const TeamPage = Vue.defineComponent({
  setup() {
    const params = teamRoute.useParams()
    const search = teamRoute.useSearch()
    const loaderData = teamRoute.useLoaderData()
    const routeContext = teamRoute.useRouteContext()

    return () => (
      <>
        {subscriberSlots.map((slot) => (
          <PerfSubscriber
            key={`team-${slot}`}
            seed={
              loaderData.value.checksum +
              routeContext.value.teamBeforeSeed +
              slot
            }
          />
        ))}
        <div
          data-hydration-resume-marker="dashboard"
          data-team-id={params.value.teamId}
          data-tab={search.value.tab}
          data-cursor={search.value.cursor}
          data-source={loaderData.value.source}
          data-context-seed={routeContext.value.teamBeforeSeed}
        />
      </>
    )
  },
})

const LivePage = Vue.defineComponent({
  setup() {
    const params = liveRoute.useParams()
    const loaderData = liveRoute.useLoaderData()

    return () => (
      <>
        {subscriberSlots.map((slot) => (
          <PerfSubscriber
            key={`live-${slot}`}
            seed={loaderData.value.checksum + slot}
          />
        ))}
        <div
          data-hydration-resume-marker="live"
          data-item-id={params.value.itemId}
          data-source={loaderData.value.source}
          data-sequence={loaderData.value.sequence}
        />
      </>
    )
  },
})

const DeferredResolved = Vue.defineComponent({
  props: {
    payload: {
      type: Object as () => HydrationResumeDeferredPayload,
      required: true,
    },
    source: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    return () => {
      void runHydrationResumeComputation(props.payload.checksum)

      return (
        <div
          data-hydration-resume-marker="deferred-resolved"
          data-item-id={props.payload.itemId}
          data-source={props.source}
          data-value={props.payload.value}
        />
      )
    }
  },
})

const DeferredPage = Vue.defineComponent({
  setup() {
    const loaderData = deferredRoute.useLoaderData()

    return () => (
      <>
        <div
          data-hydration-resume-marker="deferred-shell"
          data-item-id={loaderData.value.itemId}
          data-source={loaderData.value.source}
        />
        <Suspense>
          {{
            default: () => (
              <Await
                promise={loaderData.value.deferred}
                children={(payload: HydrationResumeDeferredPayload) => (
                  <DeferredResolved
                    payload={payload}
                    source={loaderData.value.source}
                  />
                )}
              />
            ),
            fallback: () => (
              <div
                data-hydration-resume-marker="deferred-fallback"
                data-item-id={loaderData.value.itemId}
                data-source={loaderData.value.source}
              />
            ),
          }}
        </Suspense>
      </>
    )
  },
})

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

function mountRouterProvider(
  container: Element,
  router: ReturnType<typeof createHydrationResumeRouter>,
) {
  const component = <RouterProvider router={router} />
  const app = Vue.createApp({
    render: () => component,
  })

  app.mount(container)

  return app
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
  let app: Vue.App<Element> | undefined = undefined

  try {
    await hydrate(router)
    window.$_TSR?.h()
    app = mountRouterProvider(container, router)
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
      app?.unmount()
    },
  }
}

export function mountTestApp(container: Element) {
  const fixture = createDashboardHydrationFixture(0)
  hydrationResumeRuntime.startCycle(fixture)

  const router = createHydrationResumeRouter('/hydrate/live/live-contract')
  const app = mountRouterProvider(container, router)
  let didUnmount = false

  return {
    router,
    unmount() {
      if (didUnmount) {
        return
      }

      didUnmount = true
      app.unmount()
    },
  }
}
