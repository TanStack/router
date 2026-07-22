import { bench, describe } from 'vitest'
import { createLRUCache } from '../src/lru-cache'

const keys1000 = Array.from({ length: 1000 }, (_, i) => `key-${i}`)
const missing1000 = Array.from({ length: 1000 }, (_, i) => `missing-${i}`)
const new1000 = Array.from({ length: 1000 }, (_, i) => `new-${i}`)

function fillCache(
  cache: { set: (key: string, value: number) => void },
  count: number,
) {
  for (let i = 0; i < count; i++) {
    cache.set(keys1000[i]!, i)
  }
}

describe('LRU cache', () => {
  bench('newest hit', () => {
    const cache = createLRUCache<string, number>(1000)
    fillCache(cache, 1000)
    for (let i = 0; i < 1000; i++) {
      cache.get(keys1000[999]!)
    }
  })

  bench('rotating hit', () => {
    const cache = createLRUCache<string, number>(1000)
    fillCache(cache, 1000)
    for (let i = 0; i < 1000; i++) {
      cache.get(keys1000[i]!)
    }
  })

  bench('update newest while full', () => {
    const cache = createLRUCache<string, number>(1000)
    fillCache(cache, 1000)
    for (let i = 0; i < 1000; i++) {
      cache.set(keys1000[999]!, i)
    }
  })

  bench('update oldest while full', () => {
    const cache = createLRUCache<string, number>(1000)
    fillCache(cache, 1000)
    for (let i = 0; i < 1000; i++) {
      cache.set(keys1000[0]!, i)
    }
  })

  bench('update rotating entries while full', () => {
    const cache = createLRUCache<string, number>(1000)
    fillCache(cache, 1000)
    for (let i = 0; i < 1000; i++) {
      cache.set(keys1000[i]!, i + 1)
    }
  })

  bench('miss-heavy get', () => {
    const cache = createLRUCache<string, number>(64)
    fillCache(cache, 64)
    for (let i = 0; i < 1000; i++) {
      cache.get(missing1000[i]!)
    }
  })

  bench('insert churn', () => {
    const cache = createLRUCache<string, number>(64)
    fillCache(cache, 64)
    for (let i = 0; i < 1000; i++) {
      cache.set(new1000[i]!, i)
    }
  })

  bench('mixed workload', () => {
    const cache = createLRUCache<string, number>(64)
    fillCache(cache, 64)
    for (let i = 0; i < 1000; i++) {
      cache.get(keys1000[i % 8]!)
      if (i % 10 === 0) {
        cache.get(missing1000[i]!)
      }
      if (i % 20 === 0) {
        cache.set(new1000[i]!, i)
      }
    }
  })
})
