import { describe, expect, it } from 'vitest'
import { createSieveCache } from '../src/sieve-cache'

describe('Sieve Cache', () => {
  it('stores and reads back values', () => {
    const cache = createSieveCache<string, number>(3)
    cache.set('a', 1)
    cache.set('b', 2)
    expect(cache.get('a')).toBe(1)
    expect(cache.get('b')).toBe(2)
    expect(cache.get('c')).toBeUndefined()
  })

  it('evicts the oldest unvisited entry', () => {
    const cache = createSieveCache<string, number>(3)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)
    cache.set('d', 4) // nothing was visited, 'a' is evicted
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe(2)
    expect(cache.get('c')).toBe(3)
    expect(cache.get('d')).toBe(4)
  })

  it('keeps visited entries for one more sweep', () => {
    const cache = createSieveCache<string, number>(3)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)
    cache.get('a') // 'a' is now visited
    cache.set('d', 4) // hand clears 'a', evicts 'b'
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('a')).toBe(1)
    expect(cache.get('c')).toBe(3)
    expect(cache.get('d')).toBe(4)
  })

  it('drops a previously visited entry on the next sweep', () => {
    const cache = createSieveCache<string, number>(3)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)
    cache.get('a')
    cache.set('d', 4) // 'a' visited bit cleared, 'b' evicted, hand at 'c'
    cache.set('e', 5) // hand resumes at 'c' (unvisited) -> 'c' evicted
    expect(cache.get('c')).toBeUndefined()
    expect(cache.get('a')).toBe(1)
    expect(cache.get('d')).toBe(4)
    expect(cache.get('e')).toBe(5)
  })

  it('wraps the hand around to the oldest entry', () => {
    const cache = createSieveCache<string, number>(3)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)
    // everything is visited: the sweep clears every bit, wraps around, and
    // evicts the oldest entry
    cache.get('a')
    cache.get('b')
    cache.get('c')
    cache.set('d', 4)
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe(2)
    expect(cache.get('c')).toBe(3)
    expect(cache.get('d')).toBe(4)
  })

  it('keeps evicting correctly once the hand reaches the newest entry', () => {
    const cache = createSieveCache<string, number>(3)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)
    cache.set('d', 4) // evicts 'a', hand -> 'b'
    cache.set('e', 5) // evicts 'b', hand -> 'c'
    cache.set('f', 6) // evicts 'c', hand -> 'd'
    cache.set('g', 7) // evicts 'd', hand -> 'e'
    expect(cache.get('d')).toBeUndefined()
    expect(cache.get('e')).toBe(5)
    expect(cache.get('f')).toBe(6)
    expect(cache.get('g')).toBe(7)
  })

  it('works with a capacity of one', () => {
    const cache = createSieveCache<string, number>(1)
    cache.set('a', 1)
    expect(cache.get('a')).toBe(1)
    cache.set('b', 2)
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe(2)
    cache.set('c', 3)
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('c')).toBe(3)
  })

  it('overwrites an existing key without evicting', () => {
    const cache = createSieveCache<string, number>(3)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)
    cache.set('a', 10)
    expect(cache.get('a')).toBe(10)
    expect(cache.get('b')).toBe(2)
    expect(cache.get('c')).toBe(3)
  })

  it('clears', () => {
    const cache = createSieveCache<string, number>(3)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.get('a')
    cache.clear()
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBeUndefined()
    // the cache is usable again, and the hand starts over
    cache.set('c', 3)
    cache.set('d', 4)
    cache.set('e', 5)
    cache.set('f', 6)
    expect(cache.get('c')).toBeUndefined()
    expect(cache.get('d')).toBe(4)
    expect(cache.get('f')).toBe(6)
  })

  it('never exceeds its capacity', () => {
    const max = 8
    const cache = createSieveCache<number, number>(max)
    const live = new Set<number>()
    for (let i = 0; i < 500; i++) {
      const key = (i * 7) % 40
      if (cache.get(key) === undefined) {
        cache.set(key, key)
      }
      live.add(key)
      let present = 0
      for (const k of live) {
        if (cache.get(k) !== undefined) present++
      }
      expect(present).toBeLessThanOrEqual(max)
    }
  })
})
