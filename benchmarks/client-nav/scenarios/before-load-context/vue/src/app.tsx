import * as Vue from 'vue'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from '@tanstack/vue-router'
import {
  buildTaskPath,
  createRootBenchmarkContext,
  deriveOrgContext,
  deriveProjectContext,
  deriveProjectsContext,
  deriveTaskContext,
  deriveTaskListContext,
  deriveTenantContext,
  initialTaskTarget,
  makeTaskChain,
  runContextComputation,
  updateRootBenchmarkContext,
  type RootBenchmarkContext,
} from '../../shared'

const rootSubscribers = Array.from({ length: 4 }, (_, index) => index)
const middleSubscribers = Array.from({ length: 5 }, (_, index) => index)
const leafSubscribers = Array.from({ length: 6 }, (_, index) => index)

const RootContextSubscriber = Vue.defineComponent({
  props: {
    selector: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    const value = rootRoute.useRouteContext({
      select: (context) =>
        runContextComputation(
          context.seed + context.version + props.selector,
          context.authToken,
          10,
        ),
    })

    return () => {
      void runContextComputation(value.value, 'root-context-subscriber', 12)
      return null
    }
  },
})

const AppContextSubscriber = Vue.defineComponent({
  props: {
    selector: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    const value = appRoute.useRouteContext({
      select: (context) =>
        runContextComputation(
          context.tenantChecksum + props.selector,
          context.tenantId,
          10,
        ),
    })

    return () => {
      void runContextComputation(value.value, 'app-context-subscriber', 12)
      return null
    }
  },
})

const ProjectContextSubscriber = Vue.defineComponent({
  props: {
    selector: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    const value = projectRoute.useRouteContext({
      select: (context) =>
        runContextComputation(
          context.projectChecksum + props.selector,
          context.projectId,
          10,
        ),
    })

    return () => {
      void runContextComputation(value.value, 'project-context-subscriber', 12)
      return null
    }
  },
})

const TaskContextSubscriber = Vue.defineComponent({
  props: {
    selector: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    const value = taskRoute.useRouteContext({
      select: (context) =>
        runContextComputation(
          context.taskChecksum + props.selector,
          context.taskMarker,
          10,
        ),
    })

    return () => {
      void runContextComputation(value.value, 'task-context-subscriber', 12)
      return null
    }
  },
})

const Root = Vue.defineComponent({
  setup() {
    return () => (
      <>
        {rootSubscribers.map((selector) => (
          <RootContextSubscriber key={`root-${selector}`} selector={selector} />
        ))}
        <Outlet />
      </>
    )
  },
})

const AppLayout = Vue.defineComponent({
  setup() {
    return () => (
      <>
        {middleSubscribers.map((selector) => (
          <AppContextSubscriber key={`app-${selector}`} selector={selector} />
        ))}
        <Outlet />
      </>
    )
  },
})

const OrgLayout = Vue.defineComponent({
  setup() {
    const value = orgRoute.useRouteContext({
      select: (context) =>
        runContextComputation(
          context.orgChecksum,
          context.orgPermissions[0],
          10,
        ),
    })

    return () => {
      void runContextComputation(value.value, 'org-context-subscriber', 12)
      return <Outlet />
    }
  },
})

const ProjectsLayout = Vue.defineComponent({
  setup() {
    const value = projectsRoute.useRouteContext({
      select: (context) =>
        runContextComputation(
          context.projectIndexSeed,
          context.breadcrumb[2],
          10,
        ),
    })

    return () => {
      void runContextComputation(value.value, 'projects-context-subscriber', 12)
      return <Outlet />
    }
  },
})

const ProjectLayout = Vue.defineComponent({
  setup() {
    return () => (
      <>
        {middleSubscribers.map((selector) => (
          <ProjectContextSubscriber
            key={`project-${selector}`}
            selector={selector}
          />
        ))}
        <Outlet />
      </>
    )
  },
})

const TasksLayout = Vue.defineComponent({
  setup() {
    const value = tasksRoute.useRouteContext({
      select: (context) =>
        runContextComputation(context.taskListSeed, context.taskScope, 10),
    })

    return () => {
      void runContextComputation(value.value, 'tasks-context-subscriber', 12)
      return <Outlet />
    }
  },
})

const TaskPage = Vue.defineComponent({
  setup() {
    const context = taskRoute.useRouteContext({
      select: (context) => ({
        orgId: context.orgId,
        projectId: context.projectId,
        taskId: context.taskId,
        contextVersion: context.contextVersion,
        taskChecksum: context.taskChecksum,
        taskMarker: context.taskMarker,
      }),
    })

    return () => {
      const current = context.value

      return (
        <>
          {leafSubscribers.map((selector) => (
            <TaskContextSubscriber
              key={`task-${selector}`}
              selector={selector}
            />
          ))}
          <div
            data-bench-task="detail"
            data-org-id={current.orgId}
            data-project-id={current.projectId}
            data-task-id={current.taskId}
            data-context-version={current.contextVersion}
            data-task-chain={makeTaskChain(current)}
            data-task-checksum={current.taskChecksum}
          >
            {current.taskMarker}
          </div>
        </>
      )
    }
  },
})

const rootRoute = createRootRouteWithContext<RootBenchmarkContext>()({
  component: Root,
})

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'app',
  beforeLoad: ({ context }) => deriveTenantContext(context),
  component: AppLayout,
})

const orgRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '$orgId',
  beforeLoad: ({ context, params }) => deriveOrgContext(context, params.orgId),
  component: OrgLayout,
})

const projectsRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: 'projects',
  beforeLoad: ({ context }) => deriveProjectsContext(context),
  component: ProjectsLayout,
})

const projectRoute = createRoute({
  getParentRoute: () => projectsRoute,
  path: '$projectId',
  beforeLoad: ({ context, params }) =>
    deriveProjectContext(context, params.projectId),
  component: ProjectLayout,
})

const tasksRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: 'tasks',
  beforeLoad: ({ context }) => deriveTaskListContext(context),
  component: TasksLayout,
})

const taskRoute = createRoute({
  getParentRoute: () => tasksRoute,
  path: '$taskId',
  beforeLoad: ({ context, params }) =>
    deriveTaskContext(context, params.taskId),
  component: TaskPage,
})

const routeTree = rootRoute.addChildren([
  appRoute.addChildren([
    orgRoute.addChildren([
      projectsRoute.addChildren([
        projectRoute.addChildren([tasksRoute.addChildren([taskRoute])]),
      ]),
    ]),
  ]),
])

export function mountTestApp(container: Element) {
  const rootContext = createRootBenchmarkContext()
  const router = createRouter({
    history: createMemoryHistory({
      initialEntries: [buildTaskPath(initialTaskTarget)],
    }),
    routeTree,
    context: rootContext,
  })

  const vueApp = Vue.createApp({
    setup() {
      return () => <RouterProvider router={router} />
    },
  })
  let didUnmount = false

  vueApp.mount(container)

  return {
    router,
    setRootSeed(seed: number) {
      const version = updateRootBenchmarkContext(rootContext, seed)
      router.update({
        ...router.options,
        context: rootContext,
      })

      return version
    },
    getRootVersion() {
      return rootContext.version
    },
    getBeforeLoadCounters() {
      return rootContext.counters
    },
    unmount() {
      if (didUnmount) {
        return
      }

      didUnmount = true
      vueApp.unmount()
    },
  }
}
