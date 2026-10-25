import { describe, expect, it } from 'vitest'
import { RawFactsCache } from '../src/compiler'

describe('RawFactsCache (lane B)', () => {
  it('does not publish a read in flight when the file changes meanwhile', async () => {
    let text = 'export const a = 1\n'
    let release: (() => void) | null = null
    const cache = new RawFactsCache({
      readFile: () =>
        new Promise<string>((resolve) => {
          const current = text
          release = () => resolve(current)
        }),
      loadVirtual: () => Promise.resolve(null),
    })
    const first = cache.get('/app/a.ts')
    // the file changes while the first read is pending; the host reports it
    text = 'export const a = 2\n'
    cache.markStale('/app/a.ts')
    release!()
    await first
    // the next read sees the new text, not the superseded read's
    const second: Promise<unknown> = cache.get('/app/a.ts')
    release!()
    const facts = (await second) as { rawRevision: string }
    const superseded = (await first) as { rawRevision: string }
    expect(facts.rawRevision).not.toBe(superseded.rawRevision)
    expect(cache.peekRevision('/app/a.ts')?.revision).toBe(facts.rawRevision)
    expect(cache.peekRevision('/app/a.ts')?.stale).toBe(false)
  })
})
