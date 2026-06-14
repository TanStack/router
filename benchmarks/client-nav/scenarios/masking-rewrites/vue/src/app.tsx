import * as Vue from 'vue'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouteMask,
  createRouter,
  useRouter,
  useRouterState,
} from '@tanstack/vue-router'
import {
  buildLocationDescriptors,
  createLinkLabel,
  createLinkOptions,
  createMaskingRewrite,
  initialPublicHref,
  linkDescriptors,
  normalizeMaskingSearch,
  patchMissingScrollToGlobal,
  readVisiblePublicHref,
  routerBasepath,
  type BuiltLocationSnapshot,
  type LinkDescriptor,
} from '../../shared.ts'

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
        data-masking-link="true"
        data-mask-link-key={props.descriptor.key}
        data-mask-link-kind={props.descriptor.kind}
        data-testid={props.descriptor.testId}
        activeOptions={{
          includeSearch: props.descriptor.kind !== 'team-project',
        }}
        activeProps={{ class: 'active-link' }}
        inactiveProps={{ class: 'inactive-link' }}
      >
        {createLinkLabel(props.descriptor)}
      </Link>
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

      const builtLocation = router.buildLocation({
        _fromLocation: router.state.location,
        ...createLinkOptions(props.descriptor),
      } as any) as unknown as BuiltLocationSnapshot
      const visiblePublicHref = readVisiblePublicHref(builtLocation)

      return (
        <span
          data-built-visible-href={visiblePublicHref}
          data-built-internal-href={builtLocation.href}
          data-built-key={props.descriptor.key}
          data-built-kind={props.descriptor.kind}
        >
          {visiblePublicHref}
        </span>
      )
    }
  },
})

const LinkPanel = Vue.defineComponent({
  setup() {
    return () => (
      <section data-link-panel="masking-rewrites">
        {linkDescriptors.map((descriptor) => (
          <PanelLink key={descriptor.key} descriptor={descriptor} />
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
  validateSearch: normalizeMaskingSearch,
  component: Root,
})

const PhotosPage = Vue.defineComponent({
  setup() {
    return () => <div data-route-marker="photos" />
  },
})

const photosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/photos',
  component: PhotosPage,
})

const PhotoDetailPage = Vue.defineComponent({
  setup() {
    const params = photoDetailRoute.useParams()

    return () => (
      <div
        data-route-marker="photo-detail"
        data-photo-id={params.value.photoId}
      />
    )
  },
})

const photoDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/photos/$photoId',
  component: PhotoDetailPage,
})

const PhotoModalPage = Vue.defineComponent({
  setup() {
    const params = photoModalRoute.useParams()

    return () => (
      <div
        data-route-marker="photo-modal"
        data-photo-id={params.value.photoId}
      />
    )
  },
})

const photoModalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/photos/$photoId/modal',
  component: PhotoModalPage,
})

const SettingsProfilePage = Vue.defineComponent({
  setup() {
    return () => <div data-route-marker="settings-profile" />
  },
})

const settingsProfileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/profile',
  component: SettingsProfilePage,
})

const TeamProjectPage = Vue.defineComponent({
  setup() {
    const params = teamProjectRoute.useParams()

    return () => (
      <div
        data-route-marker="team-project"
        data-team-id={params.value.teamId}
        data-project-id={params.value.projectId}
      />
    )
  },
})

const teamProjectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/teams/$teamId/projects/$projectId',
  component: TeamProjectPage,
})

const routeTree = rootRoute.addChildren([
  photosRoute,
  photoDetailRoute,
  photoModalRoute,
  settingsProfileRoute,
  teamProjectRoute,
])

const photoModalMask = createRouteMask({
  routeTree,
  from: '/photos/$photoId/modal',
  to: '/photos/$photoId',
  params: true,
  search: { page: 1, filter: 'masked', layout: 'detail' },
  state: { scenario: 'masking-rewrites', mask: 'photo-modal' } as any,
  unmaskOnReload: true,
})

export function mountTestApp(container: HTMLDivElement) {
  const restoreScrollTo = patchMissingScrollToGlobal()
  const router = createRouter({
    history: createMemoryHistory({
      initialEntries: [initialPublicHref],
    }),
    basepath: routerBasepath,
    rewrite: createMaskingRewrite(),
    trailingSlash: 'never',
    routeTree,
    routeMasks: [photoModalMask],
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
