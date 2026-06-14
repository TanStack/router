import { createRenderEffect, type JSX } from 'solid-js'
import { render } from 'solid-js/web'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/solid-router'
import {
  cloneOutletsRemountsComponentCounters,
  cloneOutletsRemountsLifecycleCounters,
  createEmptyOutletsRemountsComponentCounters,
  createEmptyOutletsRemountsLifecycleCounters,
  createOutletsRemountsMarker,
  outletsRemountsInitialPath,
  outletsRemountsScenarioSlug,
  runOutletsRemountsComputation,
  type OutletsRemountsComponentCounters,
  type OutletsRemountsComponentId,
  type OutletsRemountsLifecycleCounters,
  type OutletsRemountsLifecycleHook,
  type OutletsRemountsRouteId,
} from '../../shared'

let lifecycleCounters = createEmptyOutletsRemountsLifecycleCounters()
let componentCounters = createEmptyOutletsRemountsComponentCounters()

export function resetOutletsRemountsCounters() {
  lifecycleCounters = createEmptyOutletsRemountsLifecycleCounters()
  componentCounters = createEmptyOutletsRemountsComponentCounters()
}

export function getOutletsRemountsLifecycleCounters(): OutletsRemountsLifecycleCounters {
  return cloneOutletsRemountsLifecycleCounters(lifecycleCounters)
}

export function getOutletsRemountsComponentCounters(): OutletsRemountsComponentCounters {
  return cloneOutletsRemountsComponentCounters(componentCounters)
}

function recordLifecycle(
  routeId: OutletsRemountsRouteId,
  hook: OutletsRemountsLifecycleHook,
) {
  lifecycleCounters[routeId][hook] += 1
  void runOutletsRemountsComputation(`${routeId}:${hook}`)
}

function createRouteLifecycleOptions(routeId: OutletsRemountsRouteId) {
  return {
    onEnter: () => recordLifecycle(routeId, 'enter'),
    onStay: () => recordLifecycle(routeId, 'stay'),
    onLeave: () => recordLifecycle(routeId, 'leave'),
  }
}

function recordComponentMount(
  routeId: OutletsRemountsComponentId,
  marker: string,
) {
  componentCounters[routeId].mounts += 1
  void runOutletsRemountsComputation(`${routeId}:mount:${marker}`)
  return componentCounters[routeId].mounts
}

function recordComponentRender(
  routeId: OutletsRemountsComponentId,
  marker: string,
) {
  componentCounters[routeId].renders += 1
  return runOutletsRemountsComputation(`${routeId}:render:${marker}`, 10)
}

function RouteShell(props: {
  routeId: OutletsRemountsComponentId
  marker: () => string
  children?: JSX.Element
}) {
  const mountIndex = recordComponentMount(props.routeId, props.marker())
  let checksum = 0

  createRenderEffect(() => {
    checksum = recordComponentRender(props.routeId, props.marker())
  })

  return (
    <section
      data-outlets-route={props.routeId}
      data-outlets-marker={props.marker()}
      data-outlets-mount-index={mountIndex}
      data-outlets-render-count={componentCounters[props.routeId].renders}
    >
      <span data-outlets-checksum={checksum} />
      {props.children}
    </section>
  )
}

function Root() {
  return <Outlet />
}

function WorkspaceLayout() {
  return (
    <RouteShell routeId="workspace" marker={() => 'workspace'}>
      <div data-client-nav-scenario={outletsRemountsScenarioSlug} />
      <Outlet />
    </RouteShell>
  )
}

function OrgLayout() {
  const params = orgRoute.useParams()
  const marker = () =>
    createOutletsRemountsMarker({
      kind: 'org',
      orgId: params().orgId,
    })

  return (
    <RouteShell routeId="org" marker={marker}>
      <div data-outlets-org-marker={marker()} data-org-id={params().orgId} />
      <Outlet />
    </RouteShell>
  )
}

function ProjectsLayout() {
  const params = projectsRoute.useParams()
  const marker = () => `projects:${params().orgId}`

  return (
    <RouteShell routeId="projects" marker={marker}>
      <Outlet />
    </RouteShell>
  )
}

function ProjectLayout() {
  const params = projectRoute.useParams()
  const marker = () => `project:${params().orgId}:${params().projectId}`

  return (
    <RouteShell routeId="project" marker={marker}>
      <Outlet />
    </RouteShell>
  )
}

function BoardLayout() {
  const params = boardRoute.useParams()
  const marker = () =>
    `board:${params().orgId}:${params().projectId}:${params().boardId}`

  return (
    <RouteShell routeId="board" marker={marker}>
      <Outlet />
    </RouteShell>
  )
}

function CardPage() {
  const params = cardRoute.useParams()
  const marker = () =>
    createOutletsRemountsMarker({
      kind: 'card',
      orgId: params().orgId,
      projectId: params().projectId,
      boardId: params().boardId,
      cardId: params().cardId,
    })

  return (
    <RouteShell routeId="card" marker={marker}>
      <main
        data-outlets-card-marker={marker()}
        data-org-id={params().orgId}
        data-project-id={params().projectId}
        data-board-id={params().boardId}
        data-card-id={params().cardId}
      />
    </RouteShell>
  )
}

const rootRoute = createRootRoute({
  component: Root,
})

const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workspace',
  ...createRouteLifecycleOptions('workspace'),
  component: WorkspaceLayout,
})

const orgRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '$orgId',
  ...createRouteLifecycleOptions('org'),
  component: OrgLayout,
})

const projectsRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: 'projects',
  ...createRouteLifecycleOptions('projects'),
  component: ProjectsLayout,
})

const projectRoute = createRoute({
  getParentRoute: () => projectsRoute,
  path: '$projectId',
  ...createRouteLifecycleOptions('project'),
  remountDeps: ({ params }) => ({
    projectId: params.projectId,
  }),
  component: ProjectLayout,
})

const boardRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: 'boards/$boardId',
  ...createRouteLifecycleOptions('board'),
  remountDeps: ({ params }) => ({
    boardId: params.boardId,
  }),
  component: BoardLayout,
})

const cardRoute = createRoute({
  getParentRoute: () => boardRoute,
  path: 'cards/$cardId',
  ...createRouteLifecycleOptions('card'),
  component: CardPage,
})

const routeTree = rootRoute.addChildren([
  workspaceRoute.addChildren([
    orgRoute.addChildren([
      projectsRoute.addChildren([
        projectRoute.addChildren([boardRoute.addChildren([cardRoute])]),
      ]),
    ]),
  ]),
])

function createOutletsRemountsRouter() {
  return createRouter({
    history: createMemoryHistory({
      initialEntries: [outletsRemountsInitialPath],
    }),
    routeTree,
  })
}

declare module '@tanstack/solid-router' {
  interface Register {
    router: ReturnType<typeof createOutletsRemountsRouter>
  }
}

export function mountTestApp(container: Element) {
  const router = createOutletsRemountsRouter()
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
