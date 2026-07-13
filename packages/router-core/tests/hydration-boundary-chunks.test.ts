import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, notFound } from '../src'
import { hydrate } from '../src/ssr/client'
import { createTestRouter } from './routerTestUtils'
import type { TsrSsrGlobal } from '../src/ssr/types'
import type { Manifest } from '../src/manifest'

const testManifest: Manifest = { routes: {} }

describe('hydration route chunks below a server boundary', () => {
  let mockWindow: { $_TSR?: TsrSsrGlobal }

  beforeEach(() => {
    mockWindow = {}
    ;(global as any).window = mockWindow
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete (global as any).window
  })

  test('hydrates an error boundary without requiring its normal component chunk', async () => {
    const serverError = new Error('server beforeLoad failed')
    const normalChunkError = new Error('normal component chunk unavailable')
    const normalComponentPreload = vi.fn(() => Promise.reject(normalChunkError))
    const errorComponentPreload = vi.fn(() => Promise.resolve())
    const NormalComponent = Object.assign(() => null, {
      preload: normalComponentPreload,
    })
    const ErrorComponent = Object.assign(() => null, {
      preload: errorComponentPreload,
    })

    const rootRoute = new BaseRootRoute({})
    const appRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/app',
      beforeLoad: () => {
        // This is the server-side failure represented by the dehydrated
        // boundary below. Hydration must preserve that committed outcome.
        throw serverError
      },
      component: NormalComponent,
      errorComponent: ErrorComponent,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([appRoute]),
      history: createMemoryHistory({ initialEntries: ['/app'] }),
      isServer: false,
    })
    const matches = router.matchRoutes(router.stores.location.get())

    mockWindow.$_TSR = {
      router: {
        manifest: testManifest,
        dehydratedData: {},
        matches: [
          {
            i: matches[0]!.id,
            s: 'success',
            ssr: true,
            u: Date.now(),
          },
          {
            i: matches[1]!.id,
            s: 'error',
            e: serverError,
            ssr: true,
            u: Date.now(),
          },
        ],
      },
      h: vi.fn(),
      e: vi.fn(),
      c: vi.fn(),
      p: vi.fn(),
      buffer: [],
      initialized: false,
    }

    await expect(hydrate(router)).resolves.toBeUndefined()

    const appMatch = router.state.matches.find(
      (match) => match.routeId === appRoute.id,
    )
    expect(appMatch?.status).toBe('error')
    expect(appMatch?.error).toBe(serverError)
    expect(normalComponentPreload).not.toHaveBeenCalled()
    expect(errorComponentPreload).toHaveBeenCalledTimes(1)
  })

  test('hydrates an ancestor notFound boundary without loading an omitted descendant chunk', async () => {
    const childChunkError = new Error('omitted child chunk unavailable')
    const childComponentPreload = vi.fn(() => Promise.reject(childChunkError))
    const ChildComponent = Object.assign(() => null, {
      preload: childComponentPreload,
    })

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      notFoundComponent: () => 'not found',
    })
    const serverNotFound = notFound({ routeId: parentRoute.id })
    const childLoader = vi.fn(() => {
      // This is the server loader outcome that selected and dehydrated the
      // parent boundary. The hydration replay must keep this loader skipped.
      throw serverNotFound
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: childLoader,
      component: ChildComponent,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
      isServer: false,
    })
    const matches = router.matchRoutes(router.stores.location.get())

    mockWindow.$_TSR = {
      router: {
        manifest: testManifest,
        dehydratedData: {},
        // The server lane stopped at the parent boundary and never rendered
        // or dehydrated the child.
        matches: [
          {
            i: matches[0]!.id,
            s: 'success',
            ssr: true,
            u: Date.now(),
          },
          {
            i: matches[1]!.id,
            s: 'notFound',
            e: serverNotFound,
            ssr: true,
            u: Date.now(),
          },
        ],
      },
      h: vi.fn(),
      e: vi.fn(),
      c: vi.fn(),
      p: vi.fn(),
      buffer: [],
      initialized: false,
    }

    await expect(hydrate(router)).resolves.toBeUndefined()

    await vi.waitFor(() => {
      expect(router.state.matches.map((match) => match.routeId)).toEqual([
        rootRoute.id,
        parentRoute.id,
      ])
    })
    expect(router.state.matches[1]?.status).toBe('notFound')
    expect(childComponentPreload).not.toHaveBeenCalled()
    expect(childLoader).not.toHaveBeenCalled()
  })
})
