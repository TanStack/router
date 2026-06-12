import { bench, describe, expect } from 'vitest'
import {
  isPlainObject,
  nullReplaceEqualDeep,
  replaceEqualDeep,
} from '../src/utils'

const hasOwn = Object.prototype.hasOwnProperty
const isEnumerable = Object.prototype.propertyIsEnumerable

function baselineIsPlainArray(value: unknown): value is Array<unknown> {
  return Array.isArray(value) && value.length === Object.keys(value).length
}

function baselineGetEnumerableOwnKeys(o: object) {
  const names = Object.getOwnPropertyNames(o)

  for (const name of names) {
    if (!isEnumerable.call(o, name)) {
      return false
    }
  }

  const symbols = Object.getOwnPropertySymbols(o)

  if (symbols.length === 0) {
    return names
  }

  const keys: Array<string | symbol> = names
  for (const symbol of symbols) {
    if (!isEnumerable.call(o, symbol)) {
      return false
    }
    keys.push(symbol)
  }
  return keys
}

function baselineReplaceEqualDeep(
  prev: any,
  next: any,
  makeObj = () => ({}),
  depth = 0,
): any {
  if (prev === next) {
    return prev
  }

  if (depth > 500) {
    return next
  }

  const array = baselineIsPlainArray(prev) && baselineIsPlainArray(next)

  if (!array && !(isPlainObject(prev) && isPlainObject(next))) {
    return next
  }

  const prevItems = array ? prev : baselineGetEnumerableOwnKeys(prev)
  if (!prevItems) {
    return next
  }
  const nextItems = array ? next : baselineGetEnumerableOwnKeys(next)
  if (!nextItems) {
    return next
  }
  const prevSize = prevItems.length
  const nextSize = nextItems.length
  const copy: any = array ? new Array(nextSize) : makeObj()

  let equalItems = 0

  for (let i = 0; i < nextSize; i++) {
    const key = array ? i : (nextItems[i] as any)
    const p = prev[key]
    const n = next[key]

    if (p === n) {
      copy[key] = p
      if (array ? i < prevSize : hasOwn.call(prev, key)) {
        equalItems++
      }
      continue
    }

    if (
      p === null ||
      n === null ||
      typeof p !== 'object' ||
      typeof n !== 'object'
    ) {
      copy[key] = n
      continue
    }

    const v = baselineReplaceEqualDeep(p, n, makeObj, depth + 1)
    copy[key] = v
    if (v === p) {
      equalItems++
    }
  }

  return prevSize === nextSize && equalItems === prevSize ? prev : copy
}

const symbolKey = Symbol('meta')

const locationPrev = {
  pathname: '/users/123',
  search: { tab: 'settings', sort: 'asc' },
  hash: '#profile',
  state: { key: 'abc123', __TSR_key: 'abc123' },
}

const locationNext = {
  pathname: '/users/123',
  search: { tab: 'settings', sort: 'asc' },
  hash: '#profile',
  state: { key: 'abc123', __TSR_key: 'abc123' },
}

const changedLocationNext = {
  ...locationNext,
  search: { tab: 'activity', sort: 'asc' },
}

const matchesPrev = [
  { id: '1', routeId: '__root__', pathname: '/', params: {} },
  { id: '2', routeId: '/users', pathname: '/users', params: {} },
  {
    id: '3',
    routeId: '/users/$userId',
    pathname: '/users/123',
    params: { userId: '123' },
  },
]

const matchesNext = [
  { id: '1', routeId: '__root__', pathname: '/', params: {} },
  { id: '2', routeId: '/users', pathname: '/users', params: {} },
  {
    id: '3',
    routeId: '/users/$userId',
    pathname: '/users/123',
    params: { userId: '123' },
  },
]

const longMatchesPrev = Array.from({ length: 60 }, (_, i) => ({
  id: String(i),
  routeId: i === 0 ? '__root__' : `/routes/${i}`,
  pathname: `/routes/${i}`,
  params: { id: String(i) },
  loaderDeps: { page: i, filter: 'all' },
  loaderData: { user: { id: String(i), name: `User ${i}` } },
}))

const longMatchesNext = longMatchesPrev.map((match) => ({
  ...match,
  params: { ...match.params },
  loaderDeps: { ...match.loaderDeps },
  loaderData: { user: { ...match.loaderData.user } },
}))

const longMatchesChangedNext = longMatchesNext.map((match, i) =>
  i === longMatchesNext.length - 1
    ? {
        ...match,
        loaderData: { user: { ...match.loaderData.user, name: 'Changed' } },
      }
    : match,
)

const symbolPrev = { routeId: '/users/$userId', [symbolKey]: { stable: true } }
const symbolNext = { routeId: '/users/$userId', [symbolKey]: { stable: true } }

const nonEnumerablePrev: Record<string, number> = { visible: 1 }
Object.defineProperty(nonEnumerablePrev, 'hidden', {
  value: 2,
  enumerable: false,
})
const nonEnumerableNext: Record<string, number> = { visible: 1 }
Object.defineProperty(nonEnumerableNext, 'hidden', {
  value: 2,
  enumerable: false,
})

const primitivePrev = { a: 1, b: 2, c: null, d: 'same', e: undefined }
const primitiveNext = { a: 1, b: 3, c: undefined, d: 'same', e: null }

const wideSearchPrev = Object.fromEntries(
  Array.from({ length: 80 }, (_, i) => [`key${i}`, `value${i}`]),
)
const wideSearchNext = { ...wideSearchPrev, key79: 'changed' }

const nullSearchPrev = Object.create(null)
const nullSearchNext = Object.create(null)
for (let i = 0; i < 50; i++) {
  nullSearchPrev[`key${i}`] = `value${i}`
  nullSearchNext[`key${i}`] = `value${i}`
}
nullSearchNext.key49 = 'changed'

const mixedCases = [
  [locationPrev, locationNext],
  [locationPrev, changedLocationNext],
  [matchesPrev, matchesNext],
  [longMatchesPrev, longMatchesNext],
  [longMatchesPrev, longMatchesChangedNext],
  [primitivePrev, primitiveNext],
  [wideSearchPrev, wideSearchNext],
  [symbolPrev, symbolNext],
  [nonEnumerablePrev, nonEnumerableNext],
] as const

const nullCases = [[nullSearchPrev, nullSearchNext]] as const

for (const [prev, next] of mixedCases) {
  const baseline = baselineReplaceEqualDeep(prev, next)
  const current = replaceEqualDeep(prev, next)

  expect(current).toEqual(baseline)
  expect(current === prev).toBe(baseline === prev)
}

for (const [prev, next] of nullCases) {
  const baseline = baselineReplaceEqualDeep(prev, next, () =>
    Object.create(null),
  )
  const current = nullReplaceEqualDeep(prev, next)

  expect(current).toEqual(baseline)
  expect(Object.getPrototypeOf(current)).toBe(null)
}

let sink: unknown

function runBatch(
  fn: (prev: any, next: any) => any,
  cases: ReadonlyArray<readonly [unknown, unknown]>,
) {
  for (let i = 0; i < 200; i++) {
    for (const [prev, next] of cases) {
      sink = fn(prev, next)
    }
  }
}

describe('replaceEqualDeep', () => {
  bench('baseline mixed router state batch', () => {
    runBatch(baselineReplaceEqualDeep, mixedCases)
  })

  bench('current mixed router state batch', () => {
    runBatch(replaceEqualDeep, mixedCases)
  })

  bench('baseline plain object equal batch', () => {
    runBatch(baselineReplaceEqualDeep, [[locationPrev, locationNext]])
  })

  bench('current plain object equal batch', () => {
    runBatch(replaceEqualDeep, [[locationPrev, locationNext]])
  })

  bench('baseline array matches equal batch', () => {
    runBatch(baselineReplaceEqualDeep, [[matchesPrev, matchesNext]])
  })

  bench('current array matches equal batch', () => {
    runBatch(replaceEqualDeep, [[matchesPrev, matchesNext]])
  })

  bench('baseline long matches mixed batch', () => {
    runBatch(baselineReplaceEqualDeep, [
      [longMatchesPrev, longMatchesNext],
      [longMatchesPrev, longMatchesChangedNext],
    ])
  })

  bench('current long matches mixed batch', () => {
    runBatch(replaceEqualDeep, [
      [longMatchesPrev, longMatchesNext],
      [longMatchesPrev, longMatchesChangedNext],
    ])
  })

  bench('baseline primitive mismatch batch', () => {
    runBatch(baselineReplaceEqualDeep, [[primitivePrev, primitiveNext]])
  })

  bench('current primitive mismatch batch', () => {
    runBatch(replaceEqualDeep, [[primitivePrev, primitiveNext]])
  })

  bench('baseline null search batch', () => {
    runBatch(
      (prev, next) =>
        baselineReplaceEqualDeep(prev, next, () => Object.create(null)),
      nullCases,
    )
  })

  bench('current null search batch', () => {
    runBatch(nullReplaceEqualDeep, nullCases)
  })
})

void sink
