import { expect, test } from 'vitest'
import { getLinkLocationStore } from '../src/link-location'
import type { ParsedLocation } from '../src/location'
import type { AnyRouter } from '../src/router'

function fixture(pathname = '/a') {
  const listeners = new Set<() => void>()
  let location = { pathname, search: {}, hash: '', state: {} } as ParsedLocation
  let hrefSource = ''
  const createHref = (href: string) => href
  const history = {
    createHref,
    _hrefSource: [createHref, () => hrefSource] as const,
  }
  const router = {
    isServer: false,
    basepath: '/',
    staticLocations: new WeakMap<object, ParsedLocation>(),
    history,
    _tx: undefined as AnyRouter['_tx'],
    stores: {
      status: { get: () => (router._tx ? 'pending' : 'idle') },
      location: {
        get: () => location,
        subscribe: (notify: () => void) => {
          listeners.add(notify)
          return { unsubscribe: () => listeners.delete(notify) }
        },
      },
    },
  }
  function publish(path = location.pathname) {
    location = { ...location, pathname: path }
    if (router._tx) {
      router._tx[2] = location
    }
    for (const notify of [...listeners]) {
      notify()
    }
  }
  function subscribe(path: string, notify: () => void, owner?: string, fixed = true) {
    const options = {}
    if (fixed) {
      router.staticLocations.set(options, { ...location, pathname: path })
    }
    return getLinkLocationStore(router as unknown as AnyRouter, options, owner)
      .subscribe(notify)
  }
  function transaction(owners: Array<string>) {
    let resolve!: () => void
    let reject!: (error: unknown) => void
    const done = new Promise<void>((yes, no) => {
      resolve = yes
      reject = no
    })
    const tx = [
      new AbortController(),
      0,
      location,
      owners.map((routeId) => ({ routeId })),
      0,
      done,
    ] as unknown as NonNullable<AnyRouter['_tx']>
    router._tx = tx
    return { tx, resolve, reject }
  }
  return {
    router,
    listeners,
    publish,
    subscribe,
    transaction,
    changeHrefSource: (value: string) => { hrefSource = value },
  }
}

test('fixed destinations share one subscription and select only old/new path candidates', () => {
  const f = fixture('/items/1')
  const calls = new Array<number>(1000).fill(0)
  const stop = calls.map((_, index) =>
    f.subscribe(`/items/${index}`, () => { calls[index]!++ }),
  )
  expect(f.listeners.size).toBe(1)
  f.publish('/items/2')
  expect(calls.reduce((sum, n) => sum + n, 0)).toBe(2)
  expect(calls[1]).toBe(1)
  expect(calls[2]).toBe(1)
  stop.forEach((unsubscribe) => unsubscribe())
  expect(f.listeners.size).toBe(0)
})

test('fuzzy prefixes respect segment boundaries and do not invent a root match', () => {
  const f = fixture('/items/1')
  let prefix = 0
  let partial = 0
  let root = 0
  const stop = [
    f.subscribe('/items', () => { prefix++ }),
    f.subscribe('/item', () => { partial++ }),
    f.subscribe('/', () => { root++ }),
  ]
  f.publish('/items/2')
  expect([prefix, partial, root]).toEqual([1, 0, 0])
  f.publish('/')
  expect([prefix, partial, root]).toEqual([2, 0, 1])
  stop.forEach((unsubscribe) => unsubscribe())
})

test('same-path search/hash publications reach candidates but not unrelated fixed links', () => {
  const f = fixture('/a')
  let active = 0
  let inactive = 0
  const stop = [
    f.subscribe('/a', () => { active++ }),
    f.subscribe('/b', () => { inactive++ }),
  ]
  f.publish()
  expect([active, inactive]).toEqual([1, 0])
  stop.forEach((unsubscribe) => unsubscribe())
})

test('source-dependent destinations keep ordinary live delivery', () => {
  const f = fixture('/a')
  let count = 0
  const stop = f.subscribe('/b', () => { count++ }, 'leaving', false)
  const tx = f.transaction(['root'])
  f.publish('/c')
  expect(count).toBe(1)
  stop()
  tx.resolve()
})

test('unknown or replaced history formatters conservatively broadcast', () => {
  const f = fixture('/a')
  let count = 0
  const stop = f.subscribe('/b', () => { count++ })
  f.router.history.createHref = (href) => `#${href}`
  f.publish('/a')
  expect(count).toBe(1)
  stop()
})

test('a changed built-in formatter source broadcasts even for an inactive path', () => {
  const f = fixture('/a')
  let count = 0
  const stop = f.subscribe('/b', () => { count++ })
  f.changeHrefSource('/new-document')
  f.publish('/a')
  expect(count).toBe(1)
  f.publish('/a')
  expect(count).toBe(1)
  stop()
})

test('invalidating the builder cache makes old indexes permanently conservative', () => {
  const f = fixture('/a')
  let count = 0
  const stop = f.subscribe('/b', () => { count++ })
  f.router.staticLocations = new WeakMap()
  f.publish('/a')
  f.publish('/a')
  expect(count).toBe(2)
  stop()
})

test.each(['resolve', 'reject'] as const)('departing listeners catch up on %s without another publication', async (outcome) => {
  const f = fixture('/a')
  let leaving = 0
  let retained = 0
  const stop = [
    f.subscribe('/a', () => { leaving++ }, 'a'),
    f.subscribe('/b', () => { retained++ }, 'root'),
  ]
  const tx = f.transaction(['root', 'b'])
  f.publish('/b')
  expect([leaving, retained]).toEqual([0, 1])
  if (outcome === 'resolve') {
    tx.resolve()
  } else {
    tx.reject(new Error('load rejected'))
  }
  await Promise.resolve()
  expect([leaving, retained]).toEqual([1, 1])
  stop.forEach((unsubscribe) => unsubscribe())
})

test('superseding navigation repairs retained owners and ignores obsolete completion', async () => {
  const f = fixture('/a')
  let count = 0
  const stop = f.subscribe('/a', () => { count++ }, 'a')
  const first = f.transaction(['root', 'b'])
  f.publish('/b')
  const second = f.transaction(['root', 'a'])
  f.publish('/a')
  expect(count).toBe(1)
  first.resolve()
  await Promise.resolve()
  expect(count).toBe(1)
  second.resolve()
  stop()
})

test('unsubscribed departing listeners do no settlement work', async () => {
  const f = fixture('/a')
  let count = 0
  const stop = f.subscribe('/a', () => { count++ }, 'a')
  const tx = f.transaction(['root', 'b'])
  f.publish('/b')
  stop()
  tx.resolve()
  await Promise.resolve()
  expect(count).toBe(0)
  expect(f.listeners.size).toBe(0)
})

test('reentrant publication still deactivates old-path subscribers omitted by its successor', () => {
  const f = fixture('/a')
  const seen: Array<string> = []
  let armed = true
  const stop = [
    f.subscribe('/a', () => {
      if (armed) {
        armed = false
        f.publish('/c')
      }
    }),
    f.subscribe('/a', () => { seen.push(f.router.stores.location.get().pathname) }),
  ]
  f.publish('/b')
  expect(seen).toEqual(['/c'])
  stop.forEach((unsubscribe) => unsubscribe())
})

test('a subscriber removed by an earlier notification is not called', () => {
  const f = fixture('/a')
  let count = 0
  let remove!: () => void
  const first = f.subscribe('/a', () => remove())
  remove = f.subscribe('/a', () => { count++ })
  f.publish('/b')
  expect(count).toBe(0)
  first()
})

test('speculative source creation does not register or retarget committed listeners', () => {
  const f = fixture('/a')
  let count = 0
  const stop = f.subscribe('/a', () => { count++ })
  const options = {}
  f.router.staticLocations.set(options, { pathname: '/b' } as ParsedLocation)
  const speculative = getLinkLocationStore(f.router as unknown as AnyRouter, options, 'root')
  expect(speculative.get()).toBe(f.router.stores.location.get())
  f.publish('/b')
  expect(count).toBe(1)
  expect(f.listeners.size).toBe(1)
  stop()
})
