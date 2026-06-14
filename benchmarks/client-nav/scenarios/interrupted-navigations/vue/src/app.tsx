import * as Vue from 'vue'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useRouterState,
} from '@tanstack/vue-router'
import {
  createInterruptedNavigationRuntime,
  createNestedChildLoaderKey,
  createNestedParentLoaderKey,
  createSlowLoaderKey,
  interruptedNavigationHomePath,
  interruptedNavigationScenarioSlug,
  runInterruptedNavigationComputation,
} from '../../shared.ts'
import type { InterruptedLoaderPayload } from '../../shared.ts'

export const interruptedNavigationRuntime = createInterruptedNavigationRuntime()

const Root = Vue.defineComponent({
  setup() {
    return () => <Outlet />
  },
})

const InterruptLayout = Vue.defineComponent({
  setup() {
    const pathname = useRouterState({
      select: (state) => state.location.pathname,
    })

    return () => (
      <>
        <div data-client-nav-scenario={interruptedNavigationScenarioSlug} />
        {pathname.value === interruptedNavigationHomePath ? (
          <main data-interrupted-page="home" />
        ) : null}
        <Outlet />
      </>
    )
  },
})

function recordCommit(payload: InterruptedLoaderPayload) {
  interruptedNavigationRuntime.recordCommit(payload)
  void runInterruptedNavigationComputation(payload.checksum)
}

const SlowPage = Vue.defineComponent({
  setup() {
    const data = slowRoute.useLoaderData()

    return () => {
      recordCommit(data.value)

      return (
        <main data-interrupted-id={data.value.id} data-interrupted-page="slow">
          {`${data.value.kind}:${data.value.id}:${data.value.sequence}:${data.value.checksum}`}
        </main>
      )
    }
  },
})

const FastPage = Vue.defineComponent({
  setup() {
    const data = fastRoute.useLoaderData()

    return () => {
      recordCommit(data.value)

      return (
        <main data-interrupted-id={data.value.id} data-interrupted-page="fast">
          {`${data.value.kind}:${data.value.id}:${data.value.sequence}:${data.value.checksum}`}
        </main>
      )
    }
  },
})

const NestedLayout = Vue.defineComponent({
  setup() {
    const data = nestedParentRoute.useLoaderData()

    return () => {
      recordCommit(data.value)
      return <Outlet />
    }
  },
})

const NestedPage = Vue.defineComponent({
  setup() {
    const data = nestedChildRoute.useLoaderData()

    return () => {
      recordCommit(data.value)

      return (
        <main
          data-interrupted-group={data.value.group}
          data-interrupted-id={data.value.id}
          data-interrupted-page="nested"
        >
          {`${data.value.kind}:${data.value.group}:${data.value.id}:${data.value.sequence}:${data.value.checksum}`}
        </main>
      )
    }
  },
})

const rootRoute = createRootRoute({
  component: Root,
})

const interruptRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/interrupt',
  component: InterruptLayout,
})

const slowRoute = createRoute({
  getParentRoute: () => interruptRoute,
  path: 'slow/$id',
  loader: ({ params, abortController }) =>
    interruptedNavigationRuntime.createControlledLoad(
      'slow',
      createSlowLoaderKey(params.id),
      abortController.signal,
      { id: params.id },
    ),
  gcTime: 0,
  component: SlowPage,
})

const fastRoute = createRoute({
  getParentRoute: () => interruptRoute,
  path: 'fast/$id',
  loader: ({ params }) =>
    interruptedNavigationRuntime.recordFastLoad(params.id),
  staleTime: 0,
  gcTime: 0,
  component: FastPage,
})

const nestedParentRoute = createRoute({
  getParentRoute: () => interruptRoute,
  path: 'nested/$group',
  loader: ({ params, abortController }) =>
    interruptedNavigationRuntime.createControlledLoad(
      'nestedParent',
      createNestedParentLoaderKey(params.group),
      abortController.signal,
      { id: params.group, group: params.group },
    ),
  gcTime: 0,
  component: NestedLayout,
})

const nestedChildRoute = createRoute({
  getParentRoute: () => nestedParentRoute,
  path: '$id',
  loader: ({ params, abortController }) =>
    interruptedNavigationRuntime.createControlledLoad(
      'nestedChild',
      createNestedChildLoaderKey(params.group, params.id),
      abortController.signal,
      { id: params.id, group: params.group },
    ),
  gcTime: 0,
  component: NestedPage,
})

export function mountTestApp(container: Element) {
  const router = createRouter({
    history: createMemoryHistory({
      initialEntries: [interruptedNavigationHomePath],
    }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
    routeTree: rootRoute.addChildren([
      interruptRoute.addChildren([
        slowRoute,
        fastRoute,
        nestedParentRoute.addChildren([nestedChildRoute]),
      ]),
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
