import { Show, createRenderEffect } from 'solid-js'
import { render } from 'solid-js/web'
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
} from '@tanstack/solid-router'
import {
  createHistoryEventsBlockersRuntime,
  historyEventsBlockersDonePath,
  historyEventsBlockersHomePath,
  historyEventsBlockersScenarioSlug,
  runHistoryEventsBlockersComputation,
} from '../../shared.ts'
import type { HistoryBlockerArgs } from '../../shared.ts'

export const historyEventsBlockersRuntime = createHistoryEventsBlockersRuntime()

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

function shouldBlockHistoryNavigation(args: HistoryBlockerArgs) {
  return historyEventsBlockersRuntime.shouldBlock(args)
}

function Root() {
  return <Outlet />
}

function HistoryLayout() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  return (
    <>
      <div data-client-nav-scenario={historyEventsBlockersScenarioSlug} />
      <CanGoBackProbe />
      <Show when={pathname() === historyEventsBlockersHomePath}>
        <main data-history-events-page="dashboard" />
      </Show>
      <Outlet />
    </>
  )
}

function CanGoBackProbe() {
  const canGoBack = useCanGoBack()

  createRenderEffect(() => {
    historyEventsBlockersRuntime.recordCanGoBack(canGoBack())
  })

  return (
    <span data-history-events-can-go-back={canGoBack() ? 'true' : 'false'} />
  )
}

function FormPage() {
  const params = formRoute.useParams()
  const resolver = useBlocker({
    shouldBlockFn: shouldBlockHistoryNavigation,
    withResolver: true,
    enableBeforeUnload: false,
  })

  createRenderEffect(() => {
    historyEventsBlockersRuntime.observeResolver(resolver())
  })

  createRenderEffect(() => {
    void runHistoryEventsBlockersComputation(pathSeed(params().formId))
  })

  return (
    <main
      data-history-events-id={params().formId}
      data-history-events-page="form"
    >
      {params().formId}
    </main>
  )
}

function ReviewPage() {
  const params = reviewRoute.useParams()

  createRenderEffect(() => {
    void runHistoryEventsBlockersComputation(pathSeed(params().reviewId))
  })

  return (
    <main
      data-history-events-id={params().reviewId}
      data-history-events-page="review"
    >
      {params().reviewId}
    </main>
  )
}

function DonePage() {
  void runHistoryEventsBlockersComputation(
    pathSeed(historyEventsBlockersDonePath),
  )

  return <main data-history-events-page="done" />
}

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
