import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useMatchRoute,
  useRouter,
  useRouterState,
} from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'
import {
  buildLocationDescriptors,
  createActiveOptions,
  createLinkLabel,
  createLinkOptions,
  createLocationState,
  createMatchOptions,
  initialLocation,
  linkDescriptors,
  matchDescriptors,
  normalizeRootSearch,
  patchMissingScrollToGlobal,
  readBuiltPublicHref,
  type BuiltLocationSnapshot,
  type LinkDescriptor,
  type MatchDescriptor,
} from '../../shared.ts'

function createActiveProps(descriptor: LinkDescriptor) {
  if (descriptor.styleVariant % 2 === 0) {
    return { className: 'active-link' }
  }

  return () => ({
    className: 'active-link active-link-fn',
    'data-active-key': descriptor.key,
  })
}

function createInactiveProps(descriptor: LinkDescriptor) {
  if (descriptor.styleVariant % 2 === 0) {
    return { className: 'inactive-link' }
  }

  return () => ({
    className: 'inactive-link inactive-link-fn',
    'data-inactive-key': descriptor.key,
  })
}

function PanelLink({ descriptor }: { descriptor: LinkDescriptor }) {
  return (
    <Link
      {...(createLinkOptions(descriptor) as any)}
      data-location-link="true"
      data-href-key={descriptor.key}
      state={createLocationState(descriptor) as any}
      activeOptions={createActiveOptions(descriptor)}
      activeProps={createActiveProps(descriptor)}
      inactiveProps={createInactiveProps(descriptor)}
    >
      {createLinkLabel(descriptor)}
    </Link>
  )
}

function MatchProbe({ descriptor }: { descriptor: MatchDescriptor }) {
  const matchRoute = useMatchRoute()
  const params = matchRoute(createMatchOptions(descriptor) as any)

  return (
    <span
      data-match-probe="true"
      data-match-key={descriptor.key}
      data-match-active={params ? 'true' : 'false'}
    >
      {params ? 'matched' : 'unmatched'}
    </span>
  )
}

function BuildLocationProbe({ descriptor }: { descriptor: LinkDescriptor }) {
  const router = useRouter()
  const locationHref = useRouterState({
    select: (state) => state.location.href,
  })
  void locationHref

  const builtHref = readBuiltPublicHref(
    router.buildLocation({
      _fromLocation: router.state.location,
      ...createLinkOptions(descriptor),
      state: createLocationState(descriptor),
    } as any) as BuiltLocationSnapshot,
  )

  return (
    <span data-built-href={builtHref} data-built-key={descriptor.key}>
      {builtHref}
    </span>
  )
}

function LinkPanel() {
  return (
    <section data-link-panel="true">
      {linkDescriptors.map((descriptor) => (
        <PanelLink key={descriptor.key} descriptor={descriptor} />
      ))}
      {matchDescriptors.map((descriptor) => (
        <MatchProbe key={descriptor.key} descriptor={descriptor} />
      ))}
      {buildLocationDescriptors.map((descriptor) => (
        <BuildLocationProbe key={descriptor.key} descriptor={descriptor} />
      ))}
    </section>
  )
}

function Root() {
  return (
    <>
      <LinkPanel />
      <main>
        <Outlet />
      </main>
    </>
  )
}

const rootRoute = createRootRoute({
  validateSearch: normalizeRootSearch,
  component: Root,
})

function DashboardPage() {
  return <Outlet />
}

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  component: DashboardPage,
})

function ProjectPage() {
  const params = projectRoute.useParams()

  return (
    <>
      <div data-route-marker="project" data-project-id={params.projectId} />
      <Outlet />
    </>
  )
}

const projectRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: 'projects/$projectId',
  component: ProjectPage,
})

function TaskPage() {
  const params = taskRoute.useParams()

  return (
    <div
      data-route-marker="task"
      data-project-id={params.projectId}
      data-task-id={params.taskId}
    />
  )
}

const taskRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: 'tasks/$taskId',
  component: TaskPage,
})

function ReportPage() {
  const params = reportRoute.useParams()

  return <div data-route-marker="report" data-report-id={params.reportId} />
}

const reportRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: 'reports/$reportId',
  component: ReportPage,
})

function SettingsPage() {
  const params = settingsRoute.useParams()

  return <div data-route-marker="settings" data-tab={params.tab ?? 'none'} />
}

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/{-$tab}',
  component: SettingsPage,
})

const routeTree = rootRoute.addChildren([
  dashboardRoute.addChildren([
    projectRoute.addChildren([taskRoute]),
    reportRoute,
  ]),
  settingsRoute,
])

export function mountTestApp(container: HTMLDivElement) {
  const restoreScrollTo = patchMissingScrollToGlobal()
  const router = createRouter({
    history: createMemoryHistory({
      initialEntries: [initialLocation],
    }),
    routeTree,
  })
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
      try {
        reactRoot.unmount()
      } finally {
        restoreScrollTo()
      }
    },
  }
}
