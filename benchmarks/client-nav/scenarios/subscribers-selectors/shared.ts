export const subscribersSelectorsScenarioSlug = 'subscribers-selectors'

export const subscriberCounts = {
  routerState: 80,
  search: 80,
  params: 80,
  matches: 40,
} as const

export const subscriberGroupSize = 20
export const subscribersSelectorsActionsPerRun = 24

export type SubscriberCounterKey =
  | 'routerPath'
  | 'routerStatus'
  | 'routerHash'
  | 'routerSearchObject'
  | 'searchSelected'
  | 'searchObject'
  | 'searchStable'
  | 'searchMode'
  | 'paramSection'
  | 'paramItem'
  | 'paramObject'
  | 'matchesDepth'
  | 'matchObject'

export type SubscriberCounts = Record<SubscriberCounterKey, number>

export interface SubscriberSearch {
  selected: number
  mode: string
  objectKey: number
  stable: string
  unrelated: string
}

export interface SubscribersSelectorsAction {
  section: string
  itemId: string
  search: SubscriberSearch
  hash: string
}

const modeValues = ['summary', 'details', 'related', 'audit'] as const
const sectionValues = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const

function createIndices(count: number) {
  const indices: Array<number> = []

  for (let index = 0; index < count; index++) {
    indices.push(index)
  }

  return indices
}

export const subscriberIndices = {
  routerState: createIndices(subscriberCounts.routerState),
  search: createIndices(subscriberCounts.search),
  params: createIndices(subscriberCounts.params),
  matches: createIndices(subscriberCounts.matches),
} as const

export function createEmptySubscriberCounts(): SubscriberCounts {
  return {
    routerPath: 0,
    routerStatus: 0,
    routerHash: 0,
    routerSearchObject: 0,
    searchSelected: 0,
    searchObject: 0,
    searchStable: 0,
    searchMode: 0,
    paramSection: 0,
    paramItem: 0,
    paramObject: 0,
    matchesDepth: 0,
    matchObject: 0,
  }
}

export function runSubscriberComputation(seed: number) {
  let value = Math.trunc(seed) | 0

  for (let index = 0; index < 12; index++) {
    value = (value * 1664525 + 1013904223 + index) >>> 0
  }

  return value
}

export function stringToSubscriberSeed(value: string | undefined) {
  let seed = 0
  const input = value ?? ''

  for (let index = 0; index < input.length; index++) {
    seed = (seed * 31 + input.charCodeAt(index)) >>> 0
  }

  return seed
}

export function digestSubscriberValue(value: unknown): number {
  if (typeof value === 'number') {
    return value
  }

  if (typeof value === 'string') {
    return stringToSubscriberSeed(value)
  }

  if (typeof value === 'boolean') {
    return value ? 1 : 0
  }

  if (value && typeof value === 'object') {
    let seed = 17

    for (const [key, item] of Object.entries(
      value as Record<string, unknown>,
    )) {
      seed =
        (seed +
          stringToSubscriberSeed(key) * 13 +
          digestSubscriberValue(item)) >>>
        0
    }

    return seed
  }

  return 0
}

export function createSubscribersSelectorsRuntime() {
  let subscriberCounts = createEmptySubscriberCounts()
  let subscriberCountersEnabled = false

  return {
    resetSubscriberCounts() {
      subscriberCounts = createEmptySubscriberCounts()
    },
    getSubscriberCounts(): SubscriberCounts {
      return { ...subscriberCounts }
    },
    setSubscriberCountersEnabled(enabled: boolean) {
      subscriberCountersEnabled = enabled
    },
    recordSubscriberUpdate(kind: SubscriberCounterKey) {
      if (subscriberCountersEnabled) {
        subscriberCounts[kind] += 1
      }
    },
    computeSubscriberValue(index: number, value: unknown) {
      return runSubscriberComputation(digestSubscriberValue(value) + index)
    },
  }
}

export function normalizeSubscriberSearch(
  search: Record<string, unknown>,
): SubscriberSearch {
  const selected = Number(search.selected)
  const objectKey = Number(search.objectKey)

  return {
    selected: Number.isFinite(selected) ? Math.trunc(selected) : 0,
    mode: typeof search.mode === 'string' ? search.mode : modeValues[0],
    objectKey: Number.isFinite(objectKey) ? Math.trunc(objectKey) : 0,
    stable: typeof search.stable === 'string' ? search.stable : 'stable-0',
    unrelated:
      typeof search.unrelated === 'string' ? search.unrelated : 'unused-0-0',
  }
}

export function buildSubscriberSearch(
  round: number,
  variant: number,
): SubscriberSearch {
  return {
    selected: round * 10 + variant,
    mode: modeValues[(round + variant) % modeValues.length]!,
    objectKey: round * 100 + variant,
    stable: `stable-${round % 2}`,
    unrelated: `unused-${round}-${variant}`,
  }
}

function createNavigationActions() {
  const actions: Array<SubscribersSelectorsAction> = []

  for (let round = 0; round < 4; round++) {
    const baseSection = sectionValues[(round * 2) % sectionValues.length]!
    const nextSection = sectionValues[(round * 2 + 1) % sectionValues.length]!
    const baseSearch = buildSubscriberSearch(round, 0)
    const selectedSearch = {
      ...baseSearch,
      selected: baseSearch.selected + 1,
    }
    const unrelatedSearch = {
      ...selectedSearch,
      unrelated: `unused-only-${round}`,
    }
    const hash = `round-${round}`

    actions.push({
      section: baseSection,
      itemId: '1',
      search: baseSearch,
      hash,
    })
    actions.push({
      section: baseSection,
      itemId: '1',
      search: selectedSearch,
      hash,
    })
    actions.push({
      section: baseSection,
      itemId: '1',
      search: unrelatedSearch,
      hash,
    })
    actions.push({
      section: baseSection,
      itemId: '2',
      search: unrelatedSearch,
      hash,
    })
    actions.push({
      section: nextSection,
      itemId: '2',
      search: unrelatedSearch,
      hash,
    })
    actions.push({
      section: nextSection,
      itemId: '2',
      search: unrelatedSearch,
      hash: `${hash}-hash-only`,
    })
  }

  if (actions.length !== subscribersSelectorsActionsPerRun) {
    throw new Error(
      `Expected ${subscribersSelectorsActionsPerRun} subscriber selector actions, got ${actions.length}`,
    )
  }

  return actions
}

function encodeSearchValue(value: string | number) {
  return encodeURIComponent(String(value))
}

export function buildSubscribersSelectorsHref(
  action: SubscribersSelectorsAction,
) {
  const search = action.search
  const query = [
    `selected=${encodeSearchValue(search.selected)}`,
    `mode=${encodeSearchValue(search.mode)}`,
    `objectKey=${encodeSearchValue(search.objectKey)}`,
    `stable=${encodeSearchValue(search.stable)}`,
    `unrelated=${encodeSearchValue(search.unrelated)}`,
  ].join('&')

  return `/state/${action.section}/${action.itemId}?${query}#${action.hash}`
}

export const subscribersSelectorsInitialAction: SubscribersSelectorsAction = {
  section: 'seed',
  itemId: '0',
  search: buildSubscriberSearch(99, 0),
  hash: 'seed',
}

export const subscribersSelectorsInitialLocation =
  buildSubscribersSelectorsHref(subscribersSelectorsInitialAction)

export const subscribersSelectorsNavigationActions = createNavigationActions()
