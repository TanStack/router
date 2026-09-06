import { transformFromAstSync } from '@babel/core'
import * as t from '@babel/types'
import { describe, expect, it, vi } from 'vitest'
import { createRouteHmrStatement } from '../src/core/hmr'

function createRoute(loader = () => 'initial') {
  return {
    id: '/posts',
    options: { loader },
    update: vi.fn(),
  }
}

function createRouter(route: ReturnType<typeof createRoute>) {
  return {
    routesById: { '/posts': route },
    buildRouteTree: vi.fn(() => ({})),
    setRoutes: vi.fn(),
    _replaceRouteChunk: vi.fn(),
    _refreshRoute: vi.fn(),
    resolvePathCache: new Map(),
  }
}

describe.each(['vite', 'webpack'] as const)(
  '%s HMR module lifecycle',
  (hmrStyle) => {
    function evaluate(
      route: ReturnType<typeof createRoute>,
      router: ReturnType<typeof createRouter>,
      hot: {
        data: Record<string, unknown>
        accept: ReturnType<typeof vi.fn>
        dispose: ReturnType<typeof vi.fn>
      },
    ) {
      const statements = createRouteHmrStatement([], {
        hmrStyle,
        targetFramework: 'react',
        routeId: '/posts',
      })
      const code = transformFromAstSync(
        t.file(t.program(statements)),
        undefined,
        {
          babelrc: false,
          configFile: false,
        },
      )!.code!
      const run = new Function(
        'window',
        'Route',
        'hotContext',
        code
          .replaceAll('import.meta.webpackHot', 'hotContext')
          .replaceAll('import.meta.hot', 'hotContext'),
      )
      run({ __TSR_ROUTER__: router }, route, hot)
    }

    it('does not patch a same-id route owned by another router on first import', () => {
      const foreignRoute = createRoute(() => 'foreign')
      const incomingRoute = createRoute(() => 'incoming')
      const router = createRouter(foreignRoute)
      const hot = { data: {}, accept: vi.fn(), dispose: vi.fn() }

      evaluate(incomingRoute, router, hot)

      expect(foreignRoute.options.loader()).toBe('foreign')
      expect(incomingRoute.options.loader()).toBe('incoming')
      expect(foreignRoute.update).not.toHaveBeenCalled()
      expect(router.setRoutes).not.toHaveBeenCalled()
      expect(router._refreshRoute).not.toHaveBeenCalled()
      expect(hot.accept).toHaveBeenCalledOnce()
    })

    it('updates the live route on a later hot evaluation', () => {
      const liveRoute = createRoute()
      const router = createRouter(liveRoute)
      const hot = { data: {}, accept: vi.fn(), dispose: vi.fn() }
      evaluate(liveRoute, router, hot)

      if (hmrStyle === 'webpack') {
        const disposedData = {}
        hot.dispose.mock.calls[0]![0](disposedData)
        hot.data = disposedData
      }
      const replacement = createRoute(() => 'updated')
      evaluate(replacement, router, hot)

      expect(liveRoute.options.loader()).toBe('updated')
      expect(liveRoute.update).toHaveBeenCalledOnce()
      expect(router.setRoutes).toHaveBeenCalledOnce()
      expect(router._refreshRoute).toHaveBeenCalledOnce()
      if (hmrStyle === 'vite') {
        hot.accept.mock.calls[0]![0]({ Route: replacement })
        expect(liveRoute.update).toHaveBeenCalledOnce()
      }
    })
  },
)
