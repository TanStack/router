import {
  Location,
  matchRoute,
  resolvePath,
  RouterInstance,
  Route,
  createMemoryHistory,
} from '../src'

import { createTimer, sleep } from './utils'

function createRouterInstance(opts?: { initialEntries?: string[] }) {
  return new RouterInstance({
    history: createMemoryHistory({
      initialEntries: opts?.initialEntries ?? ['/'],
    }),
  })
}

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

describe('Router', () => {
  test('mounts to /', async () => {
    const router = createRouterInstance()

    const routes = [
      {
        path: '/',
      },
    ]

    router.update({
      routes,
    })

    const promise = router.mount()
    expect(router.state.pending?.matches[0].id).toBe('/')

    await promise
    expect(router.state.matches[0].id).toBe('/')
  })

  test('mounts to /a', async () => {
    const router = createRouterInstance({ initialEntries: ['/a'] })
    const routes: Route[] = [
      {
        path: '/',
      },
      {
        path: '/a',
      },
    ]

    router.update({
      routes,
    })

    let promise = router.mount()

    expect(router.state.pending?.matches[0].id).toBe('/a')
    await promise
    expect(router.state.matches[0].id).toBe('/a')
  })

  test('mounts to /a/b', async () => {
    const router = createRouterInstance({
      initialEntries: ['/a/b'],
    })

    const routes: Route[] = [
      {
        path: '/',
      },
      {
        path: '/a',
        children: [
          {
            path: '/b',
          },
        ],
      },
    ]

    router.update({
      routes,
    })

    let promise = router.mount()

    expect(router.state.pending?.matches[1].id).toBe('/a/b')
    await promise
    expect(router.state.matches[1].id).toBe('/a/b')
  })

  test('navigates to /a', async () => {
    const router = createRouterInstance()
    const routes: Route[] = [
      {
        path: '/',
      },
      {
        path: 'a',
      },
    ]

    router.update({
      routes,
    })

    let promise = router.mount()

    expect(router.state.pending?.matches[0].id).toBe('/')

    await promise
    expect(router.state.matches[0].id).toBe('/')

    promise = router.navigate({ to: 'a' })
    expect(router.state.matches[0].id).toBe('/')
    expect(router.state.pending?.matches[0].id).toBe('a')

    await promise
    expect(router.state.matches[0].id).toBe('a')
    expect(router.state.pending).toBe(undefined)
  })

  test('navigates to /a to /a/b', async () => {
    const router = createRouterInstance()
    const routes: Route[] = [
      {
        path: '/',
      },
      {
        path: 'a',
        children: [
          {
            path: 'b',
          },
        ],
      },
    ]

    router.update({
      routes,
    })

    router.mount()
    expect(router.state.location.href).toBe('/')

    let promise = router.navigate({ to: 'a' })
    expect(router.state.pending?.location.href).toBe('/a')
    await promise
    expect(router.state.location.href).toBe('/a')

    promise = router.navigate({ to: './b' })
    expect(router.state.pending?.location.href).toBe('/a/b')
    await promise
    expect(router.state.location.href).toBe('/a/b')

    expect(router.state.pending).toBe(undefined)
  })

  test('async navigates to /a/b', async () => {
    const router = createRouterInstance()
    const routes: Route[] = [
      {
        path: '/',
      },
      {
        path: 'a',
        loader: () => sleep(10).then((d) => ({ a: true })),
        children: [
          {
            path: 'b',
            loader: () => sleep(10).then((d) => ({ b: true })),
          },
        ],
      },
    ]

    const timer = createTimer()

    router.update({
      routes,
    })

    router.mount()

    timer.start()
    await router.navigate({ to: 'a/b' })
    expect(timer.getTime()).toBeLessThan(18)

    expect(router.state.loaderData).toEqual({
      a: true,
      b: true,
    })
  })

  test('async navigates with import + loader', async () => {
    const router = createRouterInstance()
    const routes: Route[] = [
      {
        path: '/',
      },
      {
        path: 'a',
        import: async () => {
          await sleep(10)
          return {
            loader: () => sleep(10).then((d) => ({ a: true })),
          }
        },
        children: [
          {
            path: 'b',
            import: async () => {
              await sleep(10)
              return {
                loader: () =>
                  sleep(10).then((d) => ({
                    b: true,
                  })),
              }
            },
          },
        ],
      },
    ]

    const timer = createTimer()

    router.update({
      routes,
    })

    router.mount()

    timer.start()
    await router.navigate({ to: 'a/b' })
    expect(timer.getTime()).toBeLessThan(28)

    expect(router.state.loaderData).toEqual({
      a: true,
      b: true,
    })
  })

  test('async navigates with import + elements + loader', async () => {
    const router = createRouterInstance()
    const routes: Route[] = [
      {
        path: '/',
      },
      {
        path: 'a',
        import: async () => {
          await sleep(10)
          return {
            element: async () => {
              await sleep(20)
              return 'element'
            },
            loader: () => sleep(30).then((d) => ({ a: true })),
          }
        },
        children: [
          {
            path: 'b',
            import: async () => {
              await sleep(10)
              return {
                element: async () => {
                  await sleep(20)
                  return 'element'
                },
                loader: () =>
                  sleep(30).then((d) => ({
                    b: true,
                  })),
              }
            },
          },
        ],
      },
    ]

    const timer = createTimer()

    router.update({
      routes,
    })

    router.mount()

    await router.navigate({ to: 'a/b' })
    expect(timer.getTime()).toBeLessThan(55)

    expect(router.state.loaderData).toEqual({
      a: true,
      b: true,
    })
  })

  test('async navigates with pending state', async () => {
    const router = createRouterInstance()
    const routes: Route[] = [
      {
        path: '/',
      },
      {
        path: 'a',
        pendingMs: 10,
        loader: () => sleep(20),
        children: [
          {
            path: 'b',
            pendingMs: 30,
            loader: () => sleep(40),
          },
        ],
      },
    ]

    router.update({
      routes,
    })

    router.mount()

    const timer = createTimer()
    await router.navigate({ to: 'a/b' })

    expect(timer.getTime()).toBeLessThan(46)
  })
})

describe('matchRoute', () => {
  describe('fuzzy', () => {
    ;[
      [
        {
          pathname: '/',
        },
        {
          to: '/',
          fuzzy: true,
        },
        {},
      ],
      [
        {
          pathname: '/a',
        },
        {
          to: '/',
          fuzzy: true,
        },
        {},
      ],
      [
        {
          pathname: '/a',
        },
        {
          to: '/*',
          fuzzy: true,
        },
        { '*': 'a' },
      ],
      [
        {
          pathname: '/a/b',
        },
        {
          to: '/*',
          fuzzy: true,
        },
        { '*': 'a/b' },
      ],
      [
        {
          pathname: '/a/b/c',
        },
        {
          to: '/*',
          fuzzy: true,
        },
        { '*': 'a/b/c' },
      ],
      [
        {
          pathname: '/a/b/c',
        },
        {
          to: '/',
          fuzzy: true,
        },
        {},
      ],
      [
        {
          pathname: '/a/b',
        },
        {
          to: '/a/b/',
          fuzzy: true,
        },
        {},
      ],
    ].forEach(([a, b, eq]) => {
      test(`${a.pathname} == ${b.to}`, () => {
        expect(matchRoute(createLocation(a), b)).toEqual(eq)
      })
    })
  })

  describe('exact', () => {
    ;(
      [
        [
          {
            pathname: '/a/b/c',
          },
          {
            to: '/',
          },
          undefined,
        ],
        [
          {
            pathname: '/a/b/c',
          },
          {
            to: '/a/b',
          },
          undefined,
        ],
        [
          {
            pathname: '/a/b/c',
          },
          {
            to: '/a/b/c',
          },
          {},
        ],
      ] as const
    ).forEach(([a, b, eq]) => {
      test(`${a.pathname} == ${b.to}`, () => {
        expect(matchRoute(createLocation(a), b)).toEqual(eq)
      })
    })
  })

  describe('params', () => {
    ;[
      [
        {
          pathname: '/a/b',
        },
        {
          to: '/a/:b',
        },
        { b: 'b' },
      ],
      [
        {
          pathname: '/a/b/c',
        },
        {
          to: '/a/:b/:c',
        },
        { b: 'b', c: 'c' },
      ],
      [
        {
          pathname: '/a/b/c',
        },
        {
          to: '/:a/:b/:c',
        },
        { a: 'a', b: 'b', c: 'c' },
      ],
      [
        {
          pathname: '/a/b/c',
        },
        {
          to: '/:a/*',
        },
        { a: 'a', '*': 'b/c' },
      ],
      [
        {
          pathname: '/a/b/c',
        },
        {
          to: '/a/:b/c',
        },
        { b: 'b' },
      ],
    ].forEach(([a, b, eq]) => {
      test(`${a.pathname} == ${b.to}`, () => {
        expect(matchRoute(createLocation(a), b)).toEqual(eq)
      })
    })
  })
})

describe('resolvePath', () => {
  describe('basic resolution', () => {
    ;[
      ['/', '/', '/', '/'],
      ['/', '/', '/a', '/a'],
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
