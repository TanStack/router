import { afterEach, describe, expect, it } from 'vitest'
import { prerenderRoutesPlugin } from '../src/start-router-plugin/generator-plugins/prerender-routes-plugin'

describe('prerenderRoutesPlugin', () => {
  afterEach(() => {
    globalThis.TSS_PRERENDABLE_PATHS = undefined
  })

  it('stores static prerender routes on globalThis', () => {
    const plugin = prerenderRoutesPlugin()

    plugin.onRouteTreeChanged?.({
      routeTree: [],
      rootRouteNode: { fullPath: '/src/routes/__root.tsx' } as any,
      routeNodes: [
        {
          routePath: '/about',
          path: 'about',
          fullPath: '/src/routes/about.tsx',
          createFileRouteProps: new Set(['component', 'sitemap']),
        },
        {
          routePath: '/posts/$slug',
          path: '$slug',
          fullPath: '/src/routes/posts.$slug.tsx',
          createFileRouteProps: new Set(['component', 'prerenderParams']),
        },
      ],
    } as any)

    expect(globalThis.TSS_PRERENDABLE_PATHS).toContainEqual({ path: '/about' })
  })

  it('does not store API, layout, or dynamic routes as static paths', () => {
    const plugin = prerenderRoutesPlugin()

    plugin.onRouteTreeChanged?.({
      routeTree: [],
      rootRouteNode: { fullPath: '/src/routes/__root.tsx' } as any,
      routeNodes: [
        {
          routePath: '/api/users',
          path: 'api/users',
          fullPath: '/src/routes/api.users.ts',
          createFileRouteProps: new Set(),
        },
        {
          routePath: '/_layout',
          path: '_layout',
          fullPath: '/src/routes/_layout.tsx',
          isNonPath: true,
          createFileRouteProps: new Set(['component']),
        },
        {
          routePath: '/posts/$slug',
          path: '$slug',
          fullPath: '/src/routes/posts.$slug.tsx',
          createFileRouteProps: new Set(['component']),
        },
      ],
    } as any)

    expect(globalThis.TSS_PRERENDABLE_PATHS).toEqual([{ path: '/' }])
  })

})
