import { For, createMemo } from 'solid-js'
import { render } from 'solid-js/web'
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
} from '@tanstack/solid-router'
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
    return { class: 'active-link' }
  }

  return () => ({
    class: 'active-link active-link-fn',
    'data-active-key': descriptor.key,
  })
}

function createInactiveProps(descriptor: LinkDescriptor) {
  if (descriptor.styleVariant % 2 === 0) {
    return { class: 'inactive-link' }
  }

  return () => ({
    class: 'inactive-link inactive-link-fn',
    'data-inactive-key': descriptor.key,
  })
}

function PanelLink(props: { descriptor: LinkDescriptor }) {
  return (
    <Link
      {...(createLinkOptions(props.descriptor) as any)}
      data-location-link="true"
      data-href-key={props.descriptor.key}
      state={createLocationState(props.descriptor) as any}
      activeOptions={createActiveOptions(props.descriptor)}
      activeProps={createActiveProps(props.descriptor)}
      inactiveProps={createInactiveProps(props.descriptor)}
    >
      {createLinkLabel(props.descriptor)}
    </Link>
  )
}

function MatchProbe(props: { descriptor: MatchDescriptor }) {
  const matchRoute = useMatchRoute()
  const params = matchRoute(createMatchOptions(props.descriptor) as any)

  return (
    <span
      data-match-probe="true"
      data-match-key={props.descriptor.key}
      data-match-active={params() ? 'true' : 'false'}
    >
      {params() ? 'matched' : 'unmatched'}
    </span>
  )
}

function BuildLocationProbe(props: { descriptor: LinkDescriptor }) {
  const router = useRouter()
  const locationHref = useRouterState({
    select: (state) => state.location.href,
  })
  const builtHref = createMemo(() => {
    void locationHref()

    return readBuiltPublicHref(
      router.buildLocation({
        _fromLocation: router.state.location,
        ...createLinkOptions(props.descriptor),
        state: createLocationState(props.descriptor),
      } as any) as BuiltLocationSnapshot,
    )
  })

  return (
    <span data-built-href={builtHref()} data-built-key={props.descriptor.key}>
      {builtHref()}
    </span>
  )
}

function LinkPanel() {
  return (
    <section data-link-panel="true">
      <For each={linkDescriptors}>
        {(descriptor) => <PanelLink descriptor={descriptor} />}
      </For>
      <For each={matchDescriptors}>
        {(descriptor) => <MatchProbe descriptor={descriptor} />}
      </For>
      <For each={buildLocationDescriptors}>
        {(descriptor) => <BuildLocationProbe descriptor={descriptor} />}
      </For>
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
      <div data-route-marker="project" data-project-id={params().projectId} />
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
      data-project-id={params().projectId}
      data-task-id={params().taskId}
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

  return <div data-route-marker="report" data-report-id={params().reportId} />
}

const reportRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: 'reports/$reportId',
  component: ReportPage,
})

function SettingsPage() {
  const params = settingsRoute.useParams()

  return <div data-route-marker="settings" data-tab={params().tab ?? 'none'} />
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
  const dispose = render(() => <RouterProvider router={router} />, container)
  let didUnmount = false

  return {
    router,
    unmount() {
      if (didUnmount) {
        return
      }

      didUnmount = true
      try {
        dispose()
      } finally {
        restoreScrollTo()
      }
    },
  }
}
