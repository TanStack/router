import { bench, describe, expect } from 'vitest'
import { defaultStringifySearch } from '../src'
import { nullReplaceEqualDeep } from '../src/utils'

const iterations = 1_000

// ---------------------------------------------------------------------------
// Search shapes: small / medium / large-nested
// ---------------------------------------------------------------------------

const small = { page: 1 }

const medium: Record<string, unknown> = {
  page: 1,
  tab: 'specs',
  filter: 'available',
  sort: 'newest',
  desc: true,
  limit: 25,
  offset: 0,
  tags: ['hardware', 'featured'],
  range: 'last-30-days',
  view: 'grid',
}

function makeLarge(): Record<string, any> {
  const large: Record<string, any> = {}
  for (let i = 0; i < 40; i++) {
    large[`field${i}`] = i % 3 === 0 ? `value-${i}` : i
  }
  // Nested objects/arrays to exercise deep traversal
  large.filters = {
    category: ['a', 'b', 'c'],
    price: { min: 10, max: 500 },
    rating: { min: 3 },
  }
  large.sort = { by: 'name', dir: 'asc' }
  large.meta = { source: 'ui', nested: { deep: true, count: [1, 2, 3] } }
  // 40 scalars + 3 nested top-level keys = 43... add a few more flat ones
  large.extraA = 'x'
  large.extraB = false
  large.extraC = 9.5
  large.extraD = null
  large.extraE = ''
  large.extraF = 'y'
  large.extraG = 1
  return large
}

const large = makeLarge()
const largeUnequalChangedLeaf = makeLarge()
largeUnequalChangedLeaf.field7 = 'different'
const largeUnequalNewKey = makeLarge()
largeUnequalNewKey.brandNew = true

const mediumUnequal = { ...medium, page: 2 }
const smallUnequal = { page: 2 }

let benchmarkSink = 0
let benchmarkSinkObj: unknown

// ---------------------------------------------------------------------------
// Correctness verification before timing
// ---------------------------------------------------------------------------

// nullReplaceEqualDeep must return the previous reference for equal inputs
// and a fresh value for unequal ones.
expect(nullReplaceEqualDeep(small, { ...small })).toBe(small)
expect(nullReplaceEqualDeep(medium, { ...medium })).toBe(medium)
expect(nullReplaceEqualDeep(large, makeLarge())).toBe(large)
expect(nullReplaceEqualDeep(small, smallUnequal)).not.toBe(small)
expect(nullReplaceEqualDeep(medium, mediumUnequal)).not.toBe(medium)
expect(nullReplaceEqualDeep(large, largeUnequalChangedLeaf)).not.toBe(large)
expect(nullReplaceEqualDeep(large, largeUnequalNewKey)).not.toBe(large)

// Structural sharing: unchanged children are reused
const shared = nullReplaceEqualDeep(
  large,
  largeUnequalChangedLeaf,
) as typeof large
expect(shared.filters).toBe(large.filters)
expect(shared.sort).toBe(large.sort)
expect(shared.meta).toBe(large.meta)
expect(shared.field7).toBe('different')

// The hypothetical memoized flow must emit an identical searchStr to the
// current always-stringify flow.
const cachedSmallStr = defaultStringifySearch(small)
const cachedMediumStr = defaultStringifySearch(medium)
const cachedLargeStr = defaultStringifySearch(large)
expect(cachedSmallStr).toBe(defaultStringifySearch({ ...small }))
expect(cachedMediumStr).toBe(defaultStringifySearch({ ...medium }))
expect(cachedLargeStr).toBe(defaultStringifySearch(makeLarge()))

// ---------------------------------------------------------------------------
// Helpers modeling the two flows
// ---------------------------------------------------------------------------

/** Current production flow: deep structural compare + unconditional stringify. */
function currentFlow(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
) {
  const merged = nullReplaceEqualDeep(prev, next)
  const searchStr = defaultStringifySearch(merged)
  benchmarkSink = searchStr.length
  return merged
}

/**
 * Hypothetical flow: when the deep compare returns the previous reference,
 * reuse the previously computed searchStr instead of re-stringifying.
 */
function memoizedFlow(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
  prevSearchStr: string,
) {
  const merged = nullReplaceEqualDeep(prev, next)
  const searchStr = merged === prev ? prevSearchStr : defaultStringifySearch(merged)
  benchmarkSink = searchStr.length
  return merged
}

function batch(flow: () => void) {
  for (let index = 0; index < iterations; index++) {
    flow()
  }
}

// ---------------------------------------------------------------------------
// Benchmarks: nullReplaceEqualDeep alone
// ---------------------------------------------------------------------------

describe('nullReplaceEqualDeep', () => {
  bench('small equal ({page:1})', () => {
    batch(() => {
      benchmarkSinkObj = nullReplaceEqualDeep(small, { ...small })
    })
  })

  bench('small unequal', () => {
    batch(() => {
      benchmarkSinkObj = nullReplaceEqualDeep(small, smallUnequal)
    })
  })

  bench('medium equal (~10 keys)', () => {
    batch(() => {
      benchmarkSinkObj = nullReplaceEqualDeep(medium, { ...medium })
    })
  })

  bench('medium unequal (one leaf changed)', () => {
    batch(() => {
      benchmarkSinkObj = nullReplaceEqualDeep(medium, mediumUnequal)
    })
  })

  bench('large equal (~50 keys, nested)', () => {
    batch(() => {
      benchmarkSinkObj = nullReplaceEqualDeep(large, makeLarge())
    })
  })

  bench('large unequal (one nested leaf changed)', () => {
    batch(() => {
      benchmarkSinkObj = nullReplaceEqualDeep(large, largeUnequalChangedLeaf)
    })
  })

  bench('large unequal (new key)', () => {
    batch(() => {
      benchmarkSinkObj = nullReplaceEqualDeep(large, largeUnequalNewKey)
    })
  })

  bench('identical reference (fast path)', () => {
    batch(() => {
      benchmarkSinkObj = nullReplaceEqualDeep(large, large)
    })
  })
})

// ---------------------------------------------------------------------------
// Benchmarks: defaultStringifySearch alone
// ---------------------------------------------------------------------------

describe('defaultStringifySearch', () => {
  bench('small ({page:1})', () => {
    batch(() => {
      benchmarkSink = defaultStringifySearch(small).length
    })
  })

  bench('medium (~10 keys mixed types)', () => {
    batch(() => {
      benchmarkSink = defaultStringifySearch(medium).length
    })
  })

  bench('large (~50 keys nested)', () => {
    batch(() => {
      benchmarkSink = defaultStringifySearch(large).length
    })
  })
})

// ---------------------------------------------------------------------------
// Benchmarks: full navigation-search flow, current vs memoized
// ---------------------------------------------------------------------------

describe('flow comparison - same-search navigation', () => {
  bench('current: small equal', () => {
    batch(() => currentFlow(small, { ...small }))
  })

  bench('memoized: small equal', () => {
    batch(() => memoizedFlow(small, { ...small }, cachedSmallStr))
  })

  bench('current: medium equal', () => {
    batch(() => currentFlow(medium, { ...medium }))
  })

  bench('memoized: medium equal', () => {
    batch(() => memoizedFlow(medium, { ...medium }, cachedMediumStr))
  })

  bench('current: large equal', () => {
    batch(() => currentFlow(large, makeLarge()))
  })

  bench('memoized: large equal', () => {
    batch(() => memoizedFlow(large, makeLarge(), cachedLargeStr))
  })
})

describe('flow comparison - changed-search navigation', () => {
  bench('current: medium unequal', () => {
    batch(() => currentFlow(medium, mediumUnequal))
  })

  bench('memoized: medium unequal', () => {
    batch(() => memoizedFlow(medium, mediumUnequal, cachedMediumStr))
  })

  bench('current: large unequal (leaf change)', () => {
    batch(() => currentFlow(large, largeUnequalChangedLeaf))
  })

  bench('memoized: large unequal (leaf change)', () => {
    batch(() =>
      memoizedFlow(large, largeUnequalChangedLeaf, cachedLargeStr),
    )
  })
})

void benchmarkSink
void benchmarkSinkObj
