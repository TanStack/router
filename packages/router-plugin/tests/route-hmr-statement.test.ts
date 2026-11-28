// @vitest-environment jsdom

import * as t from '@babel/types'
import {
  BaseRootRoute,
  RouterCore,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
} from '@tanstack/router-core'
import { generateFromAst } from '@tanstack/router-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '../../history/src'
import { createRouteHmrStatement } from '../src/core/hmr'
import type { AnyRoute, GetStoreConfig } from '@tanstack/router-core'
import type { HmrStyle } from '../src/core/config'

vi.mock('@tanstack/router-core/isServer', async (importOriginal) => ({
  ...(await importOriginal()),
  isServer: undefined,
}))

const getStoreConfig: GetStoreConfig = () => ({
  createMutableStore: createNonReactiveMutableStore,
  createReadonlyStore: createNonReactiveReadonlyStore,
  batch: (fn) => fn(),
})

type HotData = Record<string, unknown>

/**
 * Runs the emitted route HMR statement the way a bundler runs a route module:
 * the first `evaluate` is the initial load, later calls are hot updates.
 * Vite keeps `hot.data` across evaluations and calls the previous module's
 * accept callback; webpack hands data to the next evaluation via `dispose`.
 */
function createRouteModule(hmrStyle: HmrStyle, routeId: string) {
  const code = generateFromAst(
    t.program(
      createRouteHmrStatement([], {
        hmrStyle,
        targetFramework: 'react',
        routeId,
      }),
    ),
  )
    .code.replaceAll('import.meta.webpackHot', 'bundlerHot')
    .replaceAll('import.meta.hot', 'bundlerHot')
  const run = new Function('Route', 'bundlerHot', code) as (
    route: AnyRoute,
    hot: unknown,
  ) => void

  let viteData: HotData = {}
  let webpackData: HotData | undefined
  let disposeHandlers: Array<(data: HotData) => void> = []
  let acceptHandler: ((newModule: { Route: AnyRoute }) => void) | undefined

  return {
    evaluate(route: AnyRoute) {
      if (hmrStyle === 'webpack') {
        if (disposeHandlers.length) {
          webpackData = {}
          disposeHandlers.forEach((handler) => handler(webpackData!))
          disposeHandlers = []
        }
        run(route, {
          data: webpackData,
          accept: () => {},
          dispose: (handler: (data: HotData) => void) => {
            disposeHandlers.push(handler)
          },
        })
        return
      }

      const previousAcceptHandler = acceptHandler
      run(route, {
        data: viteData,
        accept: (handler: (newModule: { Route: AnyRoute }) => void) => {
          acceptHandler = handler
        },
      })
      previousAcceptHandler?.({ Route: route })
    },
  }
}

function createRootRoute(loader: () => string) {
  return new BaseRootRoute({ loader }) as unknown as AnyRoute
}

function createWindowRouter(routeTree: AnyRoute) {
  const router = new RouterCore(
    {
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer: false,
      origin: 'http://localhost',
    },
    getStoreConfig,
  )
  ;(window as any).__TSR_ROUTER__ = router
  return router
}

afterEach(() => {
  delete (window as any).__TSR_ROUTER__
})

describe.each<HmrStyle>(['vite', 'webpack'])(
  'route HMR statement (%s)',
  (hmrStyle) => {
    // Two apps on one page, e.g. a Module Federation host and remote. Both have
    // a `__root__` route, but only the host's router is on `window.__TSR_ROUTER__`.
    const hostLoader = () => 'host'
    const remoteLoader = () => 'remote'

    it('does not patch another module’s route that has the same id when loaded', () => {
      const hostRoot = createRootRoute(hostLoader)
      createRouteModule(hmrStyle, '/__root').evaluate(hostRoot)
      const router = createWindowRouter(hostRoot)

      const remoteRoot = createRootRoute(remoteLoader)
      createRouteModule(hmrStyle, '/__root').evaluate(remoteRoot)

      expect(router.routesById.__root__).toBe(hostRoot)
      expect(hostRoot.options.loader).toBe(hostLoader)
      expect(remoteRoot.options.loader).toBe(remoteLoader)
    })

    it('does not patch another module’s route that has the same id when hot updated', () => {
      const hostRoot = createRootRoute(hostLoader)
      createRouteModule(hmrStyle, '/__root').evaluate(hostRoot)
      createWindowRouter(hostRoot)

      const remoteModule = createRouteModule(hmrStyle, '/__root')
      remoteModule.evaluate(createRootRoute(remoteLoader))
      remoteModule.evaluate(createRootRoute(() => 'remote v2'))

      expect(hostRoot.options.loader).toBe(hostLoader)
    })

    it('patches its own route when hot updated', () => {
      const hostRoot = createRootRoute(hostLoader)
      const hostModule = createRouteModule(hmrStyle, '/__root')
      hostModule.evaluate(hostRoot)
      const router = createWindowRouter(hostRoot)

      const updatedLoader = () => 'host v2'
      hostModule.evaluate(createRootRoute(updatedLoader))

      expect(router.routesById.__root__).toBe(hostRoot)
      expect(hostRoot.options.loader).toBe(updatedLoader)
    })
  },
)
