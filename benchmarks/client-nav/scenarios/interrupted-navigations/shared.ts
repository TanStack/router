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

export type InterruptedControlledLoaderKind =
  | 'slow'
  | 'nestedParent'
  | 'nestedChild'

export type InterruptedLoaderKind = InterruptedControlledLoaderKind | 'fast'

export interface InterruptedLoaderPayload {
  kind: InterruptedLoaderKind
  key: string
  id: string
  group: string | undefined
  sequence: number
  checksum: number
}

export interface InterruptedNavigationCounters {
  started: Record<InterruptedLoaderKind, number>
  resolved: Record<InterruptedLoaderKind, number>
  aborted: Record<InterruptedControlledLoaderKind, number>
  committed: Record<InterruptedLoaderKind, number>
}

export interface InterruptedNavigationRuntime {
  createControlledLoad: (
    kind: InterruptedControlledLoaderKind,
    key: string,
    signal: AbortSignal,
    details: { id: string; group?: string },
  ) => Promise<InterruptedLoaderPayload>
  getPendingCount: (kind?: InterruptedControlledLoaderKind) => number
  hasPending: (kind: InterruptedControlledLoaderKind, key: string) => boolean
  recordCommit: (payload: InterruptedLoaderPayload) => void
  recordFastLoad: (id: string) => InterruptedLoaderPayload
  reset: () => void
  resolveAllControlledLoads: (kind?: InterruptedControlledLoaderKind) => void
  resolveControlledLoad: (
    kind: InterruptedControlledLoaderKind,
    key: string,
  ) => void
  snapshot: () => InterruptedNavigationCounters
}

type NavigationSettlement =
  | {
      status: 'fulfilled'
      value: void
    }
  | {
      status: 'rejected'
      reason: unknown
    }

interface PendingControlledLoad {
  kind: InterruptedControlledLoaderKind
  key: string
  resolve: () => void
}

export const interruptedNavigationScenarioSlug = 'interrupted-navigations'
export const interruptedNavigationHomePath = '/interrupt'

const interruptedNavigationGroupCount = 10
const random = createDeterministicRandom(11_011)

export const interruptedNavigationInputs = Array.from(
  { length: interruptedNavigationGroupCount },
  (_, index) => createInterruptedNavigationInput(index),
)

export const interruptedNavigationSanityInput =
  createInterruptedNavigationInput(10_001)

export function createSlowLoaderKey(id: string) {
  return `slow:${id}`
}

export function createNestedParentLoaderKey(group: string) {
  return `nested-parent:${group}`
}

export function createNestedChildLoaderKey(group: string, id: string) {
  return `nested-child:${group}:${id}`
}

export function runInterruptedNavigationComputation(seed: number) {
  let value = Math.trunc(seed) | 0

  for (let index = 0; index < 36; index++) {
    value = (value * 1664525 + 1013904223 + index) >>> 0
  }

  return value
}

export function createInterruptedNavigationRuntime(): InterruptedNavigationRuntime {
  let counters = createEmptyCounters()
  const pendingLoads = new Map<string, PendingControlledLoad>()
  const committedLoads = new Set<string>()

  function resolveAllControlledLoads(kind?: InterruptedControlledLoaderKind) {
    for (const pending of Array.from(pendingLoads.values())) {
      if (kind !== undefined && pending.kind !== kind) {
        continue
      }

      pending.resolve()
    }
  }

  return {
    createControlledLoad(kind, key, signal, details) {
      const mapKey = createMapKey(kind, key)
      counters.started[kind] += 1
      const sequence = counters.started[kind]

      return new Promise<InterruptedLoaderPayload>((resolve, reject) => {
        let didSettle = false

        const cleanup = () => {
          signal.removeEventListener('abort', onAbort)
          pendingLoads.delete(mapKey)
        }

        const settleAsResolved = () => {
          if (didSettle) {
            return
          }

          didSettle = true
          cleanup()
          counters.resolved[kind] += 1
          resolve(buildLoaderPayload(kind, key, sequence, details))
        }

        const settleAsAborted = () => {
          if (didSettle) {
            return
          }

          didSettle = true
          cleanup()
          counters.aborted[kind] += 1
          reject(createAbortError())
        }

        function onAbort() {
          settleAsAborted()
        }

        pendingLoads.set(mapKey, {
          kind,
          key,
          resolve: settleAsResolved,
        })

        signal.addEventListener('abort', onAbort, { once: true })

        if (signal.aborted) {
          settleAsAborted()
        }
      })
    },
    getPendingCount(kind) {
      if (kind === undefined) {
        return pendingLoads.size
      }

      let count = 0

      for (const pending of pendingLoads.values()) {
        if (pending.kind === kind) {
          count += 1
        }
      }

      return count
    },
    hasPending(kind, key) {
      return pendingLoads.has(createMapKey(kind, key))
    },
    recordCommit(payload) {
      const key = createMapKey(payload.kind, payload.key)

      if (committedLoads.has(key)) {
        return
      }

      committedLoads.add(key)
      counters.committed[payload.kind] += 1
    },
    recordFastLoad(id) {
      const kind = 'fast'
      const key = `fast:${id}`
      counters.started[kind] += 1
      counters.resolved[kind] += 1

      return buildLoaderPayload(kind, key, counters.started[kind], { id })
    },
    reset() {
      resolveAllControlledLoads()
      pendingLoads.clear()
      committedLoads.clear()
      counters = createEmptyCounters()
    },
    resolveAllControlledLoads,
    resolveControlledLoad(kind, key) {
      const pending = pendingLoads.get(createMapKey(kind, key))

      if (!pending) {
        throw new Error(`No pending ${kind} loader for key: ${key}`)
      }

      pending.resolve()
    },
    snapshot() {
      return cloneCounters(counters)
    },
  }
}

export function createInterruptedNavigationsWorkload(
  framework: Framework,
  mountTestApp: MountTestApp,
  runtime: InterruptedNavigationRuntime,
): ClientNavWorkload {
  warnClientNavDevMode(framework)

  const lifecycle = createClientNavLifecycle({ mountTestApp })

  function getPageMarker() {
    return lifecycle
      .getContainer()
      .querySelector<HTMLElement>('[data-interrupted-page]')
  }

  function assertRenderedPage(
    page: 'home' | 'fast' | 'nested',
    expected: { id?: string; group?: string } = {},
  ) {
    const marker = getPageMarker()
    const actualPage = marker?.dataset.interruptedPage

    if (actualPage !== page) {
      throw new Error(`Expected interrupted page ${page}, got ${actualPage}`)
    }

    if (
      expected.id !== undefined &&
      marker?.dataset.interruptedId !== expected.id
    ) {
      throw new Error(
        `Expected interrupted id ${expected.id}, got ${marker?.dataset.interruptedId}`,
      )
    }

    if (
      expected.group !== undefined &&
      marker?.dataset.interruptedGroup !== expected.group
    ) {
      throw new Error(
        `Expected interrupted group ${expected.group}, got ${marker?.dataset.interruptedGroup}`,
      )
    }
  }

  async function waitForPage(
    page: 'home' | 'fast' | 'nested',
    expected: { id?: string; group?: string } = {},
  ) {
    await lifecycle.waitForCounter(
      () => {
        try {
          assertRenderedPage(page, expected)
          return 1
        } catch {
          return 0
        }
      },
      1,
      { label: `${page} interrupted page marker` },
    )
  }

  async function waitForPendingLoader(
    kind: InterruptedControlledLoaderKind,
    key: string,
  ) {
    await lifecycle.waitForCounter(
      () => (runtime.hasPending(kind, key) ? 1 : 0),
      1,
      { label: `${kind} pending loader ${key}` },
    )
  }

  function getLatestLoadPromise(label: string) {
    const loadPromise = lifecycle.getRouter().latestLoadPromise

    if (!loadPromise) {
      throw new Error(`${label} did not create a router load promise`)
    }

    return loadPromise
  }

  function startNavigation(options: NavigateOptions) {
    return captureNavigation(lifecycle.getRouter().navigate(options))
  }

  async function waitForExpectedLoadSettlement(
    loadPromise: Promise<void>,
    label: string,
  ) {
    assertSupersededNavigation(
      await lifecycle.waitForPromise(captureNavigation(loadPromise), { label }),
      label,
    )
  }

  async function navigateFast(id: string) {
    await lifecycle.navigate(
      {
        to: '/interrupt/fast/$id',
        params: { id },
        replace: true,
      },
      { wait: 'rendered', label: `fast navigation ${id}` },
    )
    await waitForPage('fast', { id })
  }

  async function startSlowNavigation(id: string) {
    const key = createSlowLoaderKey(id)
    const settlement = startNavigation({
      to: '/interrupt/slow/$id',
      params: { id },
      replace: true,
    })

    await waitForPendingLoader('slow', key)

    return {
      key,
      settlement,
      loadPromise: getLatestLoadPromise(`slow navigation ${id}`),
    }
  }

  async function startNestedNavigation(group: string, id: string) {
    const parentKey = createNestedParentLoaderKey(group)
    const childKey = createNestedChildLoaderKey(group, id)
    const settlement = startNavigation({
      to: '/interrupt/nested/$group/$id',
      params: { group, id },
      replace: true,
    })

    await waitForPendingLoader('nestedParent', parentKey)
    await waitForPendingLoader('nestedChild', childKey)

    return {
      parentKey,
      childKey,
      settlement,
      loadPromise: getLatestLoadPromise(`nested navigation ${group}/${id}`),
    }
  }

  async function completeLatestNestedNavigation(
    input: InterruptedNavigationInput,
  ) {
    const staleNested = await startNestedNavigation(
      input.nestedStaleGroup,
      input.nestedStaleId,
    )
    const latestNested = await startNestedNavigation(
      input.nestedFinalGroup,
      input.nestedFinalId,
    )

    await lifecycle.waitForRender(
      async () => {
        runtime.resolveControlledLoad('nestedParent', latestNested.parentKey)
        runtime.resolveControlledLoad('nestedChild', latestNested.childKey)
        assertFulfilledNavigation(
          await lifecycle.waitForPromise(latestNested.settlement, {
            label: `latest nested navigation ${input.nestedFinalGroup}/${input.nestedFinalId}`,
          }),
          'latest nested navigation',
        )
        await waitForExpectedLoadSettlement(
          latestNested.loadPromise,
          `latest nested load ${input.nestedFinalGroup}/${input.nestedFinalId}`,
        )
      },
      {
        label: `latest nested render ${input.nestedFinalGroup}/${input.nestedFinalId}`,
      },
    )

    await waitForPage('nested', {
      group: input.nestedFinalGroup,
      id: input.nestedFinalId,
    })

    runtime.resolveAllControlledLoads('nestedParent')
    runtime.resolveAllControlledLoads('nestedChild')

    assertSupersededNavigation(
      await lifecycle.waitForPromise(staleNested.settlement, {
        label: `stale nested navigation ${input.nestedStaleGroup}/${input.nestedStaleId}`,
      }),
      'stale nested navigation',
    )
    await waitForExpectedLoadSettlement(
      staleNested.loadPromise,
      `stale nested load ${input.nestedStaleGroup}/${input.nestedStaleId}`,
    )
  }

  async function runInterruptedGroup(
    input: InterruptedNavigationInput,
    assertCounters: boolean,
  ) {
    const before = runtime.snapshot()
    const slowOne = await startSlowNavigation(input.slowOneId)
    const slowTwo = await startSlowNavigation(input.slowTwoId)

    await navigateFast(input.fastId)
    runtime.resolveAllControlledLoads('slow')

    assertSupersededNavigation(
      await lifecycle.waitForPromise(slowOne.settlement, {
        label: `first slow navigation ${input.slowOneId}`,
      }),
      'first slow navigation',
    )
    assertSupersededNavigation(
      await lifecycle.waitForPromise(slowTwo.settlement, {
        label: `second slow navigation ${input.slowTwoId}`,
      }),
      'second slow navigation',
    )
    await waitForExpectedLoadSettlement(
      slowOne.loadPromise,
      `first slow load ${input.slowOneId}`,
    )
    await waitForExpectedLoadSettlement(
      slowTwo.loadPromise,
      `second slow load ${input.slowTwoId}`,
    )
    await waitForPage('fast', { id: input.fastId })

    await completeLatestNestedNavigation(input)

    if (assertCounters) {
      assertGroupCounters(before, runtime.snapshot())
    }
  }

  async function before() {
    runtime.reset()
    await lifecycle.before()
    await waitForPage('home')
  }

  async function after() {
    runtime.resolveAllControlledLoads()
    await lifecycle.after()
    runtime.reset()
  }

  return {
    name: `client interrupted navigations loop (${framework})`,
    before,
    async run() {
      for (const input of interruptedNavigationInputs) {
        await runInterruptedGroup(input, false)
      }
    },
    async sanity() {
      await before()

      try {
        await runInterruptedGroup(interruptedNavigationSanityInput, true)
        assertRenderedPage('nested', {
          group: interruptedNavigationSanityInput.nestedFinalGroup,
          id: interruptedNavigationSanityInput.nestedFinalId,
        })

        const counters = runtime.snapshot()

        if (counters.committed.slow !== 0) {
          throw new Error('A stale slow route committed after interruption')
        }

        if (runtime.getPendingCount() !== 0) {
          throw new Error('Interrupted navigation sanity left pending loaders')
        }
      } finally {
        await after()
      }
    },
    after,
  }
}

interface InterruptedNavigationInput {
  slowOneId: string
  slowTwoId: string
  fastId: string
  nestedStaleGroup: string
  nestedStaleId: string
  nestedFinalGroup: string
  nestedFinalId: string
}

function createInterruptedNavigationInput(
  index: number,
): InterruptedNavigationInput {
  return {
    slowOneId: token('slow-a', index),
    slowTwoId: token('slow-b', index),
    fastId: token('fast', index),
    nestedStaleGroup: token('nested-stale-group', index),
    nestedStaleId: token('nested-stale-id', index),
    nestedFinalGroup: token('nested-final-group', index),
    nestedFinalId: token('nested-final-id', index),
  }
}

function token(prefix: string, index: number) {
  return `${prefix}-${index}-${randomSegment(random)}`
}

function createEmptyCounters(): InterruptedNavigationCounters {
  return {
    started: {
      slow: 0,
      fast: 0,
      nestedParent: 0,
      nestedChild: 0,
    },
    resolved: {
      slow: 0,
      fast: 0,
      nestedParent: 0,
      nestedChild: 0,
    },
    aborted: {
      slow: 0,
      nestedParent: 0,
      nestedChild: 0,
    },
    committed: {
      slow: 0,
      fast: 0,
      nestedParent: 0,
      nestedChild: 0,
    },
  }
}

function cloneCounters(
  counters: InterruptedNavigationCounters,
): InterruptedNavigationCounters {
  return {
    started: { ...counters.started },
    resolved: { ...counters.resolved },
    aborted: { ...counters.aborted },
    committed: { ...counters.committed },
  }
}

function createMapKey(kind: InterruptedLoaderKind, key: string) {
  return `${kind}:${key}`
}

function buildLoaderPayload(
  kind: InterruptedLoaderKind,
  key: string,
  sequence: number,
  details: { id: string; group?: string },
): InterruptedLoaderPayload {
  const checksum = runInterruptedNavigationComputation(
    stringSeed(`${kind}:${key}:${details.id}:${details.group ?? ''}`) +
      sequence,
  )

  return {
    kind,
    key,
    id: details.id,
    group: details.group,
    sequence,
    checksum,
  }
}

function stringSeed(value: string) {
  let seed = 0

  for (let index = 0; index < value.length; index++) {
    seed = (seed * 31 + value.charCodeAt(index)) >>> 0
  }

  return seed
}

function createAbortError() {
  if (typeof DOMException === 'function') {
    return new DOMException(
      'Interrupted navigation loader aborted',
      'AbortError',
    )
  }

  const error = new Error('Interrupted navigation loader aborted')
  error.name = 'AbortError'
  return error
}

function captureNavigation(
  value: Promise<void>,
): Promise<NavigationSettlement> {
  return value
    .then(
      (result): NavigationSettlement => ({
        status: 'fulfilled',
        value: result,
      }),
    )
    .catch(
      (reason: unknown): NavigationSettlement => ({
        status: 'rejected',
        reason,
      }),
    )
}

function assertFulfilledNavigation(
  settlement: NavigationSettlement,
  label: string,
) {
  if (settlement.status === 'fulfilled') {
    return
  }

  throw new Error(`${label} rejected: ${formatReason(settlement.reason)}`)
}

function assertSupersededNavigation(
  settlement: NavigationSettlement,
  label: string,
) {
  if (settlement.status === 'fulfilled') {
    return
  }

  if (reasonHasAbortShape(settlement.reason)) {
    return
  }

  if (reasonHasCancellationShape(settlement.reason)) {
    return
  }

  throw new Error(
    `${label} rejected unexpectedly: ${formatReason(settlement.reason)}`,
  )
}

function reasonHasAbortShape(reason: unknown) {
  return reason instanceof DOMException && reason.name === 'AbortError'
}

function reasonHasCancellationShape(reason: unknown) {
  return (
    reason instanceof Error &&
    (reason.name === 'AbortError' || reason.name === 'CancelledError')
  )
}

function formatReason(reason: unknown) {
  if (reason instanceof Error) {
    return `${reason.name}: ${reason.message}`
  }

  return String(reason)
}

function assertCounterDelta(
  label: string,
  before: number,
  after: number,
  expectedDelta: number,
) {
  const actualDelta = after - before

  if (actualDelta !== expectedDelta) {
    throw new Error(
      `${label}: expected delta ${expectedDelta}, got ${actualDelta}`,
    )
  }
}

function assertGroupCounters(
  before: InterruptedNavigationCounters,
  after: InterruptedNavigationCounters,
) {
  assertCounterDelta(
    'slow loader starts',
    before.started.slow,
    after.started.slow,
    2,
  )
  assertCounterDelta(
    'fast loader starts',
    before.started.fast,
    after.started.fast,
    1,
  )
  assertCounterDelta(
    'nested parent starts',
    before.started.nestedParent,
    after.started.nestedParent,
    2,
  )
  assertCounterDelta(
    'nested child starts',
    before.started.nestedChild,
    after.started.nestedChild,
    2,
  )
  assertCounterDelta(
    'slow loader aborts',
    before.aborted.slow,
    after.aborted.slow,
    2,
  )
  assertCounterDelta(
    'nested parent aborts',
    before.aborted.nestedParent,
    after.aborted.nestedParent,
    1,
  )
  assertCounterDelta(
    'nested child aborts',
    before.aborted.nestedChild,
    after.aborted.nestedChild,
    1,
  )
  assertCounterDelta(
    'slow commits',
    before.committed.slow,
    after.committed.slow,
    0,
  )
  assertCounterDelta(
    'fast commits',
    before.committed.fast,
    after.committed.fast,
    1,
  )
  assertCounterDelta(
    'nested parent commits',
    before.committed.nestedParent,
    after.committed.nestedParent,
    1,
  )
  assertCounterDelta(
    'nested child commits',
    before.committed.nestedChild,
    after.committed.nestedChild,
    1,
  )
}
