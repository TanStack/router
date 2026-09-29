import assert from 'node:assert/strict'
import { test } from 'vitest'
import { createRouterStores } from '../src/stores'
import { getLinkLocationStore } from '../src/link-location'
import type { StoreConfig } from '../src/stores'
import type { AnyRouter } from '../src/router'
import type { ParsedLocation } from '../src/location'

type Atom<T> = {
  get: () => T
  set: (next: T | ((previous: T) => T)) => void
  subscribe: (listener: () => void) => () => void
}

// Exercise the framework-independent store factory contract. Public renderer
// regressions live alongside the adapters; this fixture is not a renderer.
function fixture(isServer = false) {
  let depth = 0
  let allocations = 0
  const dirty = new Set<() => void>()
  function batch(fn: () => void) {
    depth++
    try {
      fn()
    } finally {
      if (--depth === 0) {
        while (dirty.size) {
          const notify = dirty.values().next().value!
          dirty.delete(notify)
          notify()
        }
      }
    }
  }
  function atom<T>(initial: T): Atom<T> {
    allocations++
    let value = initial
    const listeners = new Set<() => void>()
    const notify = () => {
      for (const listener of [...listeners]) {
        if (listeners.has(listener)) {
          listener()
        }
      }
    }
    return {
      get: () => value,
      set(next) {
        const result =
          typeof next === 'function'
          ? (next as (previous: T) => T)(value)
          : next
        if (Object.is(value, result)) {
          return
        }
        value = result
        if (depth) {
          dirty.add(notify)
        } else {
          notify()
        }
      },
      subscribe(listener) {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    }
  }
  const initial = location('/home')
  const stores = createRouterStores(initial, {
    createMutableStore: atom,
    createReadonlyStore: <TValue>(get: () => TValue) => ({ get }),
    batch,
  })
  const router = {
    _tx: undefined as AnyRouter['_tx'],
    isServer,
    stores,
    batch,
  }
  const sourceFor = (owner?: string) =>
    getLinkLocationStore(
      router as unknown as AnyRouter,
      owner,
      atom as StoreConfig['createMutableStore'],
    ) as Atom<ParsedLocation>
  function begin(next: ParsedLocation, owners: Array<string>) {
    let resolve!: () => void
    let reject!: (reason: unknown) => void
    const done = new Promise<void>((yes, no) => {
      resolve = yes
      reject = no
    })
    const tx = [
      new AbortController(),
      0,
      next,
      owners.map((routeId) => ({ routeId })),
      0,
      done,
    ] as unknown as NonNullable<AnyRouter['_tx']>
    router._tx = tx
    batch(() => {
      stores.status.set('pending')
      stores.location.set(next)
    })
    return { tx, resolve, reject }
  }
  return {
    router,
    stores,
    sourceFor,
    begin,
    initial,
    allocations: () => allocations,
  }
}

function location(pathname: string, search = {}): ParsedLocation {
  return {
    pathname,
    search,
    searchStr: '',
    hash: '',
    href: pathname,
    publicHref: pathname,
    state: {},
  } as ParsedLocation
}

async function tick() {
  await Promise.resolve()
  await Promise.resolve()
}

test('ownerless and server readers allocate no scoped stores or publication wrapper', () => {
  for (const isServer of [false, true]) {
    const { stores, sourceFor, allocations } = fixture(isServer)
    const before = allocations()
    const setter = stores.location.set
    assert.equal(sourceFor(), stores.location)
    if (isServer) {
      assert.equal(sourceFor('/home'), stores.location)
    }
    assert.equal(allocations(), before)
    assert.equal(stores.location.set, setter)
  }
})

test('all Links owned by a route share one stable source', () => {
  const { sourceFor } = fixture()
  assert.equal(sourceFor('/home'), sourceFor('/home'))
  assert.notEqual(sourceFor('/home'), sourceFor('__root__'))
})

test('1,000 departing active subscribers are not notified; live href readers are', async () => {
  const { sourceFor, begin, stores, initial } = fixture()
  const outgoing = sourceFor('/home')
  const snapshot = outgoing.get()
  const header = sourceFor('__root__')
  let outgoingCalls = 0
  let headerCalls = 0
  let liveCalls = 0
  const dispose = Array.from({ length: 1000 }, () =>
    outgoing.subscribe(() => {
      outgoingCalls++
    }),
  )
  header.subscribe(() => {
    headerCalls++
  })
  ;(stores.location as unknown as Atom<ParsedLocation>).subscribe(() => {
    liveCalls++
  })
  const next = location('/away')
  const nav = begin(next, ['__root__', '/away'])
  assert.equal(outgoing.get(), snapshot)
  assert.deepEqual(outgoing.get(), initial)
  assert.deepEqual(header.get(), next)
  assert.equal(outgoingCalls, 0)
  assert.equal(headerCalls, 1)
  assert.equal(liveCalls, 1)
  dispose.forEach((fn) => fn())
  nav.resolve()
  await tick()
  assert.equal(outgoingCalls, 0)
  assert.deepEqual(outgoing.get(), next)
})

test('successful completion repairs surviving consumers without another URL change', async () => {
  const { sourceFor, begin } = fixture()
  const source = sourceFor('/home')
  let calls = 0
  source.subscribe(() => {
    calls++
  })
  const next = location('/away')
  const nav = begin(next, ['/away'])
  nav.resolve()
  await tick()
  assert.deepEqual(source.get(), next)
  assert.equal(calls, 1)
})

test('rejected completion also repairs survivors', async () => {
  const { sourceFor, begin } = fixture()
  const source = sourceFor('/home')
  const next = location('/away')
  const nav = begin(next, ['/away'])
  nav.reject(new Error('transaction failed'))
  await tick()
  assert.deepEqual(source.get(), next)
})

test('obsolete completion cannot unfreeze a successor navigation', async () => {
  const { sourceFor, begin } = fixture()
  const source = sourceFor('/home')
  const snapshot = source.get()
  const first = begin(location('/b'), ['/b'])
  const last = location('/c')
  const second = begin(last, ['/c'])
  first.resolve()
  await tick()
  assert.equal(source.get(), snapshot)
  second.resolve()
  await tick()
  assert.deepEqual(source.get(), last)
})

test('a successor retaining the owner catches it up immediately', async () => {
  const { sourceFor, begin } = fixture()
  const source = sourceFor('/home')
  const first = begin(location('/away'), ['/away'])
  const next = location('/home', { page: 2 })
  const second = begin(next, ['/home'])
  assert.deepEqual(source.get(), next)
  first.resolve()
  second.resolve()
  await tick()
  assert.deepEqual(source.get(), next)
})

test('settlement installs all owner snapshots before notifying the first reader', async () => {
  const { sourceFor, begin } = fixture()
  const a = sourceFor('/a')
  const b = sourceFor('/b')
  const next = location('/away')
  let observed: ParsedLocation | undefined
  a.subscribe(() => {
    observed = b.get()
  })
  const nav = begin(next, ['/away'])
  nav.resolve()
  await tick()
  assert.deepEqual(observed, next)
  assert.equal(a.get(), b.get())
})

test('commit can clear transaction matches before completion', async () => {
  const { sourceFor, begin } = fixture()
  const source = sourceFor('/home')
  const next = location('/away')
  const nav = begin(next, ['/away'])
  nav.tx[3] = []
  nav.resolve()
  await tick()
  assert.deepEqual(source.get(), next)
})

test('non-navigation publications and updater functions retain ordinary setter semantics', () => {
  const { sourceFor, stores } = fixture()
  const source = sourceFor('/home')
  const next = location('/manual')
  stores.location.set(() => next)
  assert.equal(stores.location.get(), next)
  assert.deepEqual(source.get(), next)
})

test('a subscriber can navigate again during settlement', async () => {
  const { sourceFor, begin } = fixture()
  const source = sourceFor('/home')
  const finalLocation = location('/home', { successor: true })
  let successor: ReturnType<typeof begin> | undefined
  let armed = true
  source.subscribe(() => {
    if (armed) {
      armed = false
      successor = begin(finalLocation, ['/home'])
    }
  })
  const first = begin(location('/away'), ['/away'])
  first.resolve()
  await tick()
  assert.deepEqual(source.get(), finalLocation)
  successor!.resolve()
  await tick()
  assert.deepEqual(source.get(), finalLocation)
})

test('restoring an identical location still retires render-local prop baselines', async () => {
  const { sourceFor, begin, initial } = fixture()
  const source = sourceFor('/home')
  const snapshot = source.get()
  const nav = begin(initial, ['/away'])
  assert.equal(source.get(), snapshot)
  nav.resolve()
  await tick()
  assert.notEqual(source.get(), snapshot)
  assert.deepEqual(source.get(), initial)
})

test('late-created owner sources start from the live location', async () => {
  const { sourceFor, begin } = fixture()
  sourceFor('__root__')
  const next = location('/away')
  const nav = begin(next, ['__root__', '/away'])
  const late = sourceFor('/home')
  assert.deepEqual(late.get(), next)
  nav.resolve()
  await tick()
  assert.deepEqual(late.get(), next)
})
