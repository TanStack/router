import * as Vue from 'vue'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useBlocker,
  useCanGoBack,
  useRouterState,
} from '@tanstack/vue-router'
import {
  createHistoryEventsBlockersRuntime,
  historyEventsBlockersDonePath,
  historyEventsBlockersHomePath,
  historyEventsBlockersScenarioSlug,
  runHistoryEventsBlockersComputation,
} from '../../shared.ts'
import type { HistoryBlockerArgs } from '../../shared.ts'

export const historyEventsBlockersRuntime = createHistoryEventsBlockersRuntime()

function shouldBlockHistoryNavigation(args: HistoryBlockerArgs) {
  return historyEventsBlockersRuntime.shouldBlock(args)
}

const Root = Vue.defineComponent({
  setup() {
    return () => <Outlet />
  },
})

const CanGoBackProbe = Vue.defineComponent({
  setup() {
    const canGoBack = useCanGoBack()

    Vue.watchEffect(() => {
      historyEventsBlockersRuntime.recordCanGoBack(canGoBack.value)
    })

    return () => (
      <span
        data-history-events-can-go-back={canGoBack.value ? 'true' : 'false'}
      />
    )
  },
})

const HistoryLayout = Vue.defineComponent({
  setup() {
    const pathname = useRouterState({
      select: (state) => state.location.pathname,
    })

    return () => (
      <>
        <div data-client-nav-scenario={historyEventsBlockersScenarioSlug} />
        <CanGoBackProbe />
        {pathname.value === historyEventsBlockersHomePath ? (
          <main data-history-events-page="dashboard" />
        ) : null}
        <Outlet />
      </>
    )
  },
})

const FormPage = Vue.defineComponent({
  setup() {
    const params = formRoute.useParams()
    const resolver = useBlocker({
      shouldBlockFn: shouldBlockHistoryNavigation,
      withResolver: true,
      enableBeforeUnload: false,
    })

    Vue.watchEffect(() => {
      historyEventsBlockersRuntime.observeResolver(resolver.value)
    })

    return () => {
      void runHistoryEventsBlockersComputation(pathSeed(params.value.formId))

      return (
        <main
          data-history-events-id={params.value.formId}
          data-history-events-page="form"
        >
          {params.value.formId}
        </main>
      )
    }
  },
})

const ReviewPage = Vue.defineComponent({
  setup() {
    const params = reviewRoute.useParams()

    return () => {
      void runHistoryEventsBlockersComputation(pathSeed(params.value.reviewId))

      return (
        <main
          data-history-events-id={params.value.reviewId}
          data-history-events-page="review"
        >
          {params.value.reviewId}
        </main>
      )
    }
  },
})

const DonePage = Vue.defineComponent({
  setup() {
    return () => {
      void runHistoryEventsBlockersComputation(
        pathSeed(historyEventsBlockersDonePath),
      )

      return <main data-history-events-page="done" />
    }
  },
})

const rootRoute = createRootRoute({
  component: Root,
})

const historyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/history',
  component: HistoryLayout,
})

const formRoute = createRoute({
  getParentRoute: () => historyRoute,
  path: 'form/$formId',
  component: FormPage,
})

const reviewRoute = createRoute({
  getParentRoute: () => historyRoute,
  path: 'review/$reviewId',
  component: ReviewPage,
})

const doneRoute = createRoute({
  getParentRoute: () => historyRoute,
  path: 'done',
  component: DonePage,
})

function pathSeed(value: string) {
  let seed = 0

  for (let index = 0; index < value.length; index++) {
    seed = (seed * 31 + value.charCodeAt(index)) >>> 0
  }

  return seed
}

export function mountTestApp(container: Element) {
  const router = createRouter({
    history: createMemoryHistory({
      initialEntries: [historyEventsBlockersHomePath],
    }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
    routeTree: rootRoute.addChildren([
      historyRoute.addChildren([formRoute, reviewRoute, doneRoute]),
    ]),
  })

  const component = <RouterProvider router={router} />
  const app = Vue.createApp({
    render: () => component,
  })
  let didUnmount = false

  app.mount(container)

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
