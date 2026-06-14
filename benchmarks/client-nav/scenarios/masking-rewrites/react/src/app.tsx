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
} from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'
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

function PanelLink({ descriptor }: { descriptor: LinkDescriptor }) {
  return (
    <Link
      {...(createLinkOptions(descriptor) as any)}
      data-masking-link="true"
      data-mask-link-key={descriptor.key}
      data-mask-link-kind={descriptor.kind}
      data-testid={descriptor.testId}
      activeOptions={{ includeSearch: descriptor.kind !== 'team-project' }}
      activeProps={{ className: 'active-link' }}
      inactiveProps={{ className: 'inactive-link' }}
    >
      {createLinkLabel(descriptor)}
    </Link>
  )
}

function BuildLocationProbe({ descriptor }: { descriptor: LinkDescriptor }) {
  const router = useRouter()
  const locationHref = useRouterState({
    select: (state) => state.location.href,
  })
  void locationHref

  const builtLocation = router.buildLocation({
    _fromLocation: router.state.location,
    ...createLinkOptions(descriptor),
  } as any) as unknown as BuiltLocationSnapshot
  const visiblePublicHref = readVisiblePublicHref(builtLocation)

  return (
    <span
      data-built-visible-href={visiblePublicHref}
      data-built-internal-href={builtLocation.href}
      data-built-key={descriptor.key}
      data-built-kind={descriptor.kind}
    >
      {visiblePublicHref}
    </span>
  )
}

function LinkPanel() {
  return (
    <section data-link-panel="masking-rewrites">
      {linkDescriptors.map((descriptor) => (
        <PanelLink key={descriptor.key} descriptor={descriptor} />
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
  validateSearch: normalizeMaskingSearch,
  component: Root,
})

function PhotosPage() {
  return <div data-route-marker="photos" />
}

const photosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/photos',
  component: PhotosPage,
})

function PhotoDetailPage() {
  const params = photoDetailRoute.useParams()

  return <div data-route-marker="photo-detail" data-photo-id={params.photoId} />
}

const photoDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/photos/$photoId',
  component: PhotoDetailPage,
})

function PhotoModalPage() {
  const params = photoModalRoute.useParams()

  return <div data-route-marker="photo-modal" data-photo-id={params.photoId} />
}

const photoModalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/photos/$photoId/modal',
  component: PhotoModalPage,
})

function SettingsProfilePage() {
  return <div data-route-marker="settings-profile" />
}

const settingsProfileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/profile',
  component: SettingsProfilePage,
})

function TeamProjectPage() {
  const params = teamProjectRoute.useParams()

  return (
    <div
      data-route-marker="team-project"
      data-team-id={params.teamId}
      data-project-id={params.projectId}
    />
  )
}

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
