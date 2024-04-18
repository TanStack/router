import { describe, expect, test } from 'vitest'
import { render } from '@testing-library/react'

import React from 'react'

import {
  Outlet,
  RouterProvider,
  cleanPath,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  // Location,
  matchPathname,
  // ParsedLocation,
  parsePathname,
  redirect,
  // Route,
  // createMemoryHistory,
  resolvePath,
  // Segment,
  trimPath,
  trimPathLeft,
} from '../src'

// import { createTimer, sleep } from './utils'

// function RouterInstance(opts?: { initialEntries?: string[] }) {
//   return new RouterInstance({
//     routes: [],
//     history: createMemoryHistory({
//       initialEntries: opts?.initialEntries ?? ['/'],
//     }),
//   })
// }

// function createLocation(location: Partial<Location>): ParsedLocation {
//   return {
//     pathname: '',
//     href: '',
//     search: {},
//     searchStr: '',
//     state: {},
//     hash: '',
//     ...location,
//   }
// }

// describe('Router', () => {
//   test('mounts to /', async () => {
//     const router = RouterInstance()

//     const routes = [
//       {
//         path: '/',
//       },
//     ]

//     router.update({
//       routes,
//     })

//     const promise = router.mount()
//     expect(router.store.pendingMatches[0].id).toBe('/')

//     await promise
//     expect(router.state.matches[0].id).toBe('/')
//   })

//   test('mounts to /a', async () => {
//     const router = RouterInstance({ initialEntries: ['/a'] })
//     const routes: Route[] = [
//       {
//         path: '/',
//       },
//       {
//         path: '/a',
//       },
//     ]

//     router.update({
//       routes,
//     })

//     let promise = router.mount()

//     expect(router.store.pendingMatches[0].id).toBe('/a')
//     await promise
//     expect(router.state.matches[0].id).toBe('/a')
//   })

//   test('mounts to /a/b', async () => {
//     const router = RouterInstance({
//       initialEntries: ['/a/b'],
//     })

//     const routes: Route[] = [
//       {
//         path: '/',
//       },
//       {
//         path: '/a',
//         children: [
//           {
//             path: '/b',
//           },
//         ],
//       },
//     ]

//     router.update({
//       routes,
//     })

//     let promise = router.mount()

//     expect(router.store.pendingMatches[1].id).toBe('/a/b')
//     await promise
//     expect(router.state.matches[1].id).toBe('/a/b')
//   })

//   test('navigates to /a', async () => {
//     const router = RouterInstance()
//     const routes: Route[] = [
//       {
//         path: '/',
//       },
//       {
//         path: 'a',
//       },
//     ]

//     router.update({
//       routes,
//     })

//     let promise = router.mount()

//     expect(router.store.pendingMatches[0].id).toBe('/')

//     await promise
//     expect(router.state.matches[0].id).toBe('/')

//     promise = router.navigate({ to: 'a' })
//     expect(router.state.matches[0].id).toBe('/')
//     expect(router.store.pendingMatches[0].id).toBe('a')

//     await promise
//     expect(router.state.matches[0].id).toBe('a')
//     expect(router.store.pending).toBe(undefined)
//   })

//   test('navigates to /a to /a/b', async () => {
//     const router = RouterInstance()
//     const routes: Route[] = [
//       {
//         path: '/',
//       },
//       {
//         path: 'a',
//         children: [
//           {
//             path: 'b',
//           },
//         ],
//       },
//     ]

//     router.update({
//       routes,
//     })

//     await router.mount()
//     expect(router.state.location.href).toBe('/')

//     let promise = router.navigate({ to: 'a' })
//     expect(router.store.pendingLocation.href).toBe('/a')
//     await promise
//     expect(router.state.location.href).toBe('/a')

//     promise = router.navigate({ to: './b' })
//     expect(router.store.pendingLocation.href).toBe('/a/b')
//     await promise
//     expect(router.state.location.href).toBe('/a/b')

//     expect(router.store.pending).toBe(undefined)
//   })

//   test('async navigates to /a/b', async () => {
//     const router = RouterInstance()
//     const routes: Route[] = [
//       {
//         path: '/',
//       },
//       {
//         path: 'a',
//         loader: () => sleep(10).then((d) => ({ a: true })),
//         children: [
//           {
//             path: 'b',
//             loader: () => sleep(10).then((d) => ({ b: true })),
//           },
//         ],
//       },
//     ]

//     const timer = createTimer()

//     router.update({
//       routes,
//     })

//     router.mount()

//     timer.start()
//     await router.navigate({ to: 'a/b' })
//     expect(router.store.loaderData).toEqual({
//       a: true,
//       b: true,
//     })
//     expect(timer.getTime()).toBeLessThan(30)
//   })

//   test('async navigates with import + loader', async () => {
//     const router = RouterInstance()
//     const routes: Route[] = [
//       {
//         path: '/',
//       },
//       {
//         path: 'a',
//         import: async () => {
//           await sleep(10)
//           return {
//             loader: () => sleep(10).then((d) => ({ a: true })),
//           }
//         },
//         children: [
//           {
//             path: 'b',
//             import: async () => {
//               await sleep(10)
//               return {
//                 loader: () =>
//                   sleep(10).then((d) => ({
//                     b: true,
//                   })),
//               }
//             },
//           },
//         ],
//       },
//     ]

//     const timer = createTimer()

//     router.update({
//       routes,
//     })

//     router.mount()

//     timer.start()
//     await router.navigate({ to: 'a/b' })
//     expect(router.store.loaderData).toEqual({
//       a: true,
//       b: true,
//     })
//     expect(timer.getTime()).toBeLessThan(28)
//   })

//   test('async navigates with import + elements + loader', async () => {
//     const router = RouterInstance()
//     const routes: Route[] = [
//       {
//         path: '/',
//       },
//       {
//         path: 'a',
//         import: async () => {
//           await sleep(10)
//           return {
//             element: async () => {
//               await sleep(20)
//               return 'element'
//             },
//             loader: () => sleep(30).then((d) => ({ a: true })),
//           }
//         },
//         children: [
//           {
//             path: 'b',
//             import: async () => {
//               await sleep(10)
//               return {
//                 element: async () => {
//                   await sleep(20)
//                   return 'element'
//                 },
//                 loader: () =>
//                   sleep(30).then((d) => ({
//                     b: true,
//                   })),
//               }
//             },
//           },
//         ],
//       },
//     ]

//     const timer = createTimer()

//     router.update({
//       routes,
//     })

//     router.mount()

//     await router.navigate({ to: 'a/b' })
//     expect(router.store.loaderData).toEqual({
//       a: true,
//       b: true,
//     })
//     expect(timer.getTime()).toBeLessThan(55)
//   })

//   test('async navigates with pending state', async () => {
//     const router = RouterInstance()
//     const routes: Route[] = [
//       {
//         path: '/',
//       },
//       {
//         path: 'a',
//         pendingMs: 10,
//         loader: () => sleep(20),
//         children: [
//           {
//             path: 'b',
//             pendingMs: 30,
//             loader: () => sleep(40),
//           },
//         ],
//       },
//     ]

//     router.update({
//       routes,
//     })

//     await router.mount()

//     const timer = createTimer()
//     await router.navigate({ to: 'a/b' })
//     expect(timer.getTime()).toBeLessThan(46)
//   })
// })

// describe('matchRoute', () => {
//   describe('fuzzy', () => {
//     ;(
//       [
//         [
//           '/',
//           {
//             to: '/',
//             fuzzy: true,
//           },
//           {},
//         ],
//         [
//           '/a',
//           {
//             to: '/',
//             fuzzy: true,
//           },
//           {},
//         ],
//         [
//           '/a',
//           {
//             to: '/$',
//             fuzzy: true,
//           },
//           { '*': 'a' },
//         ],
//         [
//           '/a/b',
//           {
//             to: '/$',
//             fuzzy: true,
//           },
//           { '*': 'a/b' },
//         ],
//         [
//           '/a/b/c',
//           {
//             to: '/$',
//             fuzzy: true,
//           },
//           { '*': 'a/b/c' },
//         ],
//         [
//           '/a/b/c',
//           {
//             to: '/',
//             fuzzy: true,
//           },
//           {},
//         ],
//         [
//           '/a/b',
//           {
//             to: '/a/b/',
//             fuzzy: true,
//           },
//           {},
//         ],
//       ] as const
//     ).forEach(([a, b, eq]) => {
//       test(`${a} == ${b.to}`, () => {
//         expect(matchPathname('', a, b)).toEqual(eq)
//       })
//     })
//   })

//   describe('exact', () => {
//     ;(
//       [
//         [
//           '/a/b/c',
//           {
//             to: '/',
//           },
//           undefined,
//         ],
//         [
//           '/a/b/c',
//           {
//             to: '/a/b',
//           },
//           undefined,
//         ],
//         [
//           '/a/b/c',
//           {
//             to: '/a/b/c',
//           },
//           {},
//         ],
//       ] as const
//     ).forEach(([a, b, eq]) => {
//       test(`${a} == ${b.to}`, () => {
//         expect(matchPathname('', a, b)).toEqual(eq)
//       })
//     })
//   })

//   describe('basepath', () => {
//     ;(
//       [
//         [
//           '/base',
//           '/base',
//           {
//             to: '/',
//           },
//           {},
//         ],
//         [
//           '/base',
//           '/base/a',
//           {
//             to: '/a',
//           },
//           {},
//         ],
//         [
//           '/base',
//           '/base/a/b/c',
//           {
//             to: '/a/b/c',
//           },
//           {},
//         ],
//         [
//           '/base',
//           '/base/posts',
//           {
//             fuzzy: true,
//             to: '/',
//           },
//           {},
//         ],
//         [
//           '/base',
//           '/base/a',
//           {
//             to: '/b',
//           },
//           undefined,
//         ],
//       ] as const
//     ).forEach(([a, b, c, eq]) => {
//       test(`${b} == ${a} + ${c.to}`, () => {
//         expect(matchPathname(a, b, c)).toEqual(eq)
//       })
//     })
//   })

//   describe('params', () => {
//     ;(
//       [
//         [
//           '/a/b',
//           {
//             to: '/a/$b',
//           },
//           { b: 'b' },
//         ],
//         [
//           '/a/b/c',
//           {
//             to: '/a/$b/$c',
//           },
//           { b: 'b', c: 'c' },
//         ],
//         [
//           '/a/b/c',
//           {
//             to: '/$a/$b/$c',
//           },
//           { a: 'a', b: 'b', c: 'c' },
//         ],
//         [
//           '/a/b/c',
//           {
//             to: '/$a/$',
//           },
//           { a: 'a', '*': 'b/c' },
//         ],
//         [
//           '/a/b/c',
//           {
//             to: '/a/$b/c',
//           },
//           { b: 'b' },
//         ],
//       ] as const
//     ).forEach(([a, b, eq]) => {
//       test(`${a} == ${b.to}`, () => {
//         expect(matchPathname('', a, b)).toEqual(eq)
//       })
//     })
//   })
// })

describe('ssr redirects', async () => {
  test('via throw in beforeLoad', async () => {
    const rootRoute = createRootRoute()

    const indexRoute = createRoute({
      path: '/',
      getParentRoute: () => rootRoute,
      beforeLoad: () => {
        throw redirect({
          to: '/about',
        })
      },
    })

    const aboutRoute = createRoute({
      path: '/about',
      getParentRoute: () => rootRoute,
      component: () => {
        return 'About'
      },
    })

    const router = createRouter({
      history: createMemoryHistory({
        initialEntries: ['/'],
      }),
      routeTree: rootRoute.addChildren([indexRoute, aboutRoute]),
    })

    // Mock server mode
    router.isServer = true

    await router.load()

    expect(router.state.redirect).toEqual({
      to: '/about',
      headers: {},
      href: '/about',
      isRedirect: true,
      routeId: '/',
      routerCode: 'BEFORE_LOAD',
      statusCode: 301,
    })
  })

  test('via throw in loader', async () => {
    const rootRoute = createRootRoute()

    const indexRoute = createRoute({
      path: '/',
      getParentRoute: () => rootRoute,
      loader: () => {
        throw redirect({
          to: '/about',
        })
      },
    })

    const aboutRoute = createRoute({
      path: '/about',
      getParentRoute: () => rootRoute,
      component: () => {
        return 'About'
      },
    })

    const router = createRouter({
      history: createMemoryHistory({
        initialEntries: ['/'],
      }),
      routeTree: rootRoute.addChildren([indexRoute, aboutRoute]),
    })

    // Mock server mode
    router.isServer = true

    await router.load()

    expect(router.state.redirect).toEqual({
      to: '/about',
      headers: {},
      href: '/about',
      isRedirect: true,
      routeId: '/',
      statusCode: 301,
    })
  })
})

describe('resolvePath', () => {
  ;(
    [
      ['/', '/', '/', '/'],
      ['/', '/', '/a', '/a'],
      ['/', '/', 'a/', '/a'],
      ['/', '/', '/a/b', '/a/b'],
      ['/', 'a', 'b', '/a/b'],
      ['/a/b', 'c', '/a/b/c', '/a/b/c'],
      ['/a/b', '/', 'c', '/a/b/c'],
      ['/a/b', '/', './c', '/a/b/c'],
      ['/', '/', 'a/b', '/a/b'],
      ['/', '/', './a/b', '/a/b'],
      ['/', '/a/b/c', 'd', '/a/b/c/d'],
      ['/', '/a/b/c', './d', '/a/b/c/d'],
      ['/', '/a/b/c', './../d', '/a/b/d'],
      ['/', '/a/b/c/d', './../d', '/a/b/c/d'],
      ['/', '/a/b/c', '../d', '/a/b/d'],
      ['/', '/a/b/c', '../../d', '/a/d'],
      ['/', '/a/b/c', '..', '/a/b'],
      ['/', '/a/b/c', '../..', '/a'],
      ['/', '/a/b/c', '../../..', '/'],
      ['/', '/a/b/c/', '../../..', '/'],
    ] as const
  ).forEach(([base, a, b, eq]) => {
    test(`Base: ${base} - ${a} to ${b} === ${eq}`, () => {
      expect(resolvePath({ basepath: base, base: a, to: b })).toEqual(eq)
    })
    test(`Base: ${base} - ${a}/ to ${b} === ${eq} (trailing slash)`, () => {
      expect(resolvePath({ basepath: base, base: a + '/', to: b })).toEqual(eq)
    })
    test(`Base: ${base} - ${a}/ to ${b}/ === ${eq} (trailing slash + trailing slash)`, () => {
      expect(
        resolvePath({ basepath: base, base: a + '/', to: b + '/' }),
      ).toEqual(eq)
    })
  })
  describe('trailingSlash', () => {
    describe(`'always'`, () => {
      test('keeps trailing slash', () => {
        expect(
          resolvePath({
            basepath: '/',
            base: '/a/b/c',
            to: 'd/',
            trailingSlash: 'always',
          }),
        ).toBe('/a/b/c/d/')
      })
      test('adds trailing slash', () => {
        expect(
          resolvePath({
            basepath: '/',
            base: '/a/b/c',
            to: 'd',
            trailingSlash: 'always',
          }),
        ).toBe('/a/b/c/d/')
      })
    })
    describe(`'never'`, () => {
      test('removes trailing slash', () => {
        expect(
          resolvePath({
            basepath: '/',
            base: '/a/b/c',
            to: 'd/',
            trailingSlash: 'never',
          }),
        ).toBe('/a/b/c/d')
      })
      test('does not add trailing slash', () => {
        expect(
          resolvePath({
            basepath: '/',
            base: '/a/b/c',
            to: 'd',
            trailingSlash: 'never',
          }),
        ).toBe('/a/b/c/d')
      })
    })
    describe(`'preserve'`, () => {
      test('keeps trailing slash', () => {
        expect(
          resolvePath({
            basepath: '/',
            base: '/a/b/c',
            to: 'd/',
            trailingSlash: 'preserve',
          }),
        ).toBe('/a/b/c/d/')
      })
      test('does not add trailing slash', () => {
        expect(
          resolvePath({
            basepath: '/',
            base: '/a/b/c',
            to: 'd',
            trailingSlash: 'preserve',
          }),
        ).toBe('/a/b/c/d')
      })
    })
  })
})
