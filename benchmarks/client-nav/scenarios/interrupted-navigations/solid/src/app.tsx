import { Show, createRenderEffect } from 'solid-js'
import { render } from 'solid-js/web'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useRouterState,
} from '@tanstack/solid-router'
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

function Root() {
  return <Outlet />
}

function InterruptLayout() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  return (
    <>
      <div data-client-nav-scenario={interruptedNavigationScenarioSlug} />
      <Show when={pathname() === interruptedNavigationHomePath}>
        <main data-interrupted-page="home" />
      </Show>
      <Outlet />
    </>
  )
}

function CommitEffect(props: { payload: InterruptedLoaderPayload }) {
  createRenderEffect(() => {
    interruptedNavigationRuntime.recordCommit(props.payload)
    void runInterruptedNavigationComputation(props.payload.checksum)
  })

  return null
}

function SlowPage() {
  const data = slowRoute.useLoaderData()

  return (
    <main data-interrupted-id={data().id} data-interrupted-page="slow">
      <CommitEffect payload={data()} />
      {`${data().kind}:${data().id}:${data().sequence}:${data().checksum}`}
    </main>
  )
}

function FastPage() {
  const data = fastRoute.useLoaderData()

  return (
    <main data-interrupted-id={data().id} data-interrupted-page="fast">
      <CommitEffect payload={data()} />
      {`${data().kind}:${data().id}:${data().sequence}:${data().checksum}`}
    </main>
  )
}

function NestedLayout() {
  const data = nestedParentRoute.useLoaderData()

  return (
    <>
      <CommitEffect payload={data()} />
      <Outlet />
    </>
  )
}

function NestedPage() {
  const data = nestedChildRoute.useLoaderData()

  return (
    <main
      data-interrupted-group={data().group}
      data-interrupted-id={data().id}
      data-interrupted-page="nested"
    >
      <CommitEffect payload={data()} />
      {`${data().kind}:${data().group}:${data().id}:${data().sequence}:${data().checksum}`}
    </main>
  )
}

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
