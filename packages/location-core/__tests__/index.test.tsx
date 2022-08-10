import {
  Location,
  matchRoute,
  resolvePath,
  RouterInstance,
  LocationManager,
  Route,
  createMemoryHistory,
} from '../src'

import { sleep } from './utils'

function createLocationManager(opts?: { initialEntries?: string[] }) {
  return new LocationManager({
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

describe('LocationManager', () => {
  test('init', () => {
    const locationManager = createLocationManager()
  })
})

describe('Router', () => {
  test('mounts to /', async () => {
    const locationManager = createLocationManager()
    const routes = [
      {
        path: '/',
      },
    ]

    const router = new RouterInstance({
      locationManager,
    })

    router.update({
      routes,
    })

    router.mount()

    expect(router.pending?.matches[0].id).toBe('/')
    await router.pending?.matchLoader?.matchPromise
    expect(router.state.matches[0].id).toBe('/')
  })

  test('mounts to /a', async () => {
    const locationManager = createLocationManager({ initialEntries: ['/a'] })
    const routes: Route[] = [
      {
        path: '/',
      },
      {
        path: '/a',
      },
    ]

    const router = new RouterInstance({
      locationManager,
    })

    router.update({
      routes,
    })

    router.mount()

    expect(router.pending?.matches[0].id).toBe('/a')
    await router.pending?.matchLoader?.matchPromise
    expect(router.state.matches[0].id).toBe('/a')
  })

  test('mounts to /a/b', async () => {
    const locationManager = new LocationManager({
      history: createMemoryHistory({
        initialEntries: ['/a/b'],
      }),
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

    const router = new RouterInstance({
      locationManager,
    })

    router.update({
      routes,
    })

    router.mount()

    expect(router.pending?.matches[1].id).toBe('/a/b')
    await router.pending?.matchLoader?.matchPromise
    expect(router.state.matches[1].id).toBe('/a/b')
  })

  test('navigates to /a', async () => {
    const locationManager = createLocationManager()
    const routes: Route[] = [
      {
        path: '/',
      },
      {
        path: 'a',
      },
    ]

    const router = new RouterInstance({
      locationManager,
    })

    router.update({
      routes,
    })

    router.mount()

    expect(router.pending?.matches[0].id).toBe('/')
    await router.pending?.matchLoader?.matchPromise
    expect(router.state.matches[0].id).toBe('/')

    router.navigate({ to: 'a' })

    expect(router.state?.matches[0].id).toBe('/')
    expect(router.pending?.matches[0].id).toBe('a')
    await router.pending?.matchLoader?.matchPromise
    expect(router.state.matches[0].id).toBe('a')
    expect(router.pending).toBe(undefined)
  })

  test('navigates to /a to /a/b', async () => {
    const locationManager = createLocationManager()
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

    const router = new RouterInstance({
      locationManager,
    })

    router.update({
      routes,
    })

    router.mount()
    expect(router.pending?.location.href).toBe('/')

    router.navigate({ to: 'a' })
    expect(router.pending?.location.href).toBe('/a')

    router.navigate({ to: './b' })
    expect(router.pending?.location.href).toBe('/a/b')

    await router.pending?.matchLoader?.matchPromise

    expect(router.state?.location.href).toBe('/a/b')
    expect(router.pending).toBe(undefined)
  })

  test('async navigates to /a/b', async () => {
    const locationManager = createLocationManager()
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

    const router = new RouterInstance({
      locationManager,
    })

    router.update({
      routes,
    })

    router.mount()
    expect(router.pending?.location.href).toBe('/')

    const startedAt = Date.now()
    router.navigate({ to: 'a/b' })

    await router.pending?.matchLoader?.matchPromise
    const endedAt = Date.now()
    expect(endedAt - startedAt).toBeLessThan(15)
    expect(router.state?.matches[1].data).toEqual({ a: true, b: true })
  })

  test('async navigates with import + loader', async () => {
    const locationManager = createLocationManager()
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

    const router = new RouterInstance({
      locationManager,
    })

    router.update({
      routes,
    })

    router.mount()
    expect(router.pending?.location.href).toBe('/')

    const startedAt = Date.now()
    router.navigate({ to: 'a/b' })

    await router.pending?.matchLoader?.matchPromise
    const endedAt = Date.now()
    expect(endedAt - startedAt).toBeLessThan(25)
    expect(router.state?.matches[1].data).toEqual({ a: true, b: true })
  })

  test('async navigates with import + elements + loader', async () => {
    const locationManager = createLocationManager()
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

    const router = new RouterInstance({
      locationManager,
    })

    router.update({
      routes,
    })

    router.mount()
    expect(router.pending?.location.href).toBe('/')

    const startedAt = Date.now()
    router.navigate({ to: 'a/b' })

    await router.pending?.matchLoader?.matchPromise
    const endedAt = Date.now()
    expect(endedAt - startedAt).toBeLessThan(45)
    expect(router.state?.matches[1].data).toEqual({ a: true, b: true })
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
