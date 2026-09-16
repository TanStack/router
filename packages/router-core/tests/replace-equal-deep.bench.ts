import { bench, describe, expect } from 'vitest'
import {
  createNull,
  deepEqual,
  isPlainObject,
  nullReplaceEqualDeep,
  replaceEqualDeep,
} from '../src/utils'

// Shapes the router feeds these helpers on every Link build / navigation.
const empty = {}
const emptyNull = createNull()
const search = { tab: 'specs', page: 2, sort: 'newest', filter: 'available' }
const searchCopy = { ...search }
const searchChanged = { ...search, page: 3 }
// `?constructor=foo` decodes to an own `constructor` key on a null-proto record.
const searchWithConstructorKey = Object.assign(createNull(), {
  constructor: 'foo',
  page: 2,
})
const searchWithConstructorKeyCopy = Object.assign(createNull(), {
  constructor: 'foo',
  page: 2,
})
class Instance {
  a = 1
}
const instance = new Instance()
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
const listShared = list.map((item, index) => (index === 10 ? { id: -1 } : item))
const wide = Object.fromEntries(
  Array.from({ length: 12 }, (_, index) => [`key${index}`, `value${index}`]),
)
const wideChanged = { ...wide, key7: 'changed' }
const searchAllChanged = {
  tab: 'other',
  page: 3,
  sort: 'oldest',
  filter: 'sold',
}
const searchReordered = {
  filter: 'available',
  sort: 'newest',
  page: 2,
  tab: 'specs',
}
const searchSubset = { tab: 'specs', page: 2, sort: 'newest' }
const wider = Object.fromEntries(
  Array.from({ length: 64 }, (_, index) => [`key${index}`, `value${index}`]),
)
const widerChangedLast = { ...wider, key63: 'changed' }
const numbers = Array.from({ length: 1024 }, (_, index) => index)
const numbersCopy = [...numbers]
const numbersChangedLast = numbers.map((n, index) => (index === 1023 ? -1 : n))

expect(replaceEqualDeep(empty, {})).toBe(empty)
expect(replaceEqualDeep(search, searchCopy)).toBe(search)
expect(replaceEqualDeep(search, searchChanged)).toStrictEqual(searchChanged)
expect(replaceEqualDeep(nested, nestedCopy)).toBe(nested)
expect(replaceEqualDeep(nested, nestedLeafChanged).ids).toBe(nested.ids)
expect(replaceEqualDeep(list, listCopy)).toBe(list)
expect(replaceEqualDeep(list, listChanged)[3]).toBe(list[3])
expect(replaceEqualDeep(wide, wideChanged)).toStrictEqual(wideChanged)
expect(replaceEqualDeep(list, listShared)[3]).toBe(list[3])
expect(replaceEqualDeep(search, searchAllChanged)).toStrictEqual(
  searchAllChanged,
)
expect(replaceEqualDeep(search, searchReordered)).toBe(search)
expect(replaceEqualDeep(search, searchSubset)).toStrictEqual(searchSubset)
expect(replaceEqualDeep(wider, widerChangedLast)).toStrictEqual(
  widerChangedLast,
)
expect(replaceEqualDeep(numbers, numbersCopy)).toBe(numbers)
expect(replaceEqualDeep(numbers, numbersChangedLast)[1023]).toBe(-1)
expect(nullReplaceEqualDeep(emptyNull, {})).toBe(emptyNull)
expect(
  nullReplaceEqualDeep(searchWithConstructorKey, searchWithConstructorKeyCopy),
).toBe(searchWithConstructorKey)
expect(deepEqual(search, searchCopy, { partial: true })).toBe(true)
expect(isPlainObject(search)).toBe(true)
expect(isPlainObject(emptyNull)).toBe(true)
expect(isPlainObject(searchWithConstructorKey)).toBe(true)
expect(isPlainObject(instance)).toBe(false)

const iterations = 1_000
let sink: unknown

describe('isPlainObject', () => {
  bench('literal', () => {
    for (let i = 0; i < iterations; i++) {
      sink = isPlainObject(search)
    }
  })

  bench('null-proto record', () => {
    for (let i = 0; i < iterations; i++) {
      sink = isPlainObject(emptyNull)
    }
  })

  bench('null-proto record with a constructor key', () => {
    for (let i = 0; i < iterations; i++) {
      sink = isPlainObject(searchWithConstructorKey)
    }
  })

  bench('class instance', () => {
    for (let i = 0; i < iterations; i++) {
      sink = isPlainObject(instance)
    }
  })
})

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

  bench('equal null-proto search with a constructor key', () => {
    for (let i = 0; i < iterations; i++) {
      sink = nullReplaceEqualDeep(
        searchWithConstructorKey,
        searchWithConstructorKeyCopy,
      )
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

  bench('flat search with all leaves changed', () => {
    for (let i = 0; i < iterations; i++) {
      sink = replaceEqualDeep(search, searchAllChanged)
    }
  })

  bench('equal flat search with reordered keys', () => {
    for (let i = 0; i < iterations; i++) {
      sink = replaceEqualDeep(search, searchReordered)
    }
  })

  bench('flat search with a key removed', () => {
    for (let i = 0; i < iterations; i++) {
      sink = replaceEqualDeep(search, searchSubset)
    }
  })

  bench('array of shared objects with one changed item', () => {
    for (let i = 0; i < iterations; i++) {
      sink = replaceEqualDeep(list, listShared)
    }
  })

  bench('wider flat object (64 keys) with the last leaf changed', () => {
    for (let i = 0; i < iterations; i++) {
      sink = replaceEqualDeep(wider, widerChangedLast)
    }
  })

  bench('equal long primitive array', () => {
    for (let i = 0; i < iterations; i++) {
      sink = replaceEqualDeep(numbers, numbersCopy)
    }
  })

  bench('long primitive array with the last item changed', () => {
    for (let i = 0; i < iterations; i++) {
      sink = replaceEqualDeep(numbers, numbersChangedLast)
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
