import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import type { ParsedLocation } from '@tanstack/react-router'

type BuildCase = 'fresh-build' | 'warm-hit' | 'validated-build'

const batchSize = 1000
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
  return Array.from({ length: batchSize }, (_, index) => ({
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
    outputs.length !== batchSize ||
    router.state.location.pathname !== '/source'
  ) {
    throw new Error(`${kind}: incorrect batch or changed source`)
  }
}

Object.assign(window, {
  buildLocationBenchmark: {
    ready,
    batchSize,
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
      // Fresh destinations and result storage are allocated outside the timer.
      // The measured region contains exactly 1,000 public builder calls.
      const owned = kind === 'warm-hit' ? warm : destinations(kind)
      const outputs = new Array<ParsedLocation>(batchSize)
      const started = performance.now()
      for (let index = 0; index < batchSize; index++) {
        outputs[index] = router.buildLocation(owned[index]!)
      }
      const buildMs = performance.now() - started
      checkOutputs(kind, outputs)
      return { kind, buildMs, calls: batchSize }
    },
  },
})
