import type { NavigateOptions } from '@tanstack/router-core'
import type { ClientNavWorkload } from '#client-nav/benchmark'
import type { Framework, MountTestApp } from '#client-nav/lifecycle'
import {
  createClientNavLifecycle,
  warnClientNavDevMode,
} from '#client-nav/lifecycle'
import {
  createDeterministicRandom,
  randomSegment,
} from '#client-nav/bench-utils'

export type LoaderCachePage =
  | 'data'
  | 'list'
  | 'item'
  | 'stale'
  | 'blocking'
  | 'conditional'
  | 'evict'

export type ControlledLoaderKind = 'stale' | 'blocking'

export type SyncLoaderKind = 'data' | 'list' | 'item' | 'conditional' | 'evict'

export interface ListSearch {
  page: number
  filter: string
  tag: string
}

export interface ListLoaderDeps extends ListSearch {}

export interface ItemLoaderDeps {
  filter: string
  tag: string
}

export interface ConditionalSearch {
  key: string
  mode: 'reload' | 'skip'
}

export interface LoaderCachePayload {
  route: LoaderCachePage
  sequence: number
  seed: number
  checksum: number
  size: number
}

export interface LoaderCacheCounters {
  data: number
  list: number
  item: number
  staleStarted: number
  staleCompleted: number
  blockingStarted: number
  blockingCompleted: number
  conditional: number
  conditionalChecks: number
  conditionalSkips: number
  evict: number
}

export interface LoaderCacheRuntime {
  reset: () => void
  resolveAllControlledLoads: () => void
  resolveNextControlledLoad: (kind: ControlledLoaderKind) => void
  snapshot: () => LoaderCacheCounters
  getPendingControlledLoadCount: (kind: ControlledLoaderKind) => number
  recordSyncLoad: (kind: SyncLoaderKind) => number
  recordConditionalCheck: (shouldReload: boolean) => boolean
  createControlledLoad: (
    kind: ControlledLoaderKind,
    build: (sequence: number) => LoaderCachePayload,
  ) => Promise<LoaderCachePayload>
}

export const loaderCacheInitialEntry = '/data'
export const loaderCacheSubscriberSlots = Array.from(
  { length: 5 },
  (_, index) => index,
)

const random = createDeterministicRandom(6_006)

const token = (prefix: string, index: number) =>
  `${prefix}-${index}-${randomSegment(random)}`

export const loaderCacheInputs = {
  itemId: token('item', 0),
  listA: {
    page: 1,
    filter: token('filter', 0),
    tag: token('tag', 0),
  },
  listB: {
    page: 2,
    filter: token('filter', 1),
    tag: token('tag', 1),
  },
  conditional: {
    key: token('condition', 0),
  },
  evictBuckets: [0, 1, 2].map((index) => token('bucket', index)),
} as const

const scenarioLeafRouteIds = new Set([
  '/data/list',
  '/data/list/$itemId',
  '/data/stale',
  '/data/blocking',
  '/data/conditional',
])

const emptyCounters = (): LoaderCacheCounters => ({
  data: 0,
  list: 0,
  item: 0,
  staleStarted: 0,
  staleCompleted: 0,
  blockingStarted: 0,
  blockingCompleted: 0,
  conditional: 0,
  conditionalChecks: 0,
  conditionalSkips: 0,
  evict: 0,
})

function normalizePositiveInteger(value: unknown, fallback: number) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 1) {
    return fallback
  }

  return Math.trunc(number)
}

function normalizeSegment(value: unknown, fallback: string) {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }

  return fallback
}

function checksumSeed(seed: number) {
  let value = Math.trunc(seed) | 0

  for (let index = 0; index < 28; index++) {
    value = (value * 1664525 + 1013904223 + index) >>> 0
  }

  return value
}

export function runLoaderCacheSelectorComputation(seed: number) {
  return checksumSeed(seed) % 1_000_003
}

export function normalizeListSearch(
  search: Record<string, unknown>,
): ListSearch {
  return {
    page: normalizePositiveInteger(search.page, 1),
    filter: normalizeSegment(search.filter, 'all'),
    tag: normalizeSegment(search.tag, 'base'),
  }
}

export function createListLoaderDeps(search: ListSearch): ListLoaderDeps {
  return {
    page: search.page,
    filter: search.filter,
    tag: search.tag,
  }
}

export function createItemLoaderDeps(
  search: Record<string, unknown>,
): ItemLoaderDeps {
  const listSearch = normalizeListSearch(search)

  return {
    filter: listSearch.filter,
    tag: listSearch.tag,
  }
}

export function normalizeConditionalSearch(
  search: Record<string, unknown>,
): ConditionalSearch {
  const mode = search.mode === 'skip' ? 'skip' : 'reload'

  return {
    key: normalizeSegment(search.key, 'control'),
    mode,
  }
}

export function buildLoaderCachePayload(
  route: LoaderCachePage,
  sequence: number,
  seed: number,
): LoaderCachePayload {
  const checksum = checksumSeed(seed + sequence * 17 + route.length)

  return {
    route,
    sequence,
    seed,
    checksum,
    size: 4,
  }
}

export function createLoaderCacheRuntime(): LoaderCacheRuntime {
  let counters = emptyCounters()
  const pendingControlledLoads: Record<
    ControlledLoaderKind,
    Array<() => void>
  > = {
    stale: [],
    blocking: [],
  }

  const resolveNextControlledLoad = (kind: ControlledLoaderKind) => {
    const resolve = pendingControlledLoads[kind].shift()
    if (!resolve) {
      throw new Error(`No pending ${kind} loader to resolve`)
    }

    resolve()
  }

  const resolveAllControlledLoads = () => {
    for (const kind of [
      'stale',
      'blocking',
    ] satisfies Array<ControlledLoaderKind>) {
      while (pendingControlledLoads[kind].length > 0) {
        resolveNextControlledLoad(kind)
      }
    }
  }

  return {
    reset() {
      resolveAllControlledLoads()
      counters = emptyCounters()
    },
    resolveAllControlledLoads,
    resolveNextControlledLoad,
    snapshot() {
      return { ...counters }
    },
    getPendingControlledLoadCount(kind) {
      return pendingControlledLoads[kind].length
    },
    recordSyncLoad(kind) {
      counters[kind] += 1
      return counters[kind]
    },
    recordConditionalCheck(shouldReload) {
      counters.conditionalChecks += 1
      if (!shouldReload) {
        counters.conditionalSkips += 1
      }

      return shouldReload
    },
    createControlledLoad(kind, build) {
      const startKey = `${kind}Started` as const
      const completeKey = `${kind}Completed` as const
      counters[startKey] += 1
      const sequence = counters[startKey]
      let didResolve = false

      return new Promise<LoaderCachePayload>((resolve) => {
        pendingControlledLoads[kind].push(() => {
          if (didResolve) {
            return
          }

          didResolve = true
          counters[completeKey] += 1
          resolve(build(sequence))
        })
      })
    },
  }
}

function assertEqual(label: string, actual: number, expected: number) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`)
  }
}

function isEvictBucketMatch(
  match: { routeId: unknown; params: unknown },
  buckets: ReadonlyArray<string>,
) {
  if (!String(match.routeId).endsWith('/data/evict/$bucketId')) {
    return false
  }

  const params = match.params as Record<string, unknown>
  return buckets.includes(String(params.bucketId))
}

export function createLoaderCacheWorkload(
  framework: Framework,
  mountTestApp: MountTestApp,
  runtime: LoaderCacheRuntime,
): ClientNavWorkload {
  warnClientNavDevMode(framework)

  const lifecycle = createClientNavLifecycle({ mountTestApp })

  function hasPageMarker(page: LoaderCachePage) {
    return lifecycle
      .getContainer()
      .querySelector(`[data-loader-cache-page="${page}"]`)
      ? 1
      : 0
  }

  async function waitForPage(page: LoaderCachePage) {
    await lifecycle.waitForCounter(() => hasPageMarker(page), 1, {
      label: `${page} page marker`,
    })
  }

  async function navigateAndWait(
    options: NavigateOptions,
    page: LoaderCachePage,
  ) {
    await lifecycle.navigate(options, { wait: 'rendered' })
    await waitForPage(page)
  }

  async function navigateWithBlockingControlledLoad(
    kind: ControlledLoaderKind,
    options: NavigateOptions,
    page: LoaderCachePage,
    label: string,
  ) {
    const before = runtime.snapshot()
    const startedKey = `${kind}Started` as const
    const completedKey = `${kind}Completed` as const
    const expectedStarted = before[startedKey] + 1
    const expectedCompleted = before[completedKey] + 1

    await lifecycle.waitForRender(
      async () => {
        const navigation = lifecycle.getRouter().navigate(options)

        await lifecycle.waitForCounter(
          () => runtime.snapshot()[startedKey],
          expectedStarted,
          { label: `${label} loader start` },
        )
        runtime.resolveNextControlledLoad(kind)
        await navigation
        await lifecycle.waitForCounter(
          () => runtime.snapshot()[completedKey],
          expectedCompleted,
          { label: `${label} loader completion` },
        )
      },
      { label },
    )

    await waitForPage(page)
  }

  async function navigateWithBackgroundControlledLoad(
    kind: ControlledLoaderKind,
    options: NavigateOptions,
    page: LoaderCachePage,
    label: string,
  ) {
    const before = runtime.snapshot()
    const startedKey = `${kind}Started` as const
    const completedKey = `${kind}Completed` as const
    const expectedStarted = before[startedKey] + 1
    const expectedCompleted = before[completedKey] + 1

    await lifecycle.waitForRender(
      async () => {
        const navigation = lifecycle.getRouter().navigate(options)
        await lifecycle.waitForCounter(
          () => runtime.snapshot()[startedKey],
          expectedStarted,
          { label: `${label} loader start` },
        )
        await navigation
      },
      { label: `${label} navigation` },
    )

    await waitForPage(page)

    runtime.resolveNextControlledLoad(kind)
    await lifecycle.waitForCounter(
      () => runtime.snapshot()[completedKey],
      expectedCompleted,
      { label: `${label} loader completion` },
    )
    await waitForPage(page)
  }

  function clearScenarioLeafCache() {
    lifecycle.getRouter().clearCache({
      filter: (match) => scenarioLeafRouteIds.has(String(match.routeId)),
    })
  }

  function clearEvictCache(buckets: ReadonlyArray<string>) {
    lifecycle.getRouter().clearCache({
      filter: (match) => isEvictBucketMatch(match, buckets),
    })
  }

  async function invalidateActiveRoute(assertCounters: boolean) {
    const before = runtime.snapshot()

    await lifecycle.waitForPromise(lifecycle.getRouter().invalidate(), {
      label: 'router.invalidate()',
    })
    await lifecycle.waitForCounter(
      () => runtime.snapshot().evict,
      before.evict + 1,
      {
        label: 'evict loader after invalidate',
      },
    )
    await waitForPage('evict')

    if (assertCounters) {
      const after = runtime.snapshot()
      assertEqual(
        'evict invalidate reloads active route',
        after.evict,
        before.evict + 1,
      )
      assertEqual(
        'parent data invalidates with active route',
        after.data,
        before.data + 1,
      )
    }
  }

  async function runCycle(assertCounters: boolean) {
    clearScenarioLeafCache()

    await navigateAndWait(
      {
        to: '/data/list',
        search: loaderCacheInputs.listA,
        replace: true,
      },
      'list',
    )
    const afterListA = runtime.snapshot()

    await navigateAndWait(
      {
        to: '/data/list/$itemId',
        params: { itemId: loaderCacheInputs.itemId },
        search: loaderCacheInputs.listA,
        replace: true,
      },
      'item',
    )

    await navigateAndWait(
      {
        to: '/data/list',
        search: loaderCacheInputs.listA,
        replace: true,
      },
      'list',
    )

    if (assertCounters) {
      assertEqual(
        'fresh list cache hit',
        runtime.snapshot().list,
        afterListA.list,
      )
    }

    await navigateAndWait(
      {
        to: '/data/list',
        search: loaderCacheInputs.listB,
        replace: true,
      },
      'list',
    )

    if (assertCounters) {
      assertEqual(
        'list cache miss for deps B',
        runtime.snapshot().list,
        afterListA.list + 1,
      )
    }

    await navigateAndWait({ to: '/data', replace: true }, 'data')
    await navigateWithBlockingControlledLoad(
      'stale',
      { to: '/data/stale', replace: true },
      'stale',
      'stale cold load',
    )
    await navigateAndWait({ to: '/data', replace: true }, 'data')
    await navigateWithBackgroundControlledLoad(
      'stale',
      { to: '/data/stale', replace: true },
      'stale',
      'stale background reload',
    )

    await navigateAndWait({ to: '/data', replace: true }, 'data')
    await navigateWithBlockingControlledLoad(
      'blocking',
      { to: '/data/blocking', replace: true },
      'blocking',
      'blocking cold load',
    )
    await navigateAndWait({ to: '/data', replace: true }, 'data')
    await navigateWithBlockingControlledLoad(
      'blocking',
      { to: '/data/blocking', replace: true },
      'blocking',
      'blocking stale reload',
    )

    await navigateAndWait(
      {
        to: '/data/conditional',
        search: { key: loaderCacheInputs.conditional.key, mode: 'reload' },
        replace: true,
      },
      'conditional',
    )
    const afterConditionalCold = runtime.snapshot()

    await navigateAndWait({ to: '/data', replace: true }, 'data')
    await navigateAndWait(
      {
        to: '/data/conditional',
        search: { key: loaderCacheInputs.conditional.key, mode: 'skip' },
        replace: true,
      },
      'conditional',
    )

    if (assertCounters) {
      assertEqual(
        'conditional shouldReload skip',
        runtime.snapshot().conditional,
        afterConditionalCold.conditional,
      )
    }

    await navigateAndWait({ to: '/data', replace: true }, 'data')
    await navigateAndWait(
      {
        to: '/data/conditional',
        search: { key: loaderCacheInputs.conditional.key, mode: 'reload' },
        replace: true,
      },
      'conditional',
    )

    if (assertCounters) {
      assertEqual(
        'conditional shouldReload reload',
        runtime.snapshot().conditional,
        afterConditionalCold.conditional + 1,
      )
    }

    clearEvictCache(loaderCacheInputs.evictBuckets)

    for (const bucketId of loaderCacheInputs.evictBuckets) {
      await navigateAndWait(
        {
          to: '/data/evict/$bucketId',
          params: { bucketId },
          replace: true,
        },
        'evict',
      )
    }

    const afterEvictWarm = runtime.snapshot()
    const evictedBucket = loaderCacheInputs.evictBuckets[0]!
    const retainedBucket = loaderCacheInputs.evictBuckets[1]!

    clearEvictCache([evictedBucket])
    await navigateAndWait(
      {
        to: '/data/evict/$bucketId',
        params: { bucketId: evictedBucket },
        replace: true,
      },
      'evict',
    )
    const afterEvictedReload = runtime.snapshot()

    if (assertCounters) {
      assertEqual(
        'filtered clear evicts one bucket',
        afterEvictedReload.evict,
        afterEvictWarm.evict + 1,
      )
    }

    await navigateAndWait(
      {
        to: '/data/evict/$bucketId',
        params: { bucketId: retainedBucket },
        replace: true,
      },
      'evict',
    )

    if (assertCounters) {
      assertEqual(
        'filtered clear retains other bucket',
        runtime.snapshot().evict,
        afterEvictedReload.evict,
      )
    }

    await invalidateActiveRoute(assertCounters)
  }

  async function before() {
    runtime.reset()
    await lifecycle.before()
    await waitForPage('data')
  }

  async function after() {
    runtime.resolveAllControlledLoads()
    await lifecycle.after()
  }

  return {
    name: `client loader cache loop (${framework})`,
    before,
    async run() {
      await runCycle(false)
    },
    async sanity() {
      await before()

      try {
        await runCycle(true)

        const counters = runtime.snapshot()
        assertEqual('parent data loaders', counters.data, 2)
        assertEqual('list loaders', counters.list, 2)
        assertEqual('item loaders', counters.item, 1)
        assertEqual('stale loader starts', counters.staleStarted, 2)
        assertEqual('stale loader completions', counters.staleCompleted, 2)
        assertEqual('blocking loader starts', counters.blockingStarted, 2)
        assertEqual(
          'blocking loader completions',
          counters.blockingCompleted,
          2,
        )
        assertEqual('conditional loaders', counters.conditional, 2)
        assertEqual('evict loaders', counters.evict, 5)

        if (counters.conditionalSkips < 1) {
          throw new Error(
            'conditional shouldReload did not record a skipped reload',
          )
        }
      } finally {
        await after()
      }
    },
    after,
  }
}
