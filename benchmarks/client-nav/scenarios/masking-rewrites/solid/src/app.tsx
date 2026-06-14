import { For, createMemo } from 'solid-js'
import { render } from 'solid-js/web'
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
} from '@tanstack/solid-router'
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

function PanelLink(props: { descriptor: LinkDescriptor }) {
  return (
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
}

function BuildLocationProbe(props: { descriptor: LinkDescriptor }) {
  const router = useRouter()
  const locationHref = useRouterState({
    select: (state) => state.location.href,
  })
  const builtLocation = createMemo(() => {
    void locationHref()

    return router.buildLocation({
      _fromLocation: router.state.location,
      ...createLinkOptions(props.descriptor),
    } as any) as unknown as BuiltLocationSnapshot
  })
  const visiblePublicHref = createMemo(() =>
    readVisiblePublicHref(builtLocation()),
  )

  return (
    <span
      data-built-visible-href={visiblePublicHref()}
      data-built-internal-href={builtLocation().href}
      data-built-key={props.descriptor.key}
      data-built-kind={props.descriptor.kind}
    >
      {visiblePublicHref()}
    </span>
  )
}

function LinkPanel() {
  return (
    <section data-link-panel="masking-rewrites">
      <For each={linkDescriptors}>
        {(descriptor) => <PanelLink descriptor={descriptor} />}
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

  return (
    <div data-route-marker="photo-detail" data-photo-id={params().photoId} />
  )
}

const photoDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/photos/$photoId',
  component: PhotoDetailPage,
})

function PhotoModalPage() {
  const params = photoModalRoute.useParams()

  return (
    <div data-route-marker="photo-modal" data-photo-id={params().photoId} />
  )
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
      data-team-id={params().teamId}
      data-project-id={params().projectId}
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
