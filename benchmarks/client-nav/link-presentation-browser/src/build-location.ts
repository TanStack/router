import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import type { ParsedLocation } from '@tanstack/react-router'

type BuildCase = 'fresh-build' | 'warm-hit' | 'validated-build'

const optionCount = 1000
const callsPerBatch = {
  'fresh-build': 10000,
  'warm-hit': 1000000,
  'validated-build': 10000,
} as const
const rootRoute = createRootRoute({
  validateSearch: (search: Record<string, unknown>) => ({
    page: Number(search.page ?? 0),
  }),
})
const itemsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'items/$id',
})
const sourceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'source',
})
const router = createRouter({
  routeTree: rootRoute.addChildren([itemsRoute, sourceRoute]),
  history: createMemoryHistory({ initialEntries: ['/source'] }),
  defaultPreload: false,
  scrollRestoration: false,
})

function destinations(kind: BuildCase) {
  const source = router.state.location
  return Array.from({ length: optionCount }, (_, index) => ({
    // Match the fixed dense Rows props, including the Link-owned copy's fields.
    to: '/items/$id' as const,
    params: { id: String(index % 2) },
    activeOptions: { includeSearch: false },
    'data-row': index,
    children: `Link ${index}`,
    _fromLocation: source,
    ...(kind === 'validated-build' ? { _includeValidateSearch: true } : {}),
  }))
}

let warm: ReturnType<typeof destinations>
let warmResults: Array<ParsedLocation>
const ready = router.load().then(() => {
  warm = destinations('warm-hit')
  warmResults = warm.map((destination) => router.buildLocation(destination))
})

function checkOutputs(kind: BuildCase, outputs: Array<ParsedLocation>) {
  const search = kind === 'validated-build' ? { page: 0 } : {}
  for (let index = 0; index < outputs.length; index++) {
    const result = outputs[index]!
    const pathname = `/items/${index % 2}`
    const href = `${pathname}${kind === 'validated-build' ? '?page=0' : ''}`
    if (
      result.pathname !== pathname ||
      result.href !== href ||
      result.publicHref !== href ||
      JSON.stringify(result.search) !== JSON.stringify(search) ||
      JSON.stringify(result.state) !== '{}' ||
      result.hash !== '' ||
      result.maskedLocation
    ) {
      throw new Error(`${kind}: incorrect destination ${index}`)
    }
  }
  if (
    outputs.length !== optionCount ||
    router.state.location.pathname !== '/source'
  ) {
    throw new Error(`${kind}: incorrect batch or changed source`)
  }
}

Object.assign(window, {
  buildLocationBenchmark: {
    ready,
    optionCount,
    callsPerBatch,
    preflight() {
      const results = {}
      for (const kind of [
        'fresh-build',
        'warm-hit',
        'validated-build',
      ] as const) {
        const owned = kind === 'warm-hit' ? warm : destinations(kind)
        const outputs = owned.map((destination) =>
          router.buildLocation(destination),
        )
        checkOutputs(kind, outputs)
        Object.assign(results, {
          [kind]: {
            count: outputs.length,
            hrefs: [outputs[0]!.href, outputs[1]!.href],
            search: outputs[0]!.search,
            state: outputs[0]!.state,
            reusedPublicResults:
              kind === 'warm-hit'
                ? outputs.filter(
                    (output, index) => output === warmResults[index],
                  ).length
                : 0,
          },
        })
      }
      return results
    },
    sample(kind: BuildCase) {
      // Allocate fresh inputs and result storage before the measured region.
      // Warm hits cycle the same 1,000 owned options, preserving cache locality.
      const calls = callsPerBatch[kind]
      const repetitions = calls / optionCount
      const batches = Array.from({ length: repetitions }, () =>
        kind === 'warm-hit' ? warm : destinations(kind),
      )
      const outputs = Array.from(
        { length: repetitions },
        () => new Array<ParsedLocation>(optionCount),
      )
      const started = performance.now()
      for (let batch = 0; batch < repetitions; batch++) {
        for (let index = 0; index < optionCount; index++) {
          outputs[batch]![index] = router.buildLocation(batches[batch]![index]!)
        }
      }
      const batchMs = performance.now() - started
      for (const batch of outputs) {
        checkOutputs(kind, batch)
      }
      return { kind, batchMs, buildMs: (batchMs * 1000) / calls, calls }
    },
  },
})
