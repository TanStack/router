import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, RouterCore } from '../src'

describe('buildLocation', () => {
  describe('#6490 - skipRouteOnParseError respects params.stringify', () => {
    test('skipRouteOnParseError is true', () => {
      const rootRoute = new BaseRootRoute({})
      const langRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/$lang',
        skipRouteOnParseError: {
          params: true,
        },
        params: {
          parse: (rawParams) => {
            if (rawParams.lang === 'en') {
              return { lang: 'en-US' }
            }

            if (rawParams.lang === 'pl') {
              return { lang: 'pl-PL' }
            }

            throw new Error('Invalid language')
          },
          stringify: (params) => {
            if (params.lang === 'en-US') {
              return { lang: 'en' }
            }

            if (params.lang === 'pl-PL') {
              return { lang: 'pl' }
            }

            return params
          },
        },
      })
      const routeTree = rootRoute.addChildren([langRoute])

      const router = new RouterCore({
        routeTree,
        history: createMemoryHistory(),
      })

      const location = router.buildLocation({
        to: '/$lang',
        params: { lang: 'en-US' },
      })

      expect(location.pathname).toBe('/en')
    })
    test('skipRouteOnParseError is false', () => {
      const rootRoute = new BaseRootRoute({})
      const langRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/$lang',
        skipRouteOnParseError: {
          params: false,
        },
        params: {
          parse: (rawParams) => {
            if (rawParams.lang === 'en') {
              return { lang: 'en-US' }
            }

            if (rawParams.lang === 'pl') {
              return { lang: 'pl-PL' }
            }

            throw new Error('Invalid language')
          },
          stringify: (params) => {
            if (params.lang === 'en-US') {
              return { lang: 'en' }
            }

            if (params.lang === 'pl-PL') {
              return { lang: 'pl' }
            }

            return params
          },
        },
      })
      const routeTree = rootRoute.addChildren([langRoute])

      const router = new RouterCore({
        routeTree,
        history: createMemoryHistory(),
      })

      const location = router.buildLocation({
        to: '/$lang',
        params: { lang: 'en-US' },
      })

      expect(location.pathname).toBe('/en')
    })
  })
})
