/**
 * A host read of a module that throws is no fact: whichever reader asked
 * (`get`, `marker`), the next ask reads the module again and gets its text.
 * Source: Astra's confirmation of the dependency summaries' review fixes
 * (2026-11-27): after a throwing read, `marker` kept the rejected read, so
 * two asks gave two errors from one host read.
 */
import { describe, expect, it } from 'vitest'
import { RawFactsCache } from '../src/compiler'

const id = '/app/node_modules/dep/index.js'
const marked = `import '@tanstack/react-start/server-only'\nexport const a = 1\n`

/** A cache whose host's first read of the module throws, and later reads return `text`. */
function failingOnce(text: string) {
  let reads = 0
  const cache = new RawFactsCache({
    readFile: async () => {
      reads++
      if (reads === 1) {
        throw new Error('EIO')
      }
      return text
    },
    loadVirtual: async () => null,
    markerSpecifiers: { '@tanstack/react-start/server-only': 'server-only' },
  })
  return { cache, reads: () => reads }
}

type Reader = (cache: RawFactsCache) => Promise<unknown>
const readers: Record<string, Reader> = {
  marker: (cache) => cache.marker(id, 'client'),
  get: (cache) => cache.get(id, 'client'),
}

describe('a host read that throws once, then succeeds', () => {
  it.each([
    ['marker', 'marker'],
    ['marker', 'get'],
    ['get', 'marker'],
    ['get', 'get'],
  ])(
    '%s, then %s: the second ask reads the module again',
    async (first, second) => {
      const { cache, reads } = failingOnce(marked)
      await expect(readers[first]!(cache)).rejects.toThrow('EIO')
      await readers[second]!(cache)
      expect(reads()).toBe(2)
      expect(await cache.marker(id, 'client')).toBe('server-only')
    },
  )
})
