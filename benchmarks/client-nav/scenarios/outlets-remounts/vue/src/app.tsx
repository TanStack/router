import * as Vue from 'vue'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useParams,
} from '@tanstack/vue-router'
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

type OutletsRemountsParams = Partial<{
  orgId: string
  projectId: string
  boardId: string
  cardId: string
}>

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

function createRouteSection(
  routeId: OutletsRemountsComponentId,
  marker: string,
  mountIndex: number,
  children: Vue.VNodeChild,
) {
  const checksum = recordComponentRender(routeId, marker)

  return (
    <section
      data-outlets-route={routeId}
      data-outlets-marker={marker}
      data-outlets-mount-index={mountIndex}
      data-outlets-render-count={componentCounters[routeId].renders}
    >
      <span data-outlets-checksum={checksum} />
      {children}
    </section>
  )
}

function readParam(
  params: OutletsRemountsParams,
  key: keyof OutletsRemountsParams,
) {
  const value = params[key]

  if (typeof value === 'string') {
    return value
  }

  return ''
}

const Root = Vue.defineComponent({
  setup() {
    return () => <Outlet />
  },
})

const WorkspaceLayout = Vue.defineComponent({
  setup() {
    const marker = 'workspace'
    const mountIndex = recordComponentMount('workspace', marker)

    return () =>
      createRouteSection(
        'workspace',
        marker,
        mountIndex,
        <>
          <div data-client-nav-scenario={outletsRemountsScenarioSlug} />
          <Outlet />
        </>,
      )
  },
})

const OrgLayout = Vue.defineComponent({
  setup() {
    const params = useParams({ strict: false })
    const getMarker = () =>
      createOutletsRemountsMarker({
        kind: 'org',
        orgId: readParam(params.value, 'orgId'),
      })
    const mountIndex = recordComponentMount('org', getMarker())

    return () => {
      const marker = getMarker()

      return createRouteSection(
        'org',
        marker,
        mountIndex,
        <>
          <div
            data-outlets-org-marker={marker}
            data-org-id={readParam(params.value, 'orgId')}
          />
          <Outlet />
        </>,
      )
    }
  },
})

const ProjectsLayout = Vue.defineComponent({
  setup() {
    const params = useParams({ strict: false })
    const getMarker = () => `projects:${readParam(params.value, 'orgId')}`
    const mountIndex = recordComponentMount('projects', getMarker())

    return () =>
      createRouteSection('projects', getMarker(), mountIndex, <Outlet />)
  },
})

const ProjectLayout = Vue.defineComponent({
  setup() {
    const params = useParams({ strict: false })
    const getMarker = () =>
      `project:${readParam(params.value, 'orgId')}:${readParam(params.value, 'projectId')}`
    const mountIndex = recordComponentMount('project', getMarker())

    return () =>
      createRouteSection('project', getMarker(), mountIndex, <Outlet />)
  },
})

const BoardLayout = Vue.defineComponent({
  setup() {
    const params = useParams({ strict: false })
    const getMarker = () =>
      `board:${readParam(params.value, 'orgId')}:${readParam(params.value, 'projectId')}:${readParam(params.value, 'boardId')}`
    const mountIndex = recordComponentMount('board', getMarker())

    return () =>
      createRouteSection('board', getMarker(), mountIndex, <Outlet />)
  },
})

const CardPage = Vue.defineComponent({
  setup() {
    const params = useParams({ strict: false })
    const getMarker = () =>
      createOutletsRemountsMarker({
        kind: 'card',
        orgId: readParam(params.value, 'orgId'),
        projectId: readParam(params.value, 'projectId'),
        boardId: readParam(params.value, 'boardId'),
        cardId: readParam(params.value, 'cardId'),
      })
    const mountIndex = recordComponentMount('card', getMarker())

    return () => {
      const marker = getMarker()

      return createRouteSection(
        'card',
        marker,
        mountIndex,
        <main
          data-outlets-card-marker={marker}
          data-org-id={readParam(params.value, 'orgId')}
          data-project-id={readParam(params.value, 'projectId')}
          data-board-id={readParam(params.value, 'boardId')}
          data-card-id={readParam(params.value, 'cardId')}
        />,
      )
    }
  },
})

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

declare module '@tanstack/vue-router' {
  interface Register {
    router: ReturnType<typeof createOutletsRemountsRouter>
  }
}

export function mountTestApp(container: Element) {
  const router = createOutletsRemountsRouter()
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
