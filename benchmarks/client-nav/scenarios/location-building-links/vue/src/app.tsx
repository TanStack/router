import * as Vue from 'vue'
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
} from '@tanstack/vue-router'
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

const PanelLink = Vue.defineComponent({
  props: {
    descriptor: {
      type: Object as Vue.PropType<LinkDescriptor>,
      required: true,
    },
  },
  setup(props) {
    return () => (
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
  },
})

const MatchProbe = Vue.defineComponent({
  props: {
    descriptor: {
      type: Object as Vue.PropType<MatchDescriptor>,
      required: true,
    },
  },
  setup(props) {
    const matchRoute = useMatchRoute()
    const params = matchRoute(createMatchOptions(props.descriptor) as any)

    return () => (
      <span
        data-match-probe="true"
        data-match-key={props.descriptor.key}
        data-match-active={params.value ? 'true' : 'false'}
      >
        {params.value ? 'matched' : 'unmatched'}
      </span>
    )
  },
})

const BuildLocationProbe = Vue.defineComponent({
  props: {
    descriptor: {
      type: Object as Vue.PropType<LinkDescriptor>,
      required: true,
    },
  },
  setup(props) {
    const router = useRouter()
    const locationHref = useRouterState({
      select: (state) => state.location.href,
    })

    return () => {
      void locationHref.value

      const builtHref = readBuiltPublicHref(
        router.buildLocation({
          _fromLocation: router.state.location,
          ...createLinkOptions(props.descriptor),
          state: createLocationState(props.descriptor),
        } as any) as BuiltLocationSnapshot,
      )

      return (
        <span data-built-href={builtHref} data-built-key={props.descriptor.key}>
          {builtHref}
        </span>
      )
    }
  },
})

const LinkPanel = Vue.defineComponent({
  setup() {
    return () => (
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
  },
})

const Root = Vue.defineComponent({
  setup() {
    return () => (
      <>
        <LinkPanel />
        <main>
          <Outlet />
        </main>
      </>
    )
  },
})

const rootRoute = createRootRoute({
  validateSearch: normalizeRootSearch,
  component: Root,
})

const DashboardPage = Vue.defineComponent({
  setup() {
    return () => <Outlet />
  },
})

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  component: DashboardPage,
})

const ProjectPage = Vue.defineComponent({
  setup() {
    const params = projectRoute.useParams()

    return () => (
      <>
        <div
          data-route-marker="project"
          data-project-id={params.value.projectId}
        />
        <Outlet />
      </>
    )
  },
})

const projectRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: 'projects/$projectId',
  component: ProjectPage,
})

const TaskPage = Vue.defineComponent({
  setup() {
    const params = taskRoute.useParams()

    return () => (
      <div
        data-route-marker="task"
        data-project-id={params.value.projectId}
        data-task-id={params.value.taskId}
      />
    )
  },
})

const taskRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: 'tasks/$taskId',
  component: TaskPage,
})

const ReportPage = Vue.defineComponent({
  setup() {
    const params = reportRoute.useParams()

    return () => (
      <div data-route-marker="report" data-report-id={params.value.reportId} />
    )
  },
})

const reportRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: 'reports/$reportId',
  component: ReportPage,
})

const SettingsPage = Vue.defineComponent({
  setup() {
    const params = settingsRoute.useParams()

    return () => (
      <div data-route-marker="settings" data-tab={params.value.tab ?? 'none'} />
    )
  },
})

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
      try {
        app.unmount()
      } finally {
        restoreScrollTo()
      }
    },
  }
}
