// @vitest-environment jsdom

/**
 * Route HMR applied to a live router: each test calls the route HMR code
 * the plugin emits (the stringified `handleRouteUpdate`, as the route
 * module's HMR code calls it once the bundler gave it the edited module)
 * with the route of an edited route file and a live router
 * (`window.__TSR_ROUTER__`). No hot context, disposal or module selection
 * is recreated here: what the bundler and the framework do with an edit is
 * tested on a real page (integration/route-hmr-browser*.test.ts).
 *
 * Implementation controls (outside the compiler test corpus: see
 * packages/compiler-test-utils/AGENTS.md; hmr H12): they call the plugin's
 * own HMR runtime (`getHandleRouteUpdateCode`) directly, which a rewrite may
 * replace. They give the semantics of today's update function, not proof
 * that a real host delivers an edit: the corpus decides delivery on real
 * pages.
 */

import {
  BaseRootRoute,
  BaseRoute,
  RouterCore,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
} from '@tanstack/router-core'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { Fragment, act, createElement } from 'react'
import { createPortal } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory } from '../../../history/src'
import { HeadContent } from '../../../react-router/src/HeadContent'
import { RouterContextProvider } from '../../../react-router/src/RouterProvider'
import { Scripts } from '../../../react-router/src/Scripts'
import { Router as ReactRouter } from '../../../react-router/src/router'
import { getFrameworkHmrCompilerPlugins } from '../../src/core/code-splitter/plugins/framework-plugins'
import { getHandleRouteUpdateCode } from '../../src/core/hmr'
import type { AnyRoute, GetStoreConfig } from '@tanstack/router-core'

vi.mock('@tanstack/router-core/isServer', async (importOriginal) => ({
  ...(await importOriginal()),
  isServer: undefined,
}))

const getStoreConfig: GetStoreConfig = () => ({
  createMutableStore: createNonReactiveMutableStore,
  createReadonlyStore: createNonReactiveReadonlyStore,
  batch: (fn) => fn(),
})

function asAnyRoute<TRoute>(route: TRoute): TRoute & AnyRoute {
  return route as unknown as TRoute & AnyRoute
}

function createClientTestRouter<TRouteTree>(
  routeTree: TRouteTree,
  initialEntry: string,
) {
  return new RouterCore(
    {
      routeTree: asAnyRoute(routeTree),
      history: createMemoryHistory({ initialEntries: [initialEntry] }),
      isServer: false,
      origin: 'http://localhost',
    },
    getStoreConfig,
  )
}

function createReactClientTestRouter<TRouteTree>(
  routeTree: TRouteTree,
  initialEntry: string,
) {
  return new ReactRouter({
    routeTree: asAnyRoute(routeTree),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
    isServer: false,
    origin: 'http://localhost',
  })
}

function withWindowRouter(router: RouterCore<any, any, any, any, any>) {
  const testWindow = globalThis.window as any
  const hadOwnRouter = Object.prototype.hasOwnProperty.call(
    testWindow,
    '__TSR_ROUTER__',
  )
  const previousRouter = testWindow.__TSR_ROUTER__
  testWindow.__TSR_ROUTER__ = router

  return () => {
    if (hadOwnRouter) {
      testWindow.__TSR_ROUTER__ = previousRouter
    } else {
      delete testWindow.__TSR_ROUTER__
    }
  }
}

/**
 * The route option keys the React framework plugins keep stable across hot
 * updates (the component options), as the compiler gives them to the
 * emitted `handleRouteUpdate`.
 */
const stableRouteOptionKeys = [
  ...new Set(
    (
      getFrameworkHmrCompilerPlugins({ targetFramework: 'react' }) ?? []
    ).flatMap((plugin) => plugin.getStableRouteOptionKeys?.() ?? []),
  ),
]

/** The emitted `handleRouteUpdate`, as the route HMR code calls it. */
const handleRouteUpdate = new Function(
  `return (${getHandleRouteUpdateCode(stableRouteOptionKeys)})`,
)() as (routeId: string, newRoute: AnyRoute) => void

/**
 * Applies a hot update of the route `routeId` to the live `router`: calls
 * the emitted `handleRouteUpdate` with the route the edited route file
 * creates (`createFileRoute(routeId)(options)`, or `createRootRoute(options)`
 * for the root), as the route module's HMR code does once the bundler gave
 * it the edited module. Returns that route, which holds the hot module's
 * `Route` export.
 */
function hotUpdateRoute(
  router: RouterCore<any, any, any, any, any>,
  routeId: string,
  options: Record<string, unknown> = {},
) {
  const Route = asAnyRoute(
    routeId === rootRouteId
      ? new BaseRootRoute(options as never)
      : new BaseRoute(options as never),
  )
  const restoreWindow = withWindowRouter(router)
  try {
    handleRouteUpdate(routeId, Route)
  } finally {
    restoreWindow()
  }
  return { Route }
}

/** The id the route tree gives the root route. */
const rootRouteId = '__root__'

/**
 * Navigates `router` to `to` (a path, or a route template with `params`)
 * and returns the route of the deepest match, and the routes whose search
 * middleware ran for the destination (see `markSearch`).
 */
async function visit(
  router: RouterCore<any, any, any, any, any>,
  to: string,
  params?: Record<string, string>,
) {
  await router.navigate({ to, params } as never)
  return {
    leaf: router.state.matches.at(-1)?.routeId,
    dest: Object.keys(router.state.location.search).sort(),
  }
}

/**
 * Route options whose search middleware adds the key `dest` to the
 * location's search: navigating to a path or a route template applies the
 * middlewares of the routes the router resolves the destination to.
 */
const markSearch = (dest: string) => ({
  search: {
    middlewares: [
      ({
        search,
        next,
      }: {
        search: object
        next: (search: object) => object
      }) => ({
        ...next(search),
        [dest]: 1,
      }),
    ],
  },
})

describe('handleRouteUpdate', () => {
  it('keeps matching and resolving an index route and the route under a pathless layout when the layout updates', async () => {
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(rootRoute),
      path: '/livestock/$farmId/medicine',
    })
    const pathlessRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(parentRoute),
      id: '_form',
    })
    const newRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(pathlessRoute),
      path: 'new',
      ...markSearch('new'),
    })
    const indexRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(parentRoute),
      path: '/',
      ...markSearch('index'),
    })
    const routeTree = rootRoute.addChildren([
      parentRoute.addChildren([
        pathlessRoute.addChildren([asAnyRoute(newRoute)]),
        asAnyRoute(indexRoute),
      ]),
    ])
    const router = createClientTestRouter(routeTree, '/')
    const routes = async () => [
      await visit(router, '/livestock/1/medicine'),
      await visit(router, '/livestock/$farmId/medicine', { farmId: '1' }),
      await visit(router, '/livestock/$farmId/medicine/new', { farmId: '1' }),
      await visit(router, '/livestock/1/medicine/new'),
    ]
    const expected = [
      { leaf: indexRoute.id, dest: ['index'] },
      { leaf: indexRoute.id, dest: ['index'] },
      { leaf: newRoute.id, dest: ['new'] },
      { leaf: newRoute.id, dest: ['new'] },
    ]
    await router.load()
    expect(await routes()).toEqual(expected)

    hotUpdateRoute(router, pathlessRoute.id, { staticData: { hot: true } })
    expect((router.routesById as any)[pathlessRoute.id].options).toMatchObject({
      staticData: { hot: true },
    })

    expect(await routes()).toEqual(expected)
  })

  it('keeps matching and resolving an index route when its parent updates', async () => {
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(rootRoute),
      path: '/path',
    })
    const indexRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(parentRoute),
      path: '/',
      ...markSearch('index'),
    })
    const routeTree = rootRoute.addChildren([
      parentRoute.addChildren([asAnyRoute(indexRoute)]),
    ])
    const router = createClientTestRouter(routeTree, '/')
    const expected = { leaf: indexRoute.id, dest: ['index'] }
    await router.load()
    expect(await visit(router, '/path')).toEqual(expected)

    hotUpdateRoute(router, parentRoute.id, { staticData: { hot: true } })
    expect((router.routesById as any)[parentRoute.id].options).toMatchObject({
      staticData: { hot: true },
    })

    await vi.waitFor(() => {
      expect(router.state.matches.at(-1)?.routeId).toBe(indexRoute.id)
    })
    expect(await visit(router, '/')).toMatchObject({ leaf: rootRoute.id })
    expect(await visit(router, '/path')).toEqual(expected)
    expect(await visit(router, '/path/')).toEqual(expected)
  })

  it('refreshes matching data when params.parse changes', async () => {
    const rootRoute = new BaseRootRoute({})
    const itemRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(rootRoute),
      path: '/items/$itemId',
      params: {
        parse: ({ itemId }: { itemId: string }) => {
          return /^\d+$/.test(itemId) ? { itemId } : false
        },
      },
    })
    const routeTree = rootRoute.addChildren([asAnyRoute(itemRoute)])
    const router = createClientTestRouter(routeTree, '/items/1')
    await router.load()
    expect(router.state.matches.at(-1)?.routeId).toBe(itemRoute.id)
    expect((await visit(router, '/items/abc')).leaf).not.toBe(itemRoute.id)

    hotUpdateRoute(router, itemRoute.id, {
      params: { parse: ({ itemId }: { itemId: string }) => ({ itemId }) },
    })

    expect((await visit(router, '/items/abc')).leaf).toBe(itemRoute.id)
  })

  // E.g. a page with several routers, or a route the live route tree does
  // not include: the update leaves the router as it is, and the live tree
  // keeps navigating.
  it('ignores an update of a route the live router does not have', async () => {
    const rootRoute = new BaseRootRoute({})
    const homeRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(rootRoute),
      path: '/home',
      loader: () => 'home',
    })
    const router = createClientTestRouter(
      rootRoute.addChildren([asAnyRoute(homeRoute)]),
      '/',
    )
    await router.load()
    expect(() =>
      hotUpdateRoute(router, '/hot', { loader: () => 'x' }),
    ).not.toThrow()
    expect(Object.keys(router.routesById).sort()).toEqual(
      [rootRoute.id, homeRoute.id].sort(),
    )
    await router.navigate({ to: '/home' })
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: homeRoute.id,
      loaderData: 'home',
    })
  })

  it('hydrates the hot module route export with generated route tree state', async () => {
    const rootRoute = new BaseRootRoute({})
    const itemRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(rootRoute),
      path: '/items/$itemId',
    })
    const routeTree = rootRoute.addChildren([asAnyRoute(itemRoute)])
    const router = createClientTestRouter(routeTree, '/items/1')
    await router.load()

    const { Route } = hotUpdateRoute(router, itemRoute.id)
    const newRoute = Route as unknown as AnyRoute

    expect(newRoute.id).toBe(itemRoute.id)
    expect(newRoute.path).toBe(itemRoute.path)
    expect(newRoute.fullPath).toBe(itemRoute.fullPath)
    expect(newRoute.to).toBe(itemRoute.to)
    // Code holding the hot module's `Route` sees the live route's place in
    // the tree and its options.
    expect((newRoute as any).parentRoute.id).toBe(rootRoute.id)
    expect((newRoute as any).options.path).toBe((itemRoute as any).options.path)
  })

  // The generated route tree gives a route the options of its `.lazy.tsx`
  // file (`.lazy(() => import('./items.lazy'))`); the edited route file
  // does not have them, and the route keeps them across the update.
  it("keeps the lazy options the route tree gave the route when the route's file is edited", async () => {
    const LazyComponent = () => 'lazy component'
    const lazyImporter = vi.fn(() =>
      Promise.resolve({ options: { component: LazyComponent } } as any),
    )
    const rootRoute = new BaseRootRoute({})
    const itemRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(rootRoute),
      path: '/items/$itemId',
    }).lazy(lazyImporter)
    const router = createClientTestRouter(
      rootRoute.addChildren([asAnyRoute(itemRoute)]),
      '/items/1',
    )
    const liveOptions = () => (router.routesById as any)[itemRoute.id].options

    // Loading the active route loads its lazy options
    await router.load()
    expect(liveOptions().component).toBe(LazyComponent)

    hotUpdateRoute(router, itemRoute.id, { loader: () => 'edited' })
    await vi.waitFor(() => {
      expect(router.state.matches.at(-1)).toMatchObject({
        routeId: itemRoute.id,
        loaderData: 'edited',
      })
    })
    await router.navigate({ to: '/items/$itemId', params: { itemId: '2' } })
    expect(router.state.matches.at(-1)?.loaderData).toBe('edited')
    expect(liveOptions().component).toBe(LazyComponent)
  })

  it('removes stale loader data when a hot route removes its loader', async () => {
    const rootRoute = new BaseRootRoute({})
    const hotRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(rootRoute),
      path: '/hot',
      loader: () => 'stale loader data',
    })
    const router = createClientTestRouter(
      rootRoute.addChildren([asAnyRoute(hotRoute)]),
      '/hot',
    )
    await router.load()

    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      hotRoute.id,
    ])
    expect(router.state.matches[1]!.loaderData).toBe('stale loader data')

    hotUpdateRoute(router, hotRoute.id)
    await vi.waitFor(() => {
      expect(router.state.matches.map((match) => match.routeId)).toEqual([
        rootRoute.id,
        hotRoute.id,
      ])
      expect(router.state.matches[1]!.loaderData).toBeUndefined()
    })
  })

  it('keeps hot loader data when an older refresh settles later', async () => {
    let resolveStaleRefresh!: (value: string) => void
    const staleRefresh = new Promise<string>((resolve) => {
      resolveStaleRefresh = resolve
    })
    const oldLoader = vi
      .fn<() => string | Promise<string>>()
      .mockReturnValueOnce('initial')
      .mockReturnValueOnce(staleRefresh)
    const newLoader = vi.fn(() => 'hot')
    const rootRoute = new BaseRootRoute({ loader: oldLoader })
    const router = createClientTestRouter(rootRoute, '/')

    await router.load()
    expect(router.state.matches[0]?.loaderData).toBe('initial')

    const oldRefresh = router.invalidate()
    await vi.waitFor(() => expect(oldLoader).toHaveBeenCalledTimes(2))

    hotUpdateRoute(router, rootRouteId, { loader: newLoader })

    await vi.waitFor(() => {
      expect(router.state.matches[0]?.loaderData).toBe('hot')
    })

    resolveStaleRefresh('stale')
    await oldRefresh

    expect(newLoader).toHaveBeenCalledTimes(1)
    expect(router.state.matches[0]!.routeId).toBe(rootRoute.id)
    expect(router.state.matches[0]!.loaderData).toBe('hot')
  })

  it('does not cache an obsolete inactive preload that settles after a hot update', async () => {
    let resolveOldLoader!: (value: string) => void
    const oldLoaderResult = new Promise<string>((resolve) => {
      resolveOldLoader = resolve
    })
    const oldLoader = vi.fn(() => oldLoaderResult)
    const newLoader = vi.fn(() => 'hot')
    const rootRoute = new BaseRootRoute({})
    const hotRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(rootRoute),
      path: '/hot',
      loader: oldLoader,
      preloadStaleTime: Infinity,
    })
    const router = createClientTestRouter(
      rootRoute.addChildren([asAnyRoute(hotRoute)]),
      '/',
    )

    await router.load()
    const preload = router.preloadRoute({ to: '/hot' })
    await vi.waitFor(() => expect(oldLoader).toHaveBeenCalledOnce())

    hotUpdateRoute(router, hotRoute.id, { loader: newLoader })

    resolveOldLoader('obsolete')
    await preload
    await router.navigate({ to: '/hot' })

    expect(newLoader).toHaveBeenCalledOnce()
    expect(router.state.matches.at(-1)?.loaderData).toBe('hot')
  })

  it('observes hot parser and route-context changes on the active route', async () => {
    const rootRoute = new BaseRootRoute({})
    const itemRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(rootRoute),
      path: '/items/$itemId',
      params: {
        parse: ({ itemId }: { itemId: string }) => ({
          itemId,
          parser: 'old',
        }),
      },
      context: () => ({ source: 'old' }),
    })
    const router = createClientTestRouter(
      rootRoute.addChildren([asAnyRoute(itemRoute)]),
      '/items/abc',
    )

    await router.load()
    expect(router.state.matches[1]!.routeId).toBe(itemRoute.id)
    expect(router.state.matches[1]!.params).toEqual({
      itemId: 'abc',
      parser: 'old',
    })
    expect(router.state.matches[1]!.context).toMatchObject({ source: 'old' })

    hotUpdateRoute(router, itemRoute.id, {
      params: {
        parse: ({ itemId }: { itemId: string }) => ({ itemId, parser: 'new' }),
      },
      context: () => ({ source: 'new' }),
    })

    await vi.waitFor(() => {
      expect(router.state.matches[1]!.routeId).toBe(itemRoute.id)
      expect(router.state.matches[1]!.params).toEqual({
        itemId: 'abc',
        parser: 'new',
      })
      expect(router.state.matches[1]!.context).toMatchObject({ source: 'new' })
    })
  })

  it('rematerializes descendants when a parent route definition changes', async () => {
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(rootRoute),
      path: '/parent',
      context: () => ({ source: 'old' }),
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(parentRoute),
      path: '/child',
      context: ({ context }) => ({ inheritedSource: context.source }),
    })
    const router = createClientTestRouter(
      rootRoute.addChildren([
        parentRoute.addChildren([asAnyRoute(childRoute)]),
      ]),
      '/parent/child',
    )

    await router.load()
    expect(router.state.matches[2]?.context).toMatchObject({
      inheritedSource: 'old',
    })

    hotUpdateRoute(router, parentRoute.id, {
      context: () => ({ source: 'new' }),
    })

    await vi.waitFor(() => {
      expect(router.state.matches[2]?.context).toMatchObject({
        inheritedSource: 'new',
      })
    })
  })

  it('does not run removed loader or beforeLoad callbacks on a later visit', async () => {
    const beforeLoad = vi.fn(() => ({ hotBeforeLoad: true }))
    const loader = vi.fn(() => 'hot loader data')
    const rootRoute = new BaseRootRoute({})
    const hotRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(rootRoute),
      path: '/hot',
      beforeLoad,
      loader,
      staleTime: Infinity,
      gcTime: Infinity,
    })
    const otherRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(rootRoute),
      path: '/other',
    })
    const router = createClientTestRouter(
      rootRoute.addChildren([asAnyRoute(hotRoute), asAnyRoute(otherRoute)]),
      '/hot',
    )

    await router.load()
    await router.navigate({ to: '/other' })
    expect(beforeLoad).toHaveBeenCalledTimes(1)
    expect(loader).toHaveBeenCalledTimes(1)

    hotUpdateRoute(router, hotRoute.id)
    await router.navigate({ to: '/hot' })

    const match = router.state.matches.find(
      (candidate) => candidate.routeId === hotRoute.id,
    )
    expect(beforeLoad).toHaveBeenCalledTimes(1)
    expect(loader).toHaveBeenCalledTimes(1)
    expect(match).toBeDefined()
    expect(match!.loaderData).toBeUndefined()
    expect(match!.context).not.toHaveProperty('hotBeforeLoad')
  })

  it('removes rendered HeadContent and Scripts output after a hot update', async () => {
    const rootRoute = new BaseRootRoute({})
    const hotRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(rootRoute),
      path: '/hot',
      head: () => ({
        meta: [{ title: 'hot title' }],
        scripts: [{ src: '/hot-head.js' }],
      }),
      scripts: () => [{ src: '/hot-body.js' }],
    })
    const router = createReactClientTestRouter(
      rootRoute.addChildren([asAnyRoute(hotRoute)]),
      '/hot',
    )

    await router.load()
    expect(router.state.matches[1]!).toMatchObject({
      routeId: hotRoute.id,
      meta: [{ title: 'hot title' }],
      headScripts: [{ src: '/hot-head.js' }],
      scripts: [{ src: '/hot-body.js' }],
    })

    const container = document.createElement('div')
    document.body.appendChild(container)
    const reactRoot = createRoot(container)
    const previousActEnvironment = (globalThis as any).IS_REACT_ACT_ENVIRONMENT
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    onTestFinished(() => {
      if (previousActEnvironment === undefined) {
        delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT
      } else {
        ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
      }
    })
    onTestFinished(() => {
      container.remove()
    })
    onTestFinished(async () => {
      // React's async act() also waits for the updates the callback queues
      // eslint-disable-next-line @typescript-eslint/require-await
      await act(async () => {
        reactRoot.unmount()
      })
    })

    // eslint-disable-next-line @typescript-eslint/require-await
    await act(async () => {
      reactRoot.render(
        createElement(RouterContextProvider, {
          router,
          children: createElement(
            Fragment,
            null,
            createPortal(createElement(HeadContent), document.head),
            createElement(Scripts),
          ),
        }),
      )
    })

    expect(document.head.querySelector('title')?.textContent).toBe('hot title')
    expect(
      document.head.querySelector('script[src="/hot-head.js"]'),
    ).not.toBeNull()
    expect(
      document.head.querySelector('script[src="/hot-body.js"]'),
    ).not.toBeNull()

    await act(async () => {
      hotUpdateRoute(router, hotRoute.id)
      await vi.waitFor(() => {
        expect(router.state.matches[1]!.routeId).toBe(hotRoute.id)
        expect(router.state.matches[1]!.meta).toBeUndefined()
        expect(router.state.matches[1]!.headScripts).toBeUndefined()
        expect(router.state.matches[1]!.scripts).toBeUndefined()
      })
    })

    expect(document.head.querySelector('title')).toBeNull()
    expect(document.head.querySelector('script[src="/hot-head.js"]')).toBeNull()
    expect(document.head.querySelector('script[src="/hot-body.js"]')).toBeNull()
  })
})
