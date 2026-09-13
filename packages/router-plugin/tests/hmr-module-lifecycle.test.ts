// @vitest-environment jsdom

import { transformFromAstSync } from '@babel/core'
import * as t from '@babel/types'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '../../history/src'
import {
  createRootRoute,
  createRoute as createChildRoute,
} from '../../react-router/src/route'
import { createRouter as createReactRouter } from '../../react-router/src/router'
import { createRouteHmrStatement } from '../src/core/hmr'
import type { AnyRoute } from '@tanstack/router-core'

vi.mock('@tanstack/router-core/isServer', async (importOriginal) => ({
  ...(await importOriginal()),
  isServer: undefined,
}))

function createRoute(root: boolean, value = 'initial') {
  const parent = createRootRoute({})
  return root
    ? createRootRoute({ loader: () => value })
    : createChildRoute({
        getParentRoute: () => parent,
        path: '/posts',
        loader: () => value,
      })
}

function createRouter(route: AnyRoute) {
  const root = route.isRoot ? route : route.options.getParentRoute!()
  if (root !== route) {
    root.addChildren([route])
  }
  const router = createReactRouter({
    routeTree: root,
    history: createMemoryHistory({
      initialEntries: [route.isRoot ? '/' : '/posts'],
    }),
    isServer: false,
  })
  return router
}

function createHot() {
  return {
    data: {} as Record<string, unknown>,
    accept: vi.fn(),
    dispose: vi.fn(),
  }
}

describe.each(['vite', 'webpack'] as const)(
  '%s HMR module lifecycle',
  (hmrStyle) => {
    function evaluate(route: AnyRoute, hot: ReturnType<typeof createHot>) {
      const statements = createRouteHmrStatement([], {
        hmrStyle,
        targetFramework: 'react',
        routeId: route.isRoot ? '/__root' : '/posts',
      })
      const code = transformFromAstSync(
        t.file(t.program(statements)),
        undefined,
        {
          babelrc: false,
          configFile: false,
        },
      )!.code!
      new Function(
        'window',
        'Route',
        'hotContext',
        code
          .replaceAll('import.meta.webpackHot', 'hotContext')
          .replaceAll('import.meta.hot', 'hotContext'),
      )(window, route, hot)
    }

    function dispose(hot: ReturnType<typeof createHot>) {
      if (hmrStyle === 'webpack') {
        const data = {}
        hot.dispose.mock.calls.at(-1)![0](data)
        hot.data = data
      }
    }

    it.each([false, true])(
      'does not patch a foreign route on first import (root: %s)',
      (root) => {
        const foreign = createRoute(root, 'foreign')
        const foreignLoader = foreign.options.loader
        const foreignRouter = createRouter(foreign)
        const incoming = createRoute(root, 'incoming')
        const hot = createHot()

        evaluate(incoming, hot)

        expect(foreign.options.loader).toBe(foreignLoader)
        expect(foreignRouter.routesById[foreign.id]).toBe(foreign)
        expect(incoming.options.loader).not.toBe(foreign.options.loader)
        expect(hot.accept).toHaveBeenCalled()
      },
    )

    it('can attach a router after a module was hot-replaced while unused', async () => {
      const foreign = createRoute(false, 'foreign')
      const foreignLoader = foreign.options.loader
      createRouter(foreign)
      const hot = createHot()
      evaluate(createRoute(false), hot)
      dispose(hot)
      const mounted = createRoute(false, 'mounted')
      evaluate(mounted, hot)
      expect(foreign.options.loader).toBe(foreignLoader)

      const owner = createRouter(mounted)
      await owner.load()
      expect(owner.state.matches.at(-1)?.loaderData).toBe('mounted')
      dispose(hot)
      const replacement = createRoute(false, 'updated')
      const loader = replacement.options.loader
      evaluate(replacement, hot)
      expect(mounted.options.loader).toBe(loader)
      await vi.waitFor(() => {
        expect(owner.state.matches.at(-1)?.loaderData).toBe('updated')
      })
    })

    it.each([false, true])(
      'updates only the owning router across repeated hot evaluations (root: %s)',
      async (root) => {
        const original = createRoute(root)
        const hot = createHot()
        // Route modules execute before their router is constructed.
        evaluate(original, hot)
        const owner = createRouter(original)
        await owner.load()
        expect(owner.state.matches.at(-1)?.loaderData).toBe('initial')
        const foreign = createRoute(root, 'foreign')
        const foreignLoader = foreign.options.loader
        const other = createRouter(foreign)
        await other.load()
        expect(window.__TSR_ROUTER__).toBe(other)

        for (const value of ['updated', 'updated again']) {
          const accept = hot.accept.mock.calls.at(-1)![0]
          dispose(hot)
          const replacement = createRoute(root, value)
          const loader = replacement.options.loader
          evaluate(replacement, hot)
          if (hmrStyle === 'vite') {
            accept({ Route: replacement })
          }
          expect(original.options.loader).toBe(loader)
          expect(replacement.id).toBe(original.id)
          expect(replacement.parentRoute).toBe(original.parentRoute)
          expect(owner.routesById[original.id]).toBe(original)
          expect(foreign.options.loader).toBe(foreignLoader)
          await vi.waitFor(() => {
            expect(owner.state.matches.at(-1)?.loaderData).toBe(value)
          })
          expect(other.state.matches.at(-1)?.loaderData).toBe('foreign')
        }
      },
    )
  },
)
