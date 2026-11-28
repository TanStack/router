import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { createPortal } from 'react-dom'
import { afterEach, expect, test, vi } from 'vitest'
import {
  HeadContent,
  Outlet,
  RouterProvider,
  Scripts,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import { hydrate } from '../src/ssr/client'
import {
  RouterServer,
  createRequestHandler,
  renderRouterToString,
} from '../src/ssr/server'
import type { ReactNode } from 'react'
import type { ServerManifest } from '@tanstack/router-core'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  delete window.$_TSR
  delete (window as Window & { $R?: unknown }).$R
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

async function renderDocument(opts: {
  url: string
  createRouter: () => ReturnType<typeof createRouter>
  manifest: ServerManifest
  onRendered?: (routeIds: Array<string>) => void
}) {
  const response = await createRequestHandler({
    request: new Request(`http://localhost${opts.url}`),
    createRouter: opts.createRouter,
    getRouterManifest: () => opts.manifest,
  })(({ router, responseHeaders }) => {
    opts.onRendered?.(router.state.matches.map((match) => match.routeId))
    return renderRouterToString({
      router,
      responseHeaders,
      children: <RouterServer router={router} />,
    })
  })
  expect(response.status).toBe(200)
  return response.text()
}

function runDocumentScripts(serverDocument: Document) {
  const currentScriptSpy = vi.spyOn(document, 'currentScript', 'get')
  try {
    // These scripts come exclusively from this test's server-rendered HTML.
    for (const script of serverDocument.querySelectorAll('script')) {
      currentScriptSpy.mockReturnValue(script)
      new Function(script.textContent ?? '')()
      script.remove()
    }
  } finally {
    currentScriptSpy.mockRestore()
  }
}

test('SSR HTML does not expose matched route ids as URL-like strings', async () => {
  const createRouteTree = () => {
    const rootRoute = createRootRoute({
      shellComponent: RootDocument,
      component: Outlet,
    })
    // Pathless layout and route groups, as emitted by the file-route generator
    // for `routes/_layout/(marketing)/blog/(posts)/$slug.tsx`.
    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      component: Outlet,
    })
    const marketingGroupRoute = createRoute({
      getParentRoute: () => layoutRoute,
      id: '(marketing)',
      component: Outlet,
    })
    const blogRoute = createRoute({
      getParentRoute: () => marketingGroupRoute,
      path: 'blog',
      component: Outlet,
    })
    const postsGroupRoute = createRoute({
      getParentRoute: () => blogRoute,
      id: '(posts)',
      component: Outlet,
    })
    const postRoute = createRoute({
      getParentRoute: () => postsGroupRoute,
      path: '$slug',
      loader: ({ params }) => ({ slug: params.slug }),
      component: function Post() {
        const { slug } = postRoute.useLoaderData()
        return <article>Post {slug}</article>
      },
    })
    return rootRoute.addChildren([
      layoutRoute.addChildren([
        marketingGroupRoute.addChildren([
          blogRoute.addChildren([postsGroupRoute.addChildren([postRoute])]),
        ]),
      ]),
    ])
  }

  const manifest: ServerManifest = {
    routes: {
      __root__: { css: ['/assets/route-ids-root.css'] },
      '/_layout': { css: ['/assets/route-ids-layout.css'] },
      '/_layout/(marketing)/blog': {
        preloads: ['/assets/route-ids-blog.js'],
      },
      '/_layout/(marketing)/blog/(posts)': {
        css: ['/assets/route-ids-posts.css'],
      },
      '/_layout/(marketing)/blog/(posts)/$slug': {
        css: ['/assets/route-ids-post.css'],
        preloads: ['/assets/route-ids-post.js'],
      },
    },
  }

  let matchedRouteIds: Array<string> = []
  const html = await renderDocument({
    url: '/blog/my-post',
    createRouter: () =>
      createRouter({ routeTree: createRouteTree(), isServer: true }),
    manifest,
    onRendered: (routeIds) => {
      matchedRouteIds = routeIds
    },
  })

  expect(matchedRouteIds).toEqual([
    '__root__',
    '/_layout',
    '/_layout/(marketing)',
    '/_layout/(marketing)/blog',
    '/_layout/(marketing)/blog/(posts)',
    '/_layout/(marketing)/blog/(posts)/$slug',
  ])
  const serverDocument = new DOMParser().parseFromString(html, 'text/html')
  expect(serverDocument.body.textContent).toContain('Post my-post')
  // The matched routes' assets are real URLs and are rendered in route order.
  const headHrefs = (rel: string) =>
    Array.from(
      serverDocument.head.querySelectorAll(`link[rel="${rel}"]`),
      (link) => link.getAttribute('href'),
    )
  expect(headHrefs('stylesheet')).toEqual([
    '/assets/route-ids-root.css',
    '/assets/route-ids-layout.css',
    '/assets/route-ids-posts.css',
    '/assets/route-ids-post.css',
  ])
  expect(headHrefs('modulepreload')).toEqual([
    '/assets/route-ids-blog.js',
    '/assets/route-ids-post.js',
  ])

  // A crawler extracts slash-delimited strings from inline scripts as relative
  // URLs. None of these route ids is a real URL of this app.
  expect(
    matchedRouteIds.filter(
      (routeId) => routeId !== '__root__' && html.includes(routeId),
    ),
  ).toEqual([])
  expect(
    html.match(/[^"'\s]*\/(?:\((?:marketing|posts)\)|_layout|\$slug)[^"'\s]*/g),
  ).toBeNull()
})

test('a masked reload does not apply the server route assets or data to the unmasked client route', async () => {
  const createRouteTree = (opts: {
    shell: 'document' | 'portal'
    rootLoader: () => unknown
    photoLoader: () => unknown
    modalLoader: () => unknown
  }) => {
    const rootRoute = createRootRoute({
      loader: opts.rootLoader,
      ...(opts.shell === 'document'
        ? { shellComponent: RootDocument, component: Outlet }
        : {
            component: () => (
              <>
                {createPortal(<HeadContent />, document.head)}
                <Outlet />
              </>
            ),
          }),
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <div>Gallery</div>,
    })
    const photoRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/photos/$id',
      loader: opts.photoLoader,
      component: function Photo() {
        return (
          <div data-testid="photo">
            {JSON.stringify(photoRoute.useLoaderData())}
          </div>
        )
      },
    })
    const modalRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/photos/$id/modal',
      loader: opts.modalLoader,
      component: function PhotoModal() {
        return (
          <div data-testid="modal">
            {JSON.stringify(modalRoute.useLoaderData())}
          </div>
        )
      },
    })
    return rootRoute.addChildren([indexRoute, photoRoute, modalRoute])
  }

  // The user opens the photo modal from the gallery through a masked link.
  // With the default `unmaskOnReload: false`, the mask survives a reload.
  const history = createMemoryHistory({ initialEntries: ['/'] })
  const browsingRouter = createRouter({
    routeTree: createRouteTree({
      shell: 'portal',
      rootLoader: () => ({ source: 'browsing root' }),
      photoLoader: () => ({ source: 'browsing photo' }),
      modalLoader: () => ({ source: 'browsing modal' }),
    }),
    history,
  })
  await browsingRouter.load()
  await browsingRouter.navigate({
    to: '/photos/$id/modal',
    params: { id: '5' },
    mask: { to: '/photos/$id', params: { id: '5' } },
  })
  expect(history.location.pathname).toBe('/photos/5')
  expect(history.location.state.__tempLocation).toMatchObject({
    pathname: '/photos/5/modal',
  })
  expect(history.location.state.__tempKey).toBeUndefined()

  // On reload the server only sees the masked URL, so it renders the photo.
  const manifest: ServerManifest = {
    routes: {
      __root__: { css: ['/assets/masked-reload-root.css'] },
      '/photos/$id': {
        css: ['/assets/masked-reload-photo.css'],
        preloads: ['/assets/masked-reload-photo.js'],
      },
      '/photos/$id/modal': {
        css: ['/assets/masked-reload-modal.css'],
        preloads: ['/assets/masked-reload-modal.js'],
      },
    },
  }
  let serverRouteIds: Array<string> = []
  const html = await renderDocument({
    url: '/photos/5',
    createRouter: () =>
      createRouter({
        routeTree: createRouteTree({
          shell: 'document',
          rootLoader: () => ({ source: 'server root' }),
          photoLoader: () => ({ source: 'server photo' }),
          modalLoader: () => ({ source: 'server modal' }),
        }),
        isServer: true,
      }),
    manifest,
    onRendered: (routeIds) => {
      serverRouteIds = routeIds
    },
  })
  expect(serverRouteIds).toEqual(['__root__', '/photos/$id'])
  const serverDocument = new DOMParser().parseFromString(html, 'text/html')
  expect(serverDocument.body.textContent).toContain('server photo')
  expect(
    serverDocument.head.querySelector(
      'link[rel="stylesheet"][href="/assets/masked-reload-photo.css"]',
    ),
  ).not.toBeNull()
  runDocumentScripts(serverDocument)
  expect(window.$_TSR?.router).toBeDefined()

  // The reloaded client presents the real location stored in history state,
  // so it matches the modal route at the index where the server matched the
  // photo route.
  const clientRootLoader = vi.fn(() => ({ source: 'client root' }))
  const clientPhotoLoader = vi.fn(() => ({ source: 'client photo' }))
  const clientModalLoader = vi.fn(() => ({ source: 'client modal' }))
  const clientRouter = createRouter({
    routeTree: createRouteTree({
      shell: 'portal',
      rootLoader: clientRootLoader,
      photoLoader: clientPhotoLoader,
      modalLoader: clientModalLoader,
    }),
    history,
  })

  await hydrate(clientRouter)

  expect(clientRouter.state.location.pathname).toBe('/photos/5/modal')
  expect(clientRouter.state.location.maskedLocation?.pathname).toBe('/photos/5')

  await act(() => render(<RouterProvider router={clientRouter} />))

  expect(await screen.findByTestId('modal')).toHaveTextContent('client modal')
  expect(screen.queryByTestId('photo')).not.toBeInTheDocument()
  expect(clientModalLoader).toHaveBeenCalledTimes(1)
  expect(clientPhotoLoader).not.toHaveBeenCalled()
  // The shared root prefix keeps its server data.
  expect(clientRootLoader).not.toHaveBeenCalled()
  expect(
    clientRouter.state.matches.map((match) => ({
      routeId: match.routeId,
      status: match.status,
      loaderData: match.loaderData,
    })),
  ).toEqual([
    {
      routeId: '__root__',
      status: 'success',
      loaderData: { source: 'server root' },
    },
    {
      routeId: '/photos/$id/modal',
      status: 'success',
      loaderData: { source: 'client modal' },
    },
  ])

  // The shared root prefix keeps its assets; the photo route's assets are not
  // applied to the modal match at the same index.
  expect(
    document.querySelector(
      'link[rel="stylesheet"][href="/assets/masked-reload-root.css"]',
    ),
  ).not.toBeNull()
  expect(
    document.querySelector('link[href="/assets/masked-reload-photo.css"]'),
  ).toBeNull()
  expect(
    document.querySelector('link[href="/assets/masked-reload-photo.js"]'),
  ).toBeNull()
})

test('a masked reload keeps root route assets when the root loaderDeps differ between server and client', async () => {
  const createRouteTree = (opts: {
    shell: 'document' | 'portal'
    rootLoader: (deps: { theme: unknown }) => unknown
  }) => {
    const rootRoute = createRootRoute({
      loaderDeps: ({ search }) => ({
        theme: (search as { theme?: unknown }).theme,
      }),
      loader: ({ deps }) => opts.rootLoader(deps),
      ...(opts.shell === 'document'
        ? { shellComponent: RootDocument, component: Outlet }
        : {
            component: () => (
              <>
                {createPortal(<HeadContent />, document.head)}
                <Outlet />
              </>
            ),
          }),
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <div>Gallery</div>,
    })
    const photoRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/photos/$id',
      component: () => <div data-testid="photo">Photo</div>,
    })
    const modalRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/photos/$id/modal',
      component: () => <div data-testid="modal">Modal</div>,
    })
    return rootRoute.addChildren([indexRoute, photoRoute, modalRoute])
  }

  // The masked link presents a different `theme` search param than the real
  // location, so the root match id (which includes loaderDeps) differs between
  // the masked URL the server renders and the location the client restores.
  const history = createMemoryHistory({ initialEntries: ['/'] })
  const browsingRouter = createRouter({
    routeTree: createRouteTree({
      shell: 'portal',
      rootLoader: (deps) => ({ source: 'browsing root', ...deps }),
    }),
    history,
  })
  await browsingRouter.load()
  await browsingRouter.navigate({
    to: '/photos/$id/modal',
    params: { id: '5' },
    search: { theme: 'modal' },
    mask: { to: '/photos/$id', params: { id: '5' }, search: { theme: 'page' } },
  })
  expect(history.location.pathname).toBe('/photos/5')
  expect(history.location.search).toBe('?theme=page')
  expect(history.location.state.__tempLocation).toMatchObject({
    pathname: '/photos/5/modal',
    search: '?theme=modal',
  })

  const manifest: ServerManifest = {
    routes: {
      __root__: { css: ['/assets/masked-deps-root.css'] },
      '/photos/$id': { css: ['/assets/masked-deps-photo.css'] },
    },
  }
  const html = await renderDocument({
    url: '/photos/5?theme=page',
    createRouter: () =>
      createRouter({
        routeTree: createRouteTree({
          shell: 'document',
          rootLoader: (deps) => ({ source: 'server root', ...deps }),
        }),
        isServer: true,
      }),
    manifest,
  })
  const serverDocument = new DOMParser().parseFromString(html, 'text/html')
  expect(
    serverDocument.head.querySelector(
      'link[rel="stylesheet"][href="/assets/masked-deps-root.css"]',
    ),
  ).not.toBeNull()
  runDocumentScripts(serverDocument)
  const serverRootMatchId = window.$_TSR!.router!.matches[0]!.i

  const clientRootLoader = vi.fn((deps: { theme: unknown }) => ({
    source: 'client root',
    ...deps,
  }))
  const clientRouter = createRouter({
    routeTree: createRouteTree({
      shell: 'portal',
      rootLoader: clientRootLoader,
    }),
    history,
  })

  await hydrate(clientRouter)

  expect(clientRouter.state.location.pathname).toBe('/photos/5/modal')
  expect(clientRouter.state.location.maskedLocation?.pathname).toBe('/photos/5')
  // Same root route, different root match instance.
  expect(clientRouter.state.matches[0]!.routeId).toBe('__root__')
  expect(serverRootMatchId).toContain('page')
  expect(clientRouter.state.matches[0]!.id).toContain('modal')
  expect(clientRouter.state.matches[0]!.id).not.toContain('page')

  const rootStylesheet = () =>
    document.querySelector(
      'link[rel="stylesheet"][href="/assets/masked-deps-root.css"]',
    )

  await act(() => render(<RouterProvider router={clientRouter} />))

  expect(await screen.findByTestId('modal')).toBeInTheDocument()
  expect(rootStylesheet()).not.toBeNull()

  await waitFor(() =>
    expect(clientRouter.state.matches.map((match) => match.status)).toEqual([
      'success',
      'success',
    ]),
  )
  expect(clientRootLoader).toHaveBeenCalledWith({ theme: 'modal' })
  expect(clientRouter.state.matches[0]!.loaderData).toEqual({
    source: 'client root',
    theme: 'modal',
  })
  expect(rootStylesheet()).not.toBeNull()
  // The photo route was not matched on the client; its assets stay unused.
  expect(
    document.querySelector('link[href="/assets/masked-deps-photo.css"]'),
  ).toBeNull()
})
