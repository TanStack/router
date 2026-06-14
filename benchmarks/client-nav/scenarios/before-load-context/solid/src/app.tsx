import { For, createRenderEffect } from 'solid-js'
import { render } from 'solid-js/web'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from '@tanstack/solid-router'
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

function PerfValue(props: { value: () => number }) {
  createRenderEffect(() => {
    void props.value()
  })

  return null
}

function RootContextSubscriber(props: { selector: number }) {
  const value = rootRoute.useRouteContext({
    select: (context) =>
      runContextComputation(
        context.seed + context.version + props.selector,
        context.authToken,
        10,
      ),
  })

  return (
    <PerfValue
      value={() =>
        runContextComputation(value(), 'root-context-subscriber', 12)
      }
    />
  )
}

function AppContextSubscriber(props: { selector: number }) {
  const value = appRoute.useRouteContext({
    select: (context) =>
      runContextComputation(
        context.tenantChecksum + props.selector,
        context.tenantId,
        10,
      ),
  })

  return (
    <PerfValue
      value={() => runContextComputation(value(), 'app-context-subscriber', 12)}
    />
  )
}

function ProjectContextSubscriber(props: { selector: number }) {
  const value = projectRoute.useRouteContext({
    select: (context) =>
      runContextComputation(
        context.projectChecksum + props.selector,
        context.projectId,
        10,
      ),
  })

  return (
    <PerfValue
      value={() =>
        runContextComputation(value(), 'project-context-subscriber', 12)
      }
    />
  )
}

function TaskContextSubscriber(props: { selector: number }) {
  const value = taskRoute.useRouteContext({
    select: (context) =>
      runContextComputation(
        context.taskChecksum + props.selector,
        context.taskMarker,
        10,
      ),
  })

  return (
    <PerfValue
      value={() =>
        runContextComputation(value(), 'task-context-subscriber', 12)
      }
    />
  )
}

function Root() {
  return (
    <>
      <For each={rootSubscribers}>
        {(selector) => <RootContextSubscriber selector={selector} />}
      </For>
      <Outlet />
    </>
  )
}

function AppLayout() {
  return (
    <>
      <For each={middleSubscribers}>
        {(selector) => <AppContextSubscriber selector={selector} />}
      </For>
      <Outlet />
    </>
  )
}

function OrgLayout() {
  const value = orgRoute.useRouteContext({
    select: (context) =>
      runContextComputation(context.orgChecksum, context.orgPermissions[0], 10),
  })

  return (
    <>
      <PerfValue
        value={() =>
          runContextComputation(value(), 'org-context-subscriber', 12)
        }
      />
      <Outlet />
    </>
  )
}

function ProjectsLayout() {
  const value = projectsRoute.useRouteContext({
    select: (context) =>
      runContextComputation(
        context.projectIndexSeed,
        context.breadcrumb[2],
        10,
      ),
  })

  return (
    <>
      <PerfValue
        value={() =>
          runContextComputation(value(), 'projects-context-subscriber', 12)
        }
      />
      <Outlet />
    </>
  )
}

function ProjectLayout() {
  return (
    <>
      <For each={middleSubscribers}>
        {(selector) => <ProjectContextSubscriber selector={selector} />}
      </For>
      <Outlet />
    </>
  )
}

function TasksLayout() {
  const value = tasksRoute.useRouteContext({
    select: (context) =>
      runContextComputation(context.taskListSeed, context.taskScope, 10),
  })

  return (
    <>
      <PerfValue
        value={() =>
          runContextComputation(value(), 'tasks-context-subscriber', 12)
        }
      />
      <Outlet />
    </>
  )
}

function TaskPage() {
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

  return (
    <>
      <For each={leafSubscribers}>
        {(selector) => <TaskContextSubscriber selector={selector} />}
      </For>
      <div
        data-bench-task="detail"
        data-org-id={context().orgId}
        data-project-id={context().projectId}
        data-task-id={context().taskId}
        data-context-version={context().contextVersion}
        data-task-chain={makeTaskChain(context())}
        data-task-checksum={context().taskChecksum}
      >
        {context().taskMarker}
      </div>
    </>
  )
}

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

  const dispose = render(() => <RouterProvider router={router} />, container)
  let didUnmount = false

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
      dispose()
    },
  }
}
