import { describe, test, expect } from 'vitest'

import {
  // Location,
  matchPathname,
  // Route,
  // createMemoryHistory,
  resolvePath,
} from '../src'

import { createTimer, sleep } from './utils'

// function RouterInstance(opts?: { initialEntries?: string[] }) {
//   return new RouterInstance({
//     routes: [],
//     history: createMemoryHistory({
//       initialEntries: opts?.initialEntries ?? ['/'],
//     }),
//   })
// }

function createLocation(location: Partial<Location>): Location {
  return {
    pathname: '',
    href: '',
    search: {},
    searchStr: '',
    state: {},
    hash: '',
    ...location,
  }
}

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
//     expect(router.store.state.currentMatches[0].id).toBe('/')
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
//     expect(router.store.state.currentMatches[0].id).toBe('/a')
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
//     expect(router.store.state.currentMatches[1].id).toBe('/a/b')
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
//     expect(router.store.state.currentMatches[0].id).toBe('/')

//     promise = router.navigate({ to: 'a' })
//     expect(router.store.state.currentMatches[0].id).toBe('/')
//     expect(router.store.pendingMatches[0].id).toBe('a')

//     await promise
//     expect(router.store.state.currentMatches[0].id).toBe('a')
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
//     expect(router.store.state.currentLocation.href).toBe('/')

//     let promise = router.navigate({ to: 'a' })
//     expect(router.store.pendingLocation.href).toBe('/a')
//     await promise
//     expect(router.store.state.currentLocation.href).toBe('/a')

//     promise = router.navigate({ to: './b' })
//     expect(router.store.pendingLocation.href).toBe('/a/b')
//     await promise
//     expect(router.store.state.currentLocation.href).toBe('/a/b')

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
//         onLoad: () => sleep(10).then((d) => ({ a: true })),
//         children: [
//           {
//             path: 'b',
//             onLoad: () => sleep(10).then((d) => ({ b: true })),
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
//             onLoad: () => sleep(10).then((d) => ({ a: true })),
//           }
//         },
//         children: [
//           {
//             path: 'b',
//             import: async () => {
//               await sleep(10)
//               return {
//                 onLoad: () =>
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
//             onLoad: () => sleep(30).then((d) => ({ a: true })),
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
//                 onLoad: () =>
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
//         onLoad: () => sleep(20),
//         children: [
//           {
//             path: 'b',
//             pendingMs: 30,
//             onLoad: () => sleep(40),
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

describe('matchRoute', () => {
  describe('fuzzy', () => {
    ;(
      [
        [
          '/',
          {
            to: '/',
            fuzzy: true,
          },
          {},
        ],
        [
          '/a',
          {
            to: '/',
            fuzzy: true,
          },
          {},
        ],
        [
          '/a',
          {
            to: '/*',
            fuzzy: true,
          },
          { '*': 'a' },
        ],
        [
          '/a/b',
          {
            to: '/*',
            fuzzy: true,
          },
          { '*': 'a/b' },
        ],
        [
          '/a/b/c',
          {
            to: '/*',
            fuzzy: true,
          },
          { '*': 'a/b/c' },
        ],
        [
          '/a/b/c',
          {
            to: '/',
            fuzzy: true,
          },
          {},
        ],
        [
          '/a/b',
          {
            to: '/a/b/',
            fuzzy: true,
          },
          {},
        ],
      ] as const
    ).forEach(([a, b, eq]) => {
      test(`${a} == ${b.to}`, () => {
        expect(matchPathname('', a, b)).toEqual(eq)
      })
    })
  })

  describe('exact', () => {
    ;(
      [
        [
          '/a/b/c',
          {
            to: '/',
          },
          undefined,
        ],
        [
          '/a/b/c',
          {
            to: '/a/b',
          },
          undefined,
        ],
        [
          '/a/b/c',
          {
            to: '/a/b/c',
          },
          {},
        ],
      ] as const
    ).forEach(([a, b, eq]) => {
      test(`${a} == ${b.to}`, () => {
        expect(matchPathname('', a, b)).toEqual(eq)
      })
    })
  })

  describe('basepath', () => {
    ;(
      [
        [
          '/base',
          '/base',
          {
            to: '/',
          },
          {},
        ],
        [
          '/base',
          '/base/a',
          {
            to: '/a',
          },
          {},
        ],
        [
          '/base',
          '/base/a/b/c',
          {
            to: '/a/b/c',
          },
          {},
        ],
        [
          '/base',
          '/base/posts',
          {
            fuzzy: true,
            to: '/',
          },
          {},
        ],
        [
          '/base',
          '/base/a',
          {
            to: '/b',
          },
          undefined,
        ],
      ] as const
    ).forEach(([a, b, c, eq]) => {
      test(`${b} == ${a} + ${c.to}`, () => {
        expect(matchPathname(a, b, c)).toEqual(eq)
      })
    })
  })

  describe('params', () => {
    ;(
      [
        [
          '/a/b',
          {
            to: '/a/$b',
          },
          { b: 'b' },
        ],
        [
          '/a/b/c',
          {
            to: '/a/$b/$c',
          },
          { b: 'b', c: 'c' },
        ],
        [
          '/a/b/c',
          {
            to: '/$a/$b/$c',
          },
          { a: 'a', b: 'b', c: 'c' },
        ],
        [
          '/a/b/c',
          {
            to: '/$a/*',
          },
          { a: 'a', '*': 'b/c' },
        ],
        [
          '/a/b/c',
          {
            to: '/a/$b/c',
          },
          { b: 'b' },
        ],
      ] as const
    ).forEach(([a, b, eq]) => {
      test(`${a} == ${b.to}`, () => {
        expect(matchPathname('', a, b)).toEqual(eq)
      })
    })
  })
})

describe('resolvePath', () => {
  describe('basic resolution', () => {
    ;[
      ['/', '/', '/', '/'],
      ['/', '/', '/a', '/a'],
      ['/', '/', 'a/', '/a/'],
      ['/', '/', '/a/b', '/a/b'],
      ['/', 'a', 'b', '/a/b'],
      ['/a/b', 'c', '/a/b/c', '/a/b/c'],
    ].forEach(([base, a, b, eq]) => {
      test(`${a} to ${b} === ${eq}`, () => {
        expect(resolvePath(base, a, b)).toEqual(eq)
      })
    })
  })

  describe('relative', () => {
    ;[
      ['/a/b', '/', './c', '/a/b/c'],
      ['/', '/', './a/b', '/a/b'],
      ['/', '/a/b/c', './d', '/a/b/c/d'],
      ['/', '/a/b/c', '../d', '/a/b/d'],
      ['/', '/a/b/c', '../../d', '/a/d'],
      ['/', '/a/b/c', '../..', '/a'],
      ['/', '/a/b/c/', '../..', '/a'],
      ['/', '/a/b/c', '../../..', '/'],
      ['/', '/a/b/c/', '../../..', '/'],
    ].forEach(([base, a, b, eq]) => {
      test(`${a} to ${b} === ${eq}`, () => {
        expect(resolvePath(base, a, b)).toEqual(eq)
      })
    })
  })

  describe('trailing slash', () => {
    ;[
      ['/', '/a', './b/', '/a/b/'],
      ['/', '/', 'a/b/c/', '/a/b/c/'],
    ].forEach(([base, a, b, eq]) => {
      test(`${a} to ${b} === ${eq}`, () => {
        expect(resolvePath(base, a, b)).toEqual(eq)
      })
    })
  })
})
