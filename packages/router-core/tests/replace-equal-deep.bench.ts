import { bench, describe, expect } from 'vitest'
import {
  createNull,
  deepEqual,
  nullReplaceEqualDeep,
  replaceEqualDeep,
} from '../src/utils'

// Shapes the router feeds these helpers on every Link build / navigation.
const empty = {}
const emptyNull = createNull()
const search = { tab: 'specs', page: 2, sort: 'newest', filter: 'available' }
const searchCopy = { ...search }
const searchChanged = { ...search, page: 3 }
const nested = {
  tab: 'specs',
  filters: { category: 'hardware', available: true },
  ids: [1, 2, 3, 4],
}
const nestedCopy = {
  tab: 'specs',
  filters: { category: 'hardware', available: true },
  ids: [1, 2, 3, 4],
}
const nestedLeafChanged = {
  tab: 'specs',
  filters: { category: 'software', available: true },
  ids: [1, 2, 3, 4],
}
const list = Array.from({ length: 16 }, (_, index) => ({ id: index }))
const listCopy = list.map((item) => ({ ...item }))
const listChanged = list.map((item, index) =>
  index === 10 ? { id: -1 } : { ...item },
)
const wide = Object.fromEntries(
  Array.from({ length: 12 }, (_, index) => [`key${index}`, `value${index}`]),
)
const wideChanged = { ...wide, key7: 'changed' }

expect(replaceEqualDeep(empty, {})).toBe(empty)
expect(replaceEqualDeep(search, searchCopy)).toBe(search)
expect(replaceEqualDeep(search, searchChanged)).toStrictEqual(searchChanged)
expect(replaceEqualDeep(nested, nestedCopy)).toBe(nested)
expect(replaceEqualDeep(nested, nestedLeafChanged).ids).toBe(nested.ids)
expect(replaceEqualDeep(list, listCopy)).toBe(list)
expect(replaceEqualDeep(list, listChanged)[3]).toBe(list[3])
expect(replaceEqualDeep(wide, wideChanged)).toStrictEqual(wideChanged)
expect(nullReplaceEqualDeep(emptyNull, {})).toBe(emptyNull)
expect(deepEqual(search, searchCopy, { partial: true })).toBe(true)

const iterations = 1_000
let sink: unknown

describe('replaceEqualDeep', () => {
  bench('equal empty objects', () => {
    for (let i = 0; i < iterations; i++) {
      sink = replaceEqualDeep(empty, {})
    }
  })

  bench('equal empty null-proto objects', () => {
    for (let i = 0; i < iterations; i++) {
      sink = nullReplaceEqualDeep(emptyNull, createNull())
    }
  })

  bench('equal flat search', () => {
    for (let i = 0; i < iterations; i++) {
      sink = replaceEqualDeep(search, searchCopy)
    }
  })

  bench('flat search with one changed leaf', () => {
    for (let i = 0; i < iterations; i++) {
      sink = replaceEqualDeep(search, searchChanged)
    }
  })

  bench('equal nested search', () => {
    for (let i = 0; i < iterations; i++) {
      sink = replaceEqualDeep(nested, nestedCopy)
    }
  })

  bench('nested search sharing unchanged subtrees', () => {
    for (let i = 0; i < iterations; i++) {
      sink = replaceEqualDeep(nested, nestedLeafChanged)
    }
  })

  bench('equal array of objects', () => {
    for (let i = 0; i < iterations; i++) {
      sink = replaceEqualDeep(list, listCopy)
    }
  })

  bench('array of objects with one changed item', () => {
    for (let i = 0; i < iterations; i++) {
      sink = replaceEqualDeep(list, listChanged)
    }
  })

  bench('wide flat object with one changed leaf', () => {
    for (let i = 0; i < iterations; i++) {
      sink = replaceEqualDeep(wide, wideChanged)
    }
  })

  bench('wide flat object with one changed leaf (null-proto)', () => {
    for (let i = 0; i < iterations; i++) {
      sink = nullReplaceEqualDeep(wide, wideChanged)
    }
  })
})

describe('deepEqual', () => {
  bench('equal empty objects', () => {
    for (let i = 0; i < iterations; i++) {
      sink = deepEqual(empty, {})
    }
  })

  bench('equal flat search (partial)', () => {
    for (let i = 0; i < iterations; i++) {
      sink = deepEqual(search, searchCopy, { partial: true })
    }
  })

  bench('nested search with one changed leaf', () => {
    for (let i = 0; i < iterations; i++) {
      sink = deepEqual(nested, nestedLeafChanged)
    }
  })
})

export { sink }
